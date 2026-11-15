# Example fixtures

The five example Bundles from the HL7 FHIR International Patient Summary
Implementation Guide, release **2.0.1** (STU 2, FHIR R4), downloaded
2026-11-15 from <https://hl7.org/fhir/uv/ips/> (the current published
release, per <https://hl7.org/fhir/uv/ips/package-list.json>). They
describe fictional patients.

| File | Source |
| --- | --- |
| `bundle-minimal.json` | <https://hl7.org/fhir/uv/ips/Bundle-bundle-minimal.json> |
| `bundle-no-info-required-sections.json` | <https://hl7.org/fhir/uv/ips/Bundle-bundle-no-info-required-sections.json> |
| `bundle-ips-all-sections.json` | <https://hl7.org/fhir/uv/ips/Bundle-bundle-ips-all-sections.json> |
| `IPS-examples-Bundle-01.json` | <https://hl7.org/fhir/uv/ips/Bundle-IPS-examples-Bundle-01.json> |
| `IPS-examples-Bundle-with-immunization.json` | <https://hl7.org/fhir/uv/ips/Bundle-IPS-examples-Bundle-with-immunization.json> |

Each `*.yaml` file is the YAML twin of its JSON file, written by
`node bin/make-yaml-twins.mjs` with the same options as the app's YAML
exporter. YAML is not an official FHIR format.

Hand-made edge cases (non-document Bundle, broken reference, unknown
section, hostile narrative, IPS 1.1.0, 80 allergies, YAML edge values)
are in `src/lib/fhir/fixtures/`.
