[Specification](index.md) › §2

# 2. Scope

In scope for version 1:

- Open an IPS document Bundle (FHIR R4 JSON) from a file, the clipboard, or
  the bundled examples, and check it.
- Show it: patient banner, document details, sections in order, entries,
  absent and unknown data, narrative as plain text.
- Share it on request as the exact bytes it was opened from.
- Group summaries by person, and note each person's relationship to the
  reader, for families and carers.
- Keep it on the device, encrypted, across restarts and with no network,
  until the person deletes it (M-STORE).

Also in scope: a one-page PDF for people (M-PDF).

Out of scope for version 1: editing, storage off the device (cloud,
backup, sync), any network use, YAML, FHIR
profile validation, terminology lookups, QR codes, accounts.
