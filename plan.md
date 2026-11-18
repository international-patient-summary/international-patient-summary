# Mobile release plan

Ship the offline viewer first. The current apps can import, display, group and share an IPS, and reopen encrypted records after a restart. Online links, service sign-in and authoring each change what the app does with a record. They have separate phases in the [iOS plan](international-patient-summary-app-with-swift/plans.md) and [Android plan](international-patient-summary-app-with-kotlin/plans.md).

## What needs to be true for release

1. **A reader can identify the person and trust the displayed record.** Use the same fictional documents on both platforms. Compare the banner, allergy alert, family grouping and exported PDF, including missing data, partial dates, multiple names and precise quantities. Sharing JSON must return the original bytes.
2. **A record survives an ordinary interruption.** Verify the store across device lock, restart, low storage and a failed write. A reader needs to know if an import was only opened in memory. Verify deletion after relaunch and backup exclusion after reimport.
3. **People can use the released languages.** The shared translation source has 65 localizations besides US English. On 2026-11-18 all 10,790 non-English entries in the main iOS catalog had the state `needs_review`. Placeholder and completeness tests run automatically. Release-language claims require the clinical review in M-I18N-2 and a walkthrough using the platform screen reader.
4. **A signed build passes the device checks.** Exercise the oldest supported OS and a current phone, plus a wide window, with fictional summaries. Record the build, OS, locale, text size and outcome alongside each platform's existing §9 checklist. Keep screenshots and test reports free of real records.

The [release checklist](tasks.md) puts data integrity and privacy ahead of new capabilities.
