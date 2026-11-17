[Specification](index.md) › §3

# 3. Documents

## 3.1 The check (same as the service's S-API-2)

**M-CHECK-1** A document is accepted only if each check passes, in this
order. The first failure refuses it with this `code` and `pointer`, exactly
as `international-patient-summary-service-with-axum` spec §4.1 S-API-2 and
the web viewer's `src/lib/service/service.ts` do:

| `code`                  | Requirement                                                     | `pointer`                              |
| ----------------------- | --------------------------------------------------------------- | -------------------------------------- |
| `not_a_bundle`          | A JSON object with `resourceType` `Bundle`                       | `#/resourceType`                       |
| `not_a_document`        | `type` is `document`                                            | `#/type`                               |
| `no_composition`        | `entry[0].resource.resourceType` is `Composition`               | `#/entry/0/resource/resourceType`      |
| `not_a_patient_summary` | The Composition's `type.coding` has `http://loinc.org` `60591-5` | `#/entry/0/resource/type`              |
| `no_subject`            | The Composition has a non-blank `subject.reference`             | `#/entry/0/resource/subject/reference` |

Text that is not JSON is refused as `not_json` (pointer `#`). The refusal
names the problem in words and shows the code; it never quotes the document.

**M-CHECK-2** A document larger than 10 MB (10 × 1024 × 1024 bytes, the
service's and viewer's limit) is refused as `too_large` before it is parsed.

## 3.2 Reading

**M-READ-1** References resolve within the Bundle by `fullUrl`, then by
`ResourceType/id`. An entry whose reference does not resolve is shown as
"Entry not found in this document", never dropped.

**M-READ-2** The subject is the Patient the Composition's `subject`
resolves to. If it does not resolve, the summary still opens, and the
banner says the patient is not in the document.

**M-READ-3** Section registry (IPS 2.0.1; the web viewer's spec §2.1):

| Key            | LOINC      | Level       | Entry types                              |
| -------------- | ---------- | ----------- | ---------------------------------------- |
| allergies      | `48765-2`  | required    | AllergyIntolerance                       |
| medications    | `10160-0`  | required    | MedicationStatement, MedicationRequest   |
| problems       | `11450-4`  | required    | Condition                                |
| immunizations  | `11369-6`  | recommended | Immunization                             |
| results        | `30954-2`  | recommended | Observation, DiagnosticReport            |
| procedures     | `47519-4`  | recommended | Procedure                                |
| devices        | `46264-8`  | recommended | DeviceUseStatement                       |
| vitalSigns     | `8716-3`   | optional    | Observation                              |
| pastIllness    | `11348-0`  | optional    | Condition                                |
| functional     | `47420-5`  | optional    | Condition, ClinicalImpression            |
| planOfCare     | `18776-5`  | optional    | CarePlan, ImmunizationRecommendation     |
| socialHistory  | `29762-2`  | optional    | Observation                              |
| pregnancy      | `10162-6`  | optional    | Observation                              |
| advanceDirectives | `42348-3` | optional   | Consent                                  |
| alerts         | `104605-1` | optional    | Flag                                     |
| patientStory   | `81338-6`  | optional    | (narrative only)                         |

A section with another code is shown with its own title ("generic").

## 3.3 Loading

- **M-LOAD-1** Import file: the system document picker, JSON files.
- **M-LOAD-2** Paste: reads the clipboard only when the person taps Paste.
- **M-LOAD-3** Load examples: the five fixtures, each checked like any
  other document.
- **M-LOAD-4** Open from another app: a JSON file sent to the app ("Open
  in", "Open with" or Share from Files, Mail, a browser, a messaging app)
  opens exactly as if imported (M-LOAD-1): refused by its size before it is
  read when over 10 MB (M-CHECK-2), then the same check (M-CHECK-1); a
  refusal shows the same alert (M-LIST-3) and the list does not change. A
  summary that opens is saved like any other (M-STORE-1); the app keeps no
  other copy of the file.
