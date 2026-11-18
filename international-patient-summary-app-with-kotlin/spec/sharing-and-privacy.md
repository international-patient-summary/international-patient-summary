[Specification](index.md) › §5

# 5. Sharing and privacy

- **M-SHARE-1** "Share" on a summary offers two things: the file (FHIR
  JSON) or a PDF for people (M-PDF-1). The file is the exact bytes the
  summary was opened from, typed `application/fhir+json`,
  named `international-patient-summary.json`. Never the patient's name or
  identifiers in a file name. Nothing is shared without that tap.
- **M-SHARE-2** When the open summaries are about more than one person
  (M-PEOPLE-1), Share first asks "Share the summary of" and the patient's
  name, so a carer does not send the wrong person's record; nothing is
  shared unless the person confirms. With one person, Share opens the share
  sheet at once.
- **M-PRIV-1** Summaries, and the relationships given to people
  (M-PEOPLE-3), are kept on the device only, in the encrypted store
  (M-STORE-1, M-STORE-2): no server, account, cloud, backup, preferences or
  database outside that store holds them. The app asks for no network
  permission and makes no network request. A temporary share file is
  deleted when sharing ends, or on the next launch.
- **M-PRIV-2** When the app leaves the foreground, its window is covered,
  so the app switcher shows no patient data.
- **M-PRIV-3** "Clear all" (with confirmation) deletes every summary and
  every relationship from the device (M-STORE-4).
- **M-PRIV-4** Logs carry no document content, names, or identifiers.

## 5.1 A PDF for people

- **M-PDF-1 One page.** "Share as PDF" makes a one-page summary for
  handing over or printing, by the web viewer's rules (its F-EXP-3 and
  `src/lib/export/pdf.ts`), drawn with the platform's own PDF and text
  tools and system fonts:
  - Paper: US Letter when the app's language and region are US English
    (en-US), A4 otherwise.
  - A header with the patient's name, birth date and age, gender, and
    first identifier; a box headed "Alerts and allergies" with the Alerts
    section's entries, then every allergy and intolerance (substance,
    criticality, reactions), and the missing-allergies notice of M-VIEW-1
    when the document has no allergies section (each allergy shows its own
    criticality, so the banner's high-criticality line is not repeated);
    then the sections in this order: medications, problems,
    immunizations, results, procedures, devices, advance directives,
    vital signs, past illness, plan of care, social history, functional
    status, pregnancy, patient story, then any other section. Each entry
    is one line: its concept in bold, then its details (M-VIEW-4) joined
    with " · "; an entry never splits across a page. Absent states read
    as on screen (M-VIEW-5); a section with narrative but no entries
    prints its narrative as plain text (M-VIEW-6).
  - A footer on every page: when it was made, the source document's date,
    "IPS 2.0.1 (HL7 FHIR R4)", the not-a-medical-device notice, and
    "Page 1 of 1".
  - Words are the app's, in the reader's language (M-I18N-1); clinical
    text is as the document has it. The file is named
    `international-patient-summary-<document date>.pdf`, the date as the
    document gives it (YYYY, YYYY-MM or YYYY-MM-DD), or
    `international-patient-summary.pdf` without one, and its title
    metadata is that name, never the patient's.
- **M-PDF-2 Fitting.** Lay out and count pages, and try, in order, until
  it fits on one page: the font at 10, 9.5, 9, 8.5 and 8 pt; then, at
  8 pt, cap the lowest-priority sections (last in the order above) first
  at their 3 most recent entries, then at 1, with a "More not shown" line
  giving the count; then replace whole sections, lowest priority first,
  with "Section present — not shown on this one-page summary". The
  patient's identity, alerts, allergies and current medications (status
  active, intended, on-hold or draft) are never trimmed: a medication section with current medications keeps them and
  is never replaced. Every trimmed or replaced section is named on a "Not
  shown on this page" line. If the never-trimmed content alone does not
  fit on one page at 8 pt, the PDF runs on to further pages, every page
  says "CONTINUED — this summary exceeds one page", and the footer counts
  the pages.
- **M-PDF-3 Shared like the file.** The PDF goes to the share sheet as a
  temporary file (with M-SHARE-2's question first when several people
  are open), written with file protection where the platform has it, and
  deleted when sharing ends and at the next launch (M-PRIV-1). It is
  never saved in the store, and the app keeps no copy.

## 5.2 The encrypted store

So the app works offline and after the phone restarts, what it shows is
saved on the device, encrypted.

- **M-STORE-1 Saved on the device.** Every open summary (the exact bytes
  it was opened from) and every relationship (M-PEOPLE-3) is saved as soon
  as it changes. After the app closes, after the phone restarts, and with
  no network, the app shows the same summaries in the same order, with the
  same relationships. Which summary was open is not saved: the app opens to
  the list.
- **M-STORE-2 Encrypted, on this device only.** Each summary, and the
  index that lists them with their relationships, is encrypted on its own
  with AES-256-GCM and a fresh nonce, under one key that never leaves the
  device: on iOS a Keychain item for this device only, readable only while
  the device is unlocked; on Android a key in the Android Keystore that
  cannot be exported. The files use the platform's file protection where it
  has one, and are kept out of backups and device transfer, so a summary
  never leaves the phone in a backup and a new phone starts empty.
  Backup exclusion must apply before writing any file, including the
  first import after Clear all.
- **M-STORE-3 Checked again when read.** At launch each saved summary is
  decrypted and checked again (M-CHECK-1, M-CHECK-2). One that cannot be
  decrypted or no longer passes is left out and deleted; the others open as
  before. If the key is gone (for example, after a restore to another
  device), or the index cannot be decrypted or read, the store is deleted
  and the app starts empty; summaries are not guessed without their index.
- **M-STORE-4 Deleting deletes.** Delete (M-LIST-2), Forget this person
  (M-PEOPLE-4) and Clear all (M-PRIV-3) remove those summaries' files at
  once, and the index with them. Clear all also deletes the key, so nothing
  left on the device's storage can be read.

