[Specification](index.md) › §5

# 5. Sharing and privacy

- **M-SHARE-1** "Share" on a summary hands the system share sheet a file of
  the exact bytes the summary was opened from, typed `application/fhir+json`,
  named `international-patient-summary.json`. Never the patient's name or
  identifiers in a file name. Nothing is shared without that tap.
- **M-PRIV-1** Summaries live in memory only: no files, database,
  preferences, keychain, or backup hold them. The app asks for no network
  permission and makes no network request. A temporary share file is
  deleted when sharing ends, or on the next launch.
- **M-PRIV-2** When the app leaves the foreground, its window is covered,
  so the app switcher shows no patient data.
- **M-PRIV-3** "Clear all" (with confirmation) forgets every summary.
- **M-PRIV-4** Logs carry no document content, names, or identifiers.
