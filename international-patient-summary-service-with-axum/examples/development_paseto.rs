//! Mint a PASETO token under Axa's public, throwaway test key.
//!
//! This is development tooling only. The signing seed is published in `axa-test`, so
//! these tokens protect nothing and must never be accepted by a deployed service.

use axa_test::paseto::TestKeys;

const ISSUER: &str = "authentication-service";
const AUDIENCE: &str = "ips-service";
const USAGE: &str = "usage: development_paseto keys | token <subject> [read|write|admin ...]";

fn run(args: &[String]) -> Result<String, &'static str> {
    match args {
        [command] if command == "keys" => serde_json::to_string_pretty(&TestKeys::new().key_set())
            .map_err(|_| "could not encode the development key set"),
        [command, subject, access @ ..] if command == "token" => {
            if subject.trim().is_empty() {
                return Err("subject must not be blank");
            }
            if access
                .iter()
                .any(|value| !matches!(value.as_str(), "read" | "write" | "admin"))
            {
                return Err("access must be read, write, or admin");
            }
            let mut token = TestKeys::new().token(ISSUER, AUDIENCE).subject(subject);
            if !access.is_empty() {
                token = token.attr("access", access.iter().map(String::as_str));
            }
            Ok(token.sign())
        }
        _ => Err(USAGE),
    }
}

fn main() {
    let args = std::env::args().skip(1).collect::<Vec<_>>();
    match run(&args) {
        Ok(output) => println!("{output}"),
        Err(message) => {
            eprintln!("{message}");
            std::process::exit(2);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use authentication_verifier::Verifier;
    use serde_json::Value;

    fn args(values: &[&str]) -> Vec<String> {
        values.iter().map(ToString::to_string).collect()
    }

    #[test]
    fn keys_are_the_public_development_key_set() {
        let output = run(&args(&["keys"])).expect("key set");
        let value: Value = serde_json::from_str(&output).expect("JSON key set");
        assert_eq!(value, TestKeys::new().key_set());
    }

    #[test]
    fn token_is_accepted_for_the_documented_issuer_and_audience() {
        let token = run(&args(&["token", "developer", "write"])).expect("token");
        let verifier =
            Verifier::from_paseto_keys_value(&TestKeys::new().key_set(), ISSUER, AUDIENCE)
                .expect("verifier");
        let claims = verifier.verify(&token).expect("verified token");
        assert_eq!(claims.sub, "developer");
    }

    #[test]
    fn invalid_invocations_are_refused() {
        assert_eq!(run(&args(&[])), Err(USAGE));
        assert_eq!(
            run(&args(&["token", "developer", "delete"])),
            Err("access must be read, write, or admin")
        );
        assert_eq!(
            run(&args(&["token", " "])),
            Err("subject must not be blank")
        );
    }
}
