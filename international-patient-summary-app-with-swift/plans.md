# Plan

How the specification (spec/index.md) gets built. [tasks.md](tasks.md) is the
checklist. Each phase ships on its own; later phases come from spec §1.1,
the MyIPS ideas this version leaves for later. Each is a spec change first.

## Phase 1 — Viewer (version 0.1, done)

Open, check, show, share, forget. `IPSKit` holds every rule that is not
UIKit, so it is tested without a simulator. Proven by spec §9.

## Phase 2 — Translations

Every language of the repository's `locales/` folder (spec M-I18N-2) in
`Localizable.xcstrings`, machine-translated first and marked `needs_review`,
with the same review rule (a clinician who reads the
language checks every string before release). A display-language picker
only if per-app language in iOS Settings proves not enough.

## Phase 3 — Open from other apps

`CFBundleDocumentTypes` for `.json` and a UTI for `application/fhir+json`,
so "Open in…" from Files, Mail and Safari reaches the app; the same check,
the same 10 MB limit.

## Phase 4 — A PDF for people

The web viewer's one-page PDF rules (spec §6.7 there): identity, alerts,
allergies and active medications are never trimmed. Rendered with
`UIGraphicsPDFRenderer`, shared like the JSON.

## Phase 5 — SMART Health Links and QR codes

Scan a QR code (VisionKit `DataScannerViewController`) or paste a link,
ask for the passcode, fetch and decrypt the IPS (JWE, `A256GCM`). This is
the app's first network use: it needs a spec change to M-PRIV-1, a
network-permission review, and fetches only the link the person gave.
Showing one's own summary as a QR code follows.

## Phase 6 — Keep summaries (opt-in)

An encrypted on-device store, off until the person turns it on: Data
Protection class Complete, a key in the Keychain
(`kSecAttrAccessibleWhenUnlockedThisDeviceOnly`), excluded from backup, and
Clear all removes the key. Needs a spec change to M-PRIV-1 and the root
rule on persistence.

## Phase 7 — Write your own summary

MyIPS's sections (My Details, Medications, Allergies, Health Concerns, and
so on), with "none known" toggles, building a valid IPS 2.0.1 Bundle that
passes M-CHECK-1. Needs a terminology source (SNOMED CT, LOINC) that works
offline, and a clinical-safety review.

## Phase 8 — The service

Open from and save to `international-patient-summary-service-with-axum`
once it has authentication (its P3); the same API contract (its spec §4).

## Phase 9 — Tablets

The list beside the open summary in a wide window (spec M-TAB-1), then a
hardware keyboard's shortcuts and dropping a file onto the list, each
through the same check as every other way in. Phone behaviour is unchanged.

## Phase 10 — Families and carers

One person often reads summaries for several: a parent for their children,
an adult for their parents, a carer for the people they look after. The
list groups summaries by person (spec M-PEOPLE-1, M-PEOPLE-2), each person
can be given their relationship to the reader (M-PEOPLE-3) and forgotten
at once (M-PEOPLE-4), and Share names the patient first when more than one
person is open (M-SHARE-2). People and relationships are saved with the
summaries in the encrypted store (Phase 12).

## Phase 11 — iPhone Duo

The folding iPhone: one screen at a time folded, the list beside the
summary unfolded (M-TAB-1), and nothing lost on folding or unfolding
(M-TAB-4). Screenshots move to the newest runtime and iPhone (spec §8.4).

## Phase 12 — Encrypted on-device store

So the app works offline and after a restart, every summary and
relationship is saved on the device, encrypted (spec §5.2, M-STORE-1..4):
AES-256-GCM files under a Keychain key that never leaves the device, out of
backups. Deleting deletes the files; Clear all deletes the key too. The
repository's rule changed with it (root AGENTS.md): the mobile apps may keep
patient data, on the device only and encrypted; nothing else persists it.

