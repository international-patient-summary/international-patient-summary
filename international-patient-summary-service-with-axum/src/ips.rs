//! Checks that a JSON value is an International Patient Summary document Bundle.
//!
//! This is the structural gate of spec §4.1, not FHIR profile validation: it accepts
//! what the UI can display (IPS IG 2.0.1, tolerating 1.x) and refuses what it cannot.
//! It has no database or HTTP code, so it is unit-tested on its own.

use serde_json::Value;

/// The LOINC code of the Composition type "Patient summary Document".
pub const IPS_LOINC_CODE: &str = "60591-5";

/// The LOINC code system URI.
pub const LOINC_SYSTEM: &str = "http://loinc.org";

/// Why a value is not an IPS document. Each has a stable `code` and a JSON pointer
/// naming where the problem is, and never quotes the value itself.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Refusal {
    /// The value is not a JSON object with `resourceType` `Bundle`.
    NotABundle,
    /// `Bundle.type` is not `document`.
    NotADocument,
    /// `Bundle.entry[0].resource` is not a `Composition`.
    NoComposition,
    /// The Composition's `type` has no LOINC `60591-5` coding.
    NotAPatientSummary,
    /// The Composition has no `subject.reference`.
    NoSubject,
}

impl Refusal {
    /// The stable code a client matches on.
    #[must_use]
    pub fn code(self) -> &'static str {
        match self {
            Self::NotABundle => "not_a_bundle",
            Self::NotADocument => "not_a_document",
            Self::NoComposition => "no_composition",
            Self::NotAPatientSummary => "not_a_patient_summary",
            Self::NoSubject => "no_subject",
        }
    }

    /// Public text for the problem's `detail`.
    #[must_use]
    pub fn detail(self) -> &'static str {
        match self {
            Self::NotABundle => "The body is not a FHIR Bundle.",
            Self::NotADocument => "The Bundle's type is not \"document\".",
            Self::NoComposition => "The Bundle's first entry is not a Composition.",
            Self::NotAPatientSummary => {
                "The Composition's type is not LOINC 60591-5 (Patient summary Document)."
            }
            Self::NoSubject => "The Composition has no subject reference.",
        }
    }

    /// A JSON pointer to where the problem is, in the `#/...` form Axa uses.
    #[must_use]
    pub fn pointer(self) -> &'static str {
        match self {
            Self::NotABundle => "#/resourceType",
            Self::NotADocument => "#/type",
            Self::NoComposition => "#/entry/0/resource/resourceType",
            Self::NotAPatientSummary => "#/entry/0/resource/type",
            Self::NoSubject => "#/entry/0/resource/subject/reference",
        }
    }
}

/// Check that `bundle` is an IPS document Bundle.
///
/// # Errors
///
/// The first [`Refusal`] that applies, in the order the spec lists them.
pub fn check(bundle: &Value) -> Result<(), Refusal> {
    if bundle.get("resourceType").and_then(Value::as_str) != Some("Bundle") {
        return Err(Refusal::NotABundle);
    }
    if bundle.get("type").and_then(Value::as_str) != Some("document") {
        return Err(Refusal::NotADocument);
    }
    let composition = bundle
        .pointer("/entry/0/resource")
        .filter(|resource| {
            resource.get("resourceType").and_then(Value::as_str) == Some("Composition")
        })
        .ok_or(Refusal::NoComposition)?;
    let is_ips = composition
        .pointer("/type/coding")
        .and_then(Value::as_array)
        .is_some_and(|codings| {
            codings.iter().any(|coding| {
                coding.get("system").and_then(Value::as_str) == Some(LOINC_SYSTEM)
                    && coding.get("code").and_then(Value::as_str) == Some(IPS_LOINC_CODE)
            })
        });
    if !is_ips {
        return Err(Refusal::NotAPatientSummary);
    }
    let has_subject = composition
        .pointer("/subject/reference")
        .and_then(Value::as_str)
        .is_some_and(|reference| !reference.trim().is_empty());
    if !has_subject {
        return Err(Refusal::NoSubject);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    fn minimal() -> Value {
        json!({
            "resourceType": "Bundle",
            "type": "document",
            "entry": [{
                "fullUrl": "urn:uuid:1",
                "resource": {
                    "resourceType": "Composition",
                    "type": { "coding": [{ "system": "http://loinc.org", "code": "60591-5" }] },
                    "subject": { "reference": "urn:uuid:2" }
                }
            }]
        })
    }

    #[test]
    fn accepts_a_minimal_ips() {
        assert_eq!(check(&minimal()), Ok(()));
    }

    #[test]
    fn accepts_every_bundled_example() {
        let dir = concat!(env!("CARGO_MANIFEST_DIR"), "/tests/fixtures");
        let mut seen = 0;
        for entry in std::fs::read_dir(dir).expect("fixtures directory") {
            let path = entry.expect("entry").path();
            if path.extension().is_some_and(|ext| ext == "json") {
                let text = std::fs::read_to_string(&path).expect("readable fixture");
                let value: Value = serde_json::from_str(&text).expect("JSON fixture");
                assert_eq!(check(&value), Ok(()), "{}", path.display());
                seen += 1;
            }
        }
        assert!(seen >= 5, "expected the five IG examples, saw {seen}");
    }

    #[test]
    fn refuses_a_non_bundle() {
        assert_eq!(check(&json!([])), Err(Refusal::NotABundle));
        assert_eq!(
            check(&json!({ "resourceType": "Patient" })),
            Err(Refusal::NotABundle)
        );
    }

    #[test]
    fn refuses_a_collection() {
        let mut bundle = minimal();
        bundle["type"] = json!("collection");
        assert_eq!(check(&bundle), Err(Refusal::NotADocument));
    }

    #[test]
    fn refuses_a_missing_or_misplaced_composition() {
        let mut bundle = minimal();
        bundle["entry"] = json!([]);
        assert_eq!(check(&bundle), Err(Refusal::NoComposition));
        let mut bundle = minimal();
        bundle["entry"][0]["resource"]["resourceType"] = json!("Patient");
        assert_eq!(check(&bundle), Err(Refusal::NoComposition));
    }

    #[test]
    fn refuses_another_kind_of_document() {
        let mut bundle = minimal();
        // 34133-9: Summary of episode note.
        bundle["entry"][0]["resource"]["type"]["coding"][0]["code"] = json!("34133-9");
        assert_eq!(check(&bundle), Err(Refusal::NotAPatientSummary));
        let mut bundle = minimal();
        bundle["entry"][0]["resource"]["type"]["coding"][0]["system"] =
            json!("http://snomed.info/sct");
        assert_eq!(check(&bundle), Err(Refusal::NotAPatientSummary));
    }

    #[test]
    fn refuses_a_composition_without_a_subject() {
        let mut bundle = minimal();
        bundle["entry"][0]["resource"]["subject"] = json!({ "reference": " " });
        assert_eq!(check(&bundle), Err(Refusal::NoSubject));
    }

    #[test]
    fn every_refusal_has_a_distinct_code() {
        let all = [
            Refusal::NotABundle,
            Refusal::NotADocument,
            Refusal::NoComposition,
            Refusal::NotAPatientSummary,
            Refusal::NoSubject,
        ];
        let codes: std::collections::BTreeSet<_> = all.iter().map(|r| r.code()).collect();
        assert_eq!(codes.len(), all.len());
    }
}
