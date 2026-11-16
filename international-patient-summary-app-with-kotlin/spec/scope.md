[Specification](index.md) › §2

# 2. Scope

In scope for version 1:

- Open an IPS document Bundle (FHIR R4 JSON) from a file, the clipboard, or
  the bundled examples, and check it.
- Show it: patient banner, document details, sections in order, entries,
  absent and unknown data, narrative as plain text.
- Share it on request as the exact bytes it was opened from.
- Keep it in memory only; forget it on request or when the app ends.

Out of scope for version 1: editing, storage, any network use, YAML, FHIR
profile validation, terminology lookups, PDF, QR codes, accounts.
