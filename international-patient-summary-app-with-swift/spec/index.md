# International Patient Summary app with Swift — Specification

The Apple iOS app: a phone and tablet viewer for HL7 FHIR International
Patient Summary documents, written in Swift with UIKit (no SwiftUI). Its
Android twin is
[`international-patient-summary-app-with-kotlin`](../../international-patient-summary-app-with-kotlin/);
the two share §1–§7 word for word, one file per section, so a requirement
ID means the same in both.

These files are the source of truth. A change in behaviour carries a spec edit, a
code edit and a test edit together. Requirement IDs (`M-LOAD-1`) name the test
that proves them in [§9](verification.md).

Revision: 2026-11-16 (initial).

## Contents

| §  | File | Requirements |
| -- | ---- | ------------ |
| 1 | [Purpose](purpose.md) | — |
| 2 | [Scope](scope.md) | — |
| 3 | [Documents](documents.md) | M-CHECK-1, M-CHECK-2, M-READ-1, M-READ-2, M-READ-3, M-LOAD-1, M-LOAD-2, M-LOAD-3, M-LOAD-4 |
| 4 | [Screens](screens.md) | M-LIST-1, M-LIST-2, M-LIST-3, M-VIEW-1, M-VIEW-2, M-VIEW-3, M-VIEW-4, M-VIEW-5, M-VIEW-6, M-VIEW-7, M-ABOUT-1, M-TAB-1, M-TAB-2, M-TAB-3, M-TAB-4, M-PEOPLE-1, M-PEOPLE-2, M-PEOPLE-3, M-PEOPLE-4 |
| 5 | [Sharing and privacy](sharing-and-privacy.md) | M-SHARE-1, M-SHARE-2, M-PRIV-1, M-PRIV-2, M-PRIV-3, M-PRIV-4, M-PDF-1, M-PDF-2, M-PDF-3, M-STORE-1, M-STORE-2, M-STORE-3, M-STORE-4 |
| 6 | [Accessibility and language](accessibility-and-language.md) | M-A11Y-1, M-A11Y-2, M-I18N-1/2 |
| 7 | [Fixtures](fixtures.md) | — |
| 8 | [iOS](ios.md) | — |
| 9 | [Verification](verification.md) | — |

A requirement keeps its ID wherever its text moves; [§9](verification.md)
maps each to the test that proves it.
