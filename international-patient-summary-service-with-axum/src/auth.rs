//! Who may call the `/fhir` routes (spec §6.1): a bearer token from Keycloak, a PASETO
//! token, or both, decided by one policy ([`POLICY`]), with every allowed request
//! audited (S-AUDIT-1).
//!
//! The guard comes from Axa: `axa::keycloak` when Keycloak is configured (and PASETO
//! beside it, when that is too), `axa::paseto` when only PASETO is. A handler never
//! sees either: [`caller`] turns what the guard allowed into a [`Caller`].

use std::{collections::BTreeMap, sync::Arc};

use authentication_verifier::{ReloadableVerifier, Verifier};
use axa::{Environment, keycloak, paseto};
use axum::{
    Router,
    extract::{Request, State},
    middleware::{Next, from_fn_with_state},
    response::{IntoResponse, Response},
};

/// The prefix of this service's variables: `IPS_KEYCLOAK_URL`, `IPS_PASETO_KEYS_FILE`.
pub const PREFIX: &str = "IPS";

/// The entity policies see.
pub const ENTITY: &str = "ips_document";

/// The access policy (S-AUTH-3), first match wins: `access=read` reads, `write` also
/// stores, `admin` also deletes, each only if the request is audited; anything else,
/// reads included, is refused.
pub const POLICY: &str = include_str!("policy.json");

/// The obligation every allowed rule carries, which the handlers carry out.
pub const AUDIT: &str = "audit";

/// The Keycloak roles that grant access, unless `IPS_KEYCLOAK_ROLE_MAP` or
/// `IPS_KEYCLOAK_ROLE_MAP_FILE` says otherwise.
pub const DEFAULT_ROLE_MAP: &str = r#"{"ips-reader":{"access":["read"]},"ips-writer":{"access":["write"]},"ips-admin":{"access":["admin"]}}"#;

/// Who is calling: the token's subject and issuer, never a name or an email.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Caller {
    /// The token's `sub`; `None` only when authentication is off (development).
    pub subject: Option<String>,
    /// The token's `iss`.
    pub issuer: Option<String>,
}

impl Caller {
    /// The caller when authentication is off.
    #[must_use]
    pub fn unauthenticated() -> Self {
        Self {
            subject: None,
            issuer: None,
        }
    }
}

/// How this service authenticates, from the environment.
#[derive(Clone)]
pub enum Auth {
    /// Keycloak tokens, and PASETO ones too when configured.
    Keycloak {
        /// The guard.
        guard: Arc<keycloak::Guard>,
        /// The verifier, for readiness: traffic waits for the realm's keys.
        verifier: Arc<keycloak::KeycloakVerifier>,
    },
    /// PASETO tokens only.
    Paseto(Arc<paseto::Guard>),
    /// None: development and test only (S-SAFE-1).
    Off,
}

impl std::fmt::Debug for Auth {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        // Nothing about keys belongs in a log.
        f.write_str(match self {
            Self::Keycloak { .. } => "Auth::Keycloak",
            Self::Paseto(_) => "Auth::Paseto",
            Self::Off => "Auth::Off",
        })
    }
}

/// An error building the authenticator.
fn config_error(what: impl std::fmt::Display) -> axa::Error {
    axa::Error::string(&format!("authentication: {what}"))
}

/// The access policy, as the Keycloak guard reads it.
///
/// # Panics
///
/// Never: [`POLICY`] is checked by this crate's tests.
#[must_use]
#[expect(
    clippy::expect_used,
    reason = "src/policy.json is embedded at compile time and checked by this crate's tests"
)]
pub fn keycloak_policy() -> keycloak::Policy {
    keycloak::Policy::from_json(POLICY).expect("src/policy.json is a valid policy")
}

/// The access policy, as the PASETO guard reads it.
///
/// # Panics
///
/// Never: [`POLICY`] is checked by this crate's tests.
#[must_use]
#[expect(
    clippy::expect_used,
    reason = "src/policy.json is embedded at compile time and checked by this crate's tests"
)]
pub fn paseto_policy() -> authentication_verifier::Policy {
    authentication_verifier::Policy::from_json(POLICY).expect("src/policy.json is a valid policy")
}

