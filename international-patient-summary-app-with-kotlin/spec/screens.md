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

- **M-VIEW-1 Banner.** Patient name, birth date and age (in years for an adult, in months, weeks or days for a child), gender,
  and identifiers with their system's short name (SNOMED CT, LOINC, NHS
  number, and so on, as the web viewer's `systemLabel`). Above everything
  else, an alert box lists allergies with criticality `high`, and says so
  when the allergies section is missing. Words, not colour alone.
  For patient and author names, prefer a readable official name, then
  usual, then another use, then old or maiden. Use the first readable name
  within each group. Prefer its nonblank text as written, otherwise join
  its nonblank prefix, given, family and suffix parts in that order. A
  parts-only name needs a given or family name so a title alone cannot
  identify someone in the banner or family list.
  A valid partial birth date stays partial. If a birth date cannot be
  parsed, show its source text rather than inventing a date. Show an age
  only for a valid, full birth date that is not in the future.
  The age is written in the units a clinician reads for that age (the NHS
  Common User Interface bands, as Lily Design System's `ageParts`), counted
  in whole calendar units from the birth date to today, in the reader's
  language: under 28 days, the days; under 1 year, the weeks and days; from
  1 year to under 2, the months and days; from 2 years to under 18, the
  years and months; from 18, the years alone. A birth date has no time of
  day, so hours and minutes are never shown; a baby born today is 0 days. A
  zero second part is left out ("3 years", not "3 years 0 months"). The
  banner and the PDF header (M-PDF-1) say the age the same way. The banner's
  sentence puts the age beside the birth date as before; only the age's
  words are longer for a child.
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
  (observations). A JSON numeric clinical value is written with its exact
  source token, including trailing zeroes, precision and exponent, without
  rounding or normalisation. The detail shown on screen and in the PDF is
  the same value. Other types use their `code` and `status`.
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

- **M-ABOUT-1** Says the app is not a medical device; what it keeps (on
  this device only, encrypted, until deleted: M-STORE-1, M-STORE-2) and
  sends (nothing, unless you share); the IPS version
  (2.0.1); the app version; and offers **Clear all** (M-PRIV-3).

## 4.4 Tablets and wide windows

- **M-TAB-1 Side by side.** In a wide window (an iPad, an unfolded iPhone
  Duo, or Android at 840 dp and wider) the summaries list stays on the leading side and the
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
- **M-TAB-4 Fold.** On a phone that folds (an iPhone Duo, or an Android
  foldable), folding or unfolding keeps every open summary, every
  relationship (M-PEOPLE-3) and the summary being read; the layout follows
  the new window as M-TAB-1 says.

## 4.5 People: families and carers

One person often reads summaries for several: a parent for their children,
an adult for their parents, a carer for the people they look after.

- **M-PEOPLE-1 Same person.** Two summaries are about the same person when
  their patients share an identifier (the same `system` and `value`; an
  identifier without a `system` links nothing), or
  when both have a name and a birth date and these are the same (the name
  as the banner writes it, ignoring case, accents and spacing). The link is
  transitive. A summary whose patient has no identifier and lacks a name or
  a birth date is a person of its own. Linking is for display only: no
  document is merged or changed.
- **M-PEOPLE-2 Grouped list.** The Summaries list is grouped by person.
  Each person has a heading (their name from their newest summary, or
  "Patient not named"; their relationship, if set; and their birth date)
  with their summaries beneath, newest first. People are in the order of
  their newest summary. The heading is a heading to the screen reader.
- **M-PEOPLE-3 Relationship.** Each person can be given their relationship
  to the person using the app: Me, My partner, My parent, My child, My
  sibling, My grandparent, My grandchild, Other family, Someone I care for,
  or Not set (the default). It is chosen from the person's heading (a
  button labelled "Options for" and the name), and shown in the heading and
  in the summary's banner. Only one person can be Me: choosing Me for one
  person sets the last one back to Not set. When a new summary joins two
  people, or a deletion parts one, each person takes the relationship of
  their newest summary that has one, and if two are then Me, the one with
  the newer summary stays Me. A relationship is the app's
  note, never part of a document: it is saved with the summaries
  (M-STORE-1), deleted with them (M-PRIV-3), and never shared.
- **M-PEOPLE-4 Forget a person.** The same button offers Forget this
  person, which, after confirming, deletes every summary about them and
  their relationship (M-STORE-4).
