[Specification](index.md) › §4

# 4. Screens

## 4.1 Summaries (home)

- **M-LIST-1** Lists the open summaries, newest first. Each row: patient
  name (or the document title when there is none), document title, and
  document date written with the month as text.
- **M-LIST-2** Actions: Import file, Paste, Load examples, About. Each row
  can be deleted (swipe and an explicit Delete action). An empty list says
  how to open a summary and offers the same three ways.
- **M-LIST-3** A refusal (M-CHECK-1/2) is shown as an alert naming the
  problem and its code; the list does not change.

## 4.2 Summary

- **M-VIEW-1 Banner.** Patient name, birth date and age in years, gender,
  and identifiers with their system's short name (SNOMED CT, LOINC, NHS
  number, and so on, as the web viewer's `systemLabel`). Above everything
  else, an alert box lists allergies with criticality `high`, and says so
  when the allergies section is missing. Words, not colour alone.
- **M-VIEW-2 Document.** Title, date, and authors' names.
- **M-VIEW-3 Sections.** In Composition order, then any required section
  the Composition lacks, labelled "Section missing from document".
  Allergies are never collapsed. A known section is headed with the app's
  name for it, in the reader's language; the document's own title, when it
  differs, is shown beneath it as written (the web viewer's `SectionView`).
- **M-VIEW-4 Entries.** One row per entry. Main text: the entry's concept
  (`code`, `medicationCodeableConcept` or the referenced Medication's
  `code`, `vaccineCode`, the referenced Device's `type`). Detail lines, when
  present: status (clinical, verification, or `status`); criticality and
  reactions (allergies); dosage text (medications); onset or effective or
  occurrence date; value with unit, or value text, and interpretation
  (observations). Other types use their `code` and `status`.
- **M-VIEW-5 Absent and unknown.** Four states in words: "None known"
  (`emptyReason` `nilknown`, IPS `no-known-…`, SNOMED CT "no known" codes);
  "Not recorded" (`notasked`, `notstarted`, IPS `no-…-info`, or no entries);
  "Information unavailable" (`unavailable`, `withheld`, `closed`); and
  "Section missing from document" (M-VIEW-3). The absent-data rules are the
  web viewer's `src/lib/fhir/absent.ts`.
- **M-VIEW-6 Narrative.** A section's narrative is shown as plain text, with
  the markup removed; no web view renders it, so nothing in it runs or
  loads. A section with narrative but no entries shows the narrative.
- **M-VIEW-7 Codes.** Display prefers `coding.display`, then
  `CodeableConcept.text`, then `system|code` (the web viewer's
  `displayOf`). A status, verification status, allergy type or criticality
  is read as its code first ("active"), and shown in the app's own words in
  the reader's language when the app knows the code; an unknown code is
  shown as the document wrote it. Codes shown on one line are joined with
  the language's list separator.

## 4.3 About

- **M-ABOUT-1** Says the app is not a medical device; what it keeps (in
  memory only) and sends (nothing, unless you share); the IPS version
  (2.0.1); the app version; and offers **Clear all** (M-PRIV-3).

## 4.4 Tablets and wide windows

- **M-TAB-1 Side by side.** In a wide window (an iPad, or Android at
  840 dp and wider) the summaries list stays on the leading side and the
  open summary fills the rest, with no Back. The open summary's row is
  selected; before one is chosen the other side says "Open a summary".
  Deleting or clearing the open summary empties that side too (M-PRIV-3).
  A narrow window is the phone layout: one screen at a time, with Back.
- **M-TAB-2 Keyboard.** With a hardware keyboard, Command (iOS) or Ctrl
  (Android) with O imports a file, with V pastes, with E loads the
  examples, and with Delete (Backspace) deletes the open summary. Each does
  exactly what its button does, through the same check, and the system's
  shortcut list names them in the interface's language.
- **M-TAB-3 Drop.** One JSON file, or text, dragged from another app onto
  the summaries list opens as if imported or pasted: a file over the limit
  is refused by its size before it is read (M-CHECK-2), and everything
  else goes through the same check. The list shows that it will take the
  drop. The app keeps no copy of the dropped file.