/// The PASETO verifier from `IPS_PASETO_KEYS_FILE` (a key set of Ed25519 public keys),
/// `IPS_PASETO_ISSUER`, and `IPS_PASETO_AUDIENCE`, or `None` when the key file is unset.
///
/// # Errors
///
/// When the key file is set but unreadable or malformed, or the issuer or audience is
/// missing.
pub fn paseto_from_lookup(
    lookup: &dyn Fn(&str) -> Option<String>,
) -> axa::Result<Option<Verifier>> {
    let var = |name: &str| {
        lookup(&format!("{PREFIX}_PASETO_{name}"))
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty())
    };
    let Some(path) = var("KEYS_FILE") else {
        return Ok(None);
    };
    let issuer = var("ISSUER").ok_or_else(|| config_error("IPS_PASETO_ISSUER is not set"))?;
    let audience = var("AUDIENCE").ok_or_else(|| config_error("IPS_PASETO_AUDIENCE is not set"))?;
    let text = std::fs::read_to_string(&path)
        .map_err(|error| config_error(format!("IPS_PASETO_KEYS_FILE {path:?}: {error}")))?;
    let keys: serde_json::Value = serde_json::from_str(&text)
        .map_err(|error| config_error(format!("IPS_PASETO_KEYS_FILE {path:?}: {error}")))?;
    let verifier =
        Verifier::from_paseto_keys_value(&keys, &issuer, &audience).map_err(config_error)?;
    if verifier.key_count() == 0 {
        return Err(config_error("IPS_PASETO_KEYS_FILE holds no Ed25519 key"));
    }
    Ok(Some(verifier))
}

/// The Keycloak settings from `IPS_KEYCLOAK_*`, with [`DEFAULT_ROLE_MAP`] when no role
/// map is given, or `None` when `IPS_KEYCLOAK_URL` is unset.
///
/// # Errors
///
/// When Keycloak is configured but a variable is missing or malformed.
pub fn keycloak_from_lookup(
    lookup: &dyn Fn(&str) -> Option<String>,
) -> axa::Result<Option<keycloak::KeycloakSettings>> {
    let role_map = format!("{PREFIX}_KEYCLOAK_ROLE_MAP");
    let role_map_file = format!("{PREFIX}_KEYCLOAK_ROLE_MAP_FILE");
    let defaulted = |name: &str| {
        lookup(name).or_else(|| {
            (name == role_map && lookup(&role_map_file).is_none())
                .then(|| DEFAULT_ROLE_MAP.to_string())
        })
    };
    keycloak::settings_from_lookup(PREFIX, &defaulted).map_err(config_error)
}

/// Build the authenticator from the environment (S-AUTH-2), refusing to run without one
/// in any production-like environment (S-SAFE-1).
///
/// Call it inside a Tokio runtime: the Keycloak verifier fetches the realm's keys in the
/// background.
///
/// # Errors
///
/// A malformed configuration, or no authenticator outside development and test.
pub fn from_lookup(
    environment: &Environment,
    lookup: &dyn Fn(&str) -> Option<String>,
) -> axa::Result<Auth> {
    let paseto =
        paseto_from_lookup(lookup)?.map(|verifier| Arc::new(ReloadableVerifier::new(verifier)));
    let auth = match (keycloak_from_lookup(lookup)?, paseto) {
        (Some(settings), paseto) => {
            let verifier =
                Arc::new(keycloak::KeycloakVerifier::new(settings).map_err(config_error)?);
            let mut guard = keycloak::Guard::new(
                keycloak::GuardConfig::new(ENTITY),
                verifier.clone(),
                Arc::new(keycloak::ReloadablePolicy::new(keycloak_policy())),
            )
            .honouring([AUDIT]);
            if let Some(paseto) = paseto {
                guard = guard.with_paseto(Arc::new(PasetoForKeycloak(paseto)));
            }
            Auth::Keycloak {
                guard: Arc::new(guard),
                verifier,
            }
        }
        (None, Some(paseto)) => Auth::Paseto(Arc::new(
            paseto::Guard::new(
                paseto::GuardConfig::new(ENTITY),
                paseto,
                Arc::new(authentication_verifier::ReloadablePolicy::new(
                    paseto_policy(),
                )),
            )
            .honouring([AUDIT]),
        )),
        (None, None) => Auth::Off,
    };
    if matches!(auth, Auth::Off) && environment.is_production_like() {
        return Err(axa::Error::string(
            "this service stores patient data and refuses to serve without authentication \
             outside development and test: set IPS_KEYCLOAK_URL or IPS_PASETO_KEYS_FILE \
             (spec §6)",
        ));
    }
    if matches!(auth, Auth::Off) {
        tracing::warn!(
            "authentication is off: every /fhir route is open (development and test only)"
        );
    }
    Ok(auth)
}

