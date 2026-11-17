[Specification](index.md) › §1

# 1. Purpose

A phone app that opens an HL7 FHIR International Patient Summary (IPS) and
shows it to a person: the patient, then what a clinician needs first:
allergies, medications and problems. The app is the mobile sibling of
[`international-patient-summary-ui-with-svelte`](../../international-patient-summary-ui-with-svelte/)
(the web viewer). It never needs
[`international-patient-summary-service-with-axum`](../../international-patient-summary-service-with-axum/)
(the backend). It checks documents by the same rules the service does, so a
summary one accepts, the other accepts too.

> **Safety.** This app is not a medical device. It shows what a document
> says and never changes its clinical content. Clinical decisions belong to
> the clinician reading the source record.

## 1.1 Ideas from MyIPS

The [MyIPS user guide](https://myips.health/user-guide/) (read 2026-11-16)
describes an app for writing your own IPS. These ideas from it fit this
app's privacy rules, and are taken up in version 1:

| MyIPS idea                                              | Here                                    |
| ------------------------------------------------------- | --------------------------------------- |
| No account, no cloud, no server; data stays on device   | **M-PRIV-1**, and no network at all     |
| Data leaves only when the person shares it              | **M-SHARE-1**                           |
| Import a FHIR JSON Bundle from a file                   | **M-LOAD-1**                            |
| Medications, allergies, problems must be present or "none known" | **M-VIEW-3**, **M-VIEW-5**     |
| Sample data to explore                                  | **M-LOAD-3** (the five IG examples)     |
| Clear all data                                          | **M-PRIV-3**                            |
| An encrypted on-device store                            | **M-STORE-1** to **M-STORE-4**          |
| Section-by-section summary home                         | **M-VIEW-3**                            |

These wait for a later version ([plans.md](../plans.md)): writing and
editing your own summary (MyIPS's thirteen sections); SMART Health Links
and QR codes, scanned or shown, with passcodes; a PDF for people; import history and receipts; a display-language picker;
choosing what to share (active and recent only, provenance).
