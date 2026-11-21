//! The small public surfaces: the refusals' words and pointers, the configuration's
//! errors, and what a debug print of the authenticator leaves out.

use axa::Environment;
use ips_service::{
    auth::{self, Auth},
    ips::Refusal,
};

const ALL: [Refusal; 5] = [
    Refusal::NotABundle,
    Refusal::NotADocument,
    Refusal::NoComposition,
    Refusal::NotAPatientSummary,
    Refusal::NoSubject,
];

#[test]
fn every_refusal_has_its_own_code_detail_and_pointer() {
    let mut codes: Vec<_> = ALL.iter().map(|refusal| refusal.code()).collect();
    let mut details: Vec<_> = ALL.iter().map(|refusal| refusal.detail()).collect();
    let mut pointers: Vec<_> = ALL.iter().map(|refusal| refusal.pointer()).collect();
    for list in [&mut codes, &mut details, &mut pointers] {
        list.sort_unstable();
        list.dedup();
        assert_eq!(list.len(), ALL.len(), "no two refusals share a value");
    }
    assert!(pointers.iter().all(|pointer| pointer.starts_with("#/")));
}

fn lookup(values: &'static [(&'static str, &'static str)]) -> impl Fn(&str) -> Option<String> {
    move |name| {
        values
            .iter()
            .find(|(key, _)| *key == name)
            .map(|(_, value)| (*value).to_string())
    }
}

#[test]
fn a_paseto_configuration_names_what_is_missing_or_wrong() {
    let none = auth::paseto_from_lookup(&lookup(&[])).expect("no key file is no PASETO");
    assert!(none.is_none());

    let no_issuer = auth::paseto_from_lookup(&lookup(&[("IPS_PASETO_KEYS_FILE", "k.json")]));
    assert!(format!("{:?}", no_issuer.err().expect("an error")).contains("IPS_PASETO_ISSUER"));

    let no_audience = auth::paseto_from_lookup(&lookup(&[
        ("IPS_PASETO_KEYS_FILE", "k.json"),
        ("IPS_PASETO_ISSUER", "i"),
    ]));
    assert!(format!("{:?}", no_audience.err().expect("an error")).contains("IPS_PASETO_AUDIENCE"));

    let unreadable = auth::paseto_from_lookup(&lookup(&[
        ("IPS_PASETO_KEYS_FILE", "/nonexistent/keys.json"),
        ("IPS_PASETO_ISSUER", "i"),
        ("IPS_PASETO_AUDIENCE", "a"),
    ]));
    assert!(format!("{:?}", unreadable.err().expect("an error")).contains("IPS_PASETO_KEYS_FILE"));
}

#[test]
fn a_key_file_that_is_not_json_or_holds_no_key_is_refused() {
    let dir = std::env::temp_dir().join(format!("ips-keys-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let bad = dir.join("bad.json");
    std::fs::write(&bad, "not json").unwrap();
    let empty = dir.join("empty.json");
    std::fs::write(&empty, r#"{"keys":[]}"#).unwrap();
    for file in [&bad, &empty] {
        let path = file.to_str().unwrap().to_string();
        let result = auth::paseto_from_lookup(&move |name: &str| match name {
            "IPS_PASETO_KEYS_FILE" => Some(path.clone()),
            "IPS_PASETO_ISSUER" => Some("i".into()),
            "IPS_PASETO_AUDIENCE" => Some("a".into()),
            _ => None,
        });
        assert!(result.is_err(), "{file:?}");
    }
    std::fs::remove_dir_all(dir).ok();
}

#[test]
fn authentication_is_off_in_test_but_never_in_production() {
    let off = auth::from_lookup(&Environment::Test, &|_| None).expect("off in test");
    assert!(matches!(off, Auth::Off));
    assert_eq!(format!("{off:?}"), "Auth::Off");
    assert!(auth::from_lookup(&Environment::Production, &|_| None).is_err());
    // From the process environment, which holds none of the settings here.
    assert!(auth::from_env(&Environment::Test).is_ok());
}