/// [`from_lookup`] over the process environment.
///
/// # Errors
///
/// See [`from_lookup`].
pub fn from_env(environment: &Environment) -> axa::Result<Auth> {
    from_lookup(environment, &|name| std::env::var(name).ok())
}

/// Lets the Keycloak guard accept PASETO tokens too, under the same policy.
struct PasetoForKeycloak(Arc<ReloadableVerifier>);

impl keycloak::PasetoVerifier for PasetoForKeycloak {
    fn verify(&self, token: &str) -> Result<keycloak::Claims, keycloak::VerifyError> {
        let claims = self
            .0
            .current()
            .verify(token)
            .map_err(|error| keycloak::VerifyError::Keycloak(format!("paseto: {error}")))?;
        // The two crates' claims are the same contract, field for field.
        serde_json::to_value(claims)
            .and_then(serde_json::from_value)
            .map_err(|error| keycloak::VerifyError::Claim(format!("paseto claims: {error}")))
    }
}

impl Auth {
    /// Put the guard, and [`caller`] after it, on `router`.
    pub fn layer(&self, router: Router) -> Router {
        let router = router.layer(from_fn_with_state(self.clone(), caller));
        match self {
            Self::Keycloak { guard, .. } => {
                router.layer(from_fn_with_state(guard.clone(), keycloak::middleware))
            }
            Self::Paseto(guard) => {
                router.layer(from_fn_with_state(guard.clone(), paseto::middleware))
            }
            Self::Off => router,
        }
    }

    /// Readiness for the authenticator, when it has one that can be not ready yet.
    #[must_use]
    pub fn keycloak(&self) -> Option<Arc<keycloak::KeycloakVerifier>> {
        match self {
            Self::Keycloak { verifier, .. } => Some(verifier.clone()),
            _ => None,
        }
    }
}

/// Middleware after the guard: record who is calling as a [`Caller`]. A request the
/// guard decided gets one from its claims; with authentication off, every request is
/// [`Caller::unauthenticated`]. Anything else (a public path) gets none, so a handler
/// that needs a caller there fails closed.
async fn caller(State(auth): State<Auth>, mut request: Request, next: Next) -> Response {
    let found = match &auth {
        Auth::Keycloak { .. } => request
            .extensions()
            .get::<keycloak::Allowed>()
            .map(|allowed| (allowed.claims.sub.clone(), allowed.claims.iss.clone())),
        Auth::Paseto(_) => request
            .extensions()
            .get::<paseto::Allowed>()
            .map(|allowed| (allowed.claims.sub.clone(), allowed.claims.iss.clone())),
        Auth::Off => {
            request.extensions_mut().insert(Caller::unauthenticated());
            return next.run(request).await;
        }
    };
    if let Some((subject, issuer)) = found {
        request.extensions_mut().insert(Caller {
            subject: Some(subject),
            issuer: Some(issuer),
        });
    }
    next.run(request).await.into_response()
}

/// The attributes a Keycloak role grants under [`DEFAULT_ROLE_MAP`].
///
/// # Panics
///
/// Never: the map is checked by this crate's tests.
#[must_use]
#[expect(
    clippy::expect_used,
    reason = "DEFAULT_ROLE_MAP is embedded at compile time and checked by this crate's tests"
)]
pub fn default_role_map() -> BTreeMap<String, BTreeMap<String, Vec<String>>> {
    serde_json::from_str(DEFAULT_ROLE_MAP).expect("DEFAULT_ROLE_MAP is valid JSON")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn claims(access: &[&str]) -> keycloak::Claims {
        let mut attrs = BTreeMap::new();
        if !access.is_empty() {
            attrs.insert(
                "access".to_string(),
                access.iter().map(ToString::to_string).collect(),
            );
        }
        keycloak::Claims {
            sub: "s".into(),
            email: String::new(),
            name: String::new(),
            iss: "i".into(),
            aud: "a".into(),
            exp: 0,
            iat: 0,
            nbf: None,
            sid: String::new(),
            scope: Vec::new(),
            roles: Vec::new(),
            attrs,
        }
    }

    #[test]
    fn the_policy_grants_by_access_and_refuses_the_rest_reads_included() {
        use keycloak::Action::{Delete, Read, Write};
        let policy = keycloak_policy();
        let allowed =
            |access: &[&str], action| policy.evaluate(&claims(access), action, ENTITY).allowed;
        for (access, read, write, delete) in [
            (&[][..], false, false, false),
            (&["read"][..], true, false, false),
            (&["write"][..], true, true, false),
            (&["admin"][..], true, true, true),
            (&["other"][..], false, false, false),
        ] {
            assert_eq!(allowed(access, Read), read, "{access:?} read");
            assert_eq!(allowed(access, Write), write, "{access:?} write");
            assert_eq!(allowed(access, Delete), delete, "{access:?} delete");
        }
        let decision = policy.evaluate(&claims(&["read"]), Read, ENTITY);
        assert_eq!(decision.obligations, vec![AUDIT.to_string()]);
    }

    #[test]
    fn both_guards_read_the_same_policy() {
        assert_eq!(paseto_policy().rules.len(), keycloak_policy().rules.len());
        assert_eq!(default_role_map().len(), 3);
    }

    #[test]
    fn production_refuses_to_run_without_an_authenticator() {
        let none = |_: &str| None;
        assert!(from_lookup(&Environment::Production, &none).is_err());
        assert!(matches!(
            from_lookup(&Environment::Development, &none),
            Ok(Auth::Off)
        ));
        assert!(matches!(
            from_lookup(&Environment::Test, &none),
            Ok(Auth::Off)
        ));
    }

    #[test]
    fn a_half_configured_authenticator_is_refused() {
        let paseto_without_issuer =
            |name: &str| (name == "IPS_PASETO_KEYS_FILE").then(|| "/nonexistent".to_string());
        assert!(from_lookup(&Environment::Development, &paseto_without_issuer).is_err());
        let keycloak_without_realm =
            |name: &str| (name == "IPS_KEYCLOAK_URL").then(|| "http://127.0.0.1:1".to_string());
        assert!(from_lookup(&Environment::Development, &keycloak_without_realm).is_err());
    }

    #[test]
    fn the_default_role_map_applies_only_when_none_is_given() {
        let lookup = |name: &str| match name {
            "IPS_KEYCLOAK_URL" => Some("http://127.0.0.1:1".to_string()),
            "IPS_KEYCLOAK_REALM" => Some("ips".to_string()),
            "IPS_KEYCLOAK_AUDIENCES" => Some("ips-service".to_string()),
            _ => None,
        };
        let settings = keycloak_from_lookup(&lookup)
            .expect("valid")
            .expect("configured");
        assert_eq!(settings.role_map, default_role_map());
        let given = |name: &str| match name {
            "IPS_KEYCLOAK_ROLE_MAP" => Some(r#"{"clinician":{"access":["write"]}}"#.to_string()),
            other => lookup(other),
        };
        let settings = keycloak_from_lookup(&given)
            .expect("valid")
            .expect("configured");
        assert_eq!(settings.role_map.keys().collect::<Vec<_>>(), ["clinician"]);
    }
}
