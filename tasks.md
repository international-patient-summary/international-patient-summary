# Mobile release checklist

These tasks track work that affects both apps. Platform-specific device steps and signing work live in the [iOS checklist](international-patient-summary-app-with-swift/tasks.md) and [Android checklist](international-patient-summary-app-with-kotlin/tasks.md).

## Implemented in the readiness review

- [x] Bound picked, dropped and incoming file reads even with missing or inaccurate size metadata. Test the exact limit and the first excess byte.
- [x] Select the first readable patient name in the preferred use category. Cover blank or title-only names, non-Latin text and historical-name fallback on both platforms.
- [x] Restore the iOS store directory's backup exclusion when it is recreated. Test Clear all followed by a fresh import.
- [x] Check shared spec parity and regenerate both apps’ translations in CI on mobile changes.

## Before release

- [x] **Recover from storage failures.** Swift's store catches write failures and Android's view model discards the result of a failed save. Add a localized unsaved-state message and retry path. Inject a failed summary write and a failed index write, retry, restart, and verify the exact documents and relationships. Distinguish temporary read or key-access failures from confirmed corruption before deleting files.
- [x] **Keep each share tied to the selected record.** Both apps reuse an export pathname. Give each export its own temporary location and scope cleanup to that share. Test two different fictional patients sharing the same filename, cancellation, a delayed recipient and cleanup after relaunch.
- [x] **Compare clinical values across platforms.** Swift decodes JSON numbers as Double while Android retains the number token. Exercise trailing zeros and high precision in observations, along with partial and invalid birth dates. Verify the banner, detail view and PDF against the source, including the absence of an age for an invalid birth date.
- [ ] **Review languages for release.** Record the locale, reviewer and reviewed revision for allergy criticality, absent states, relationships, share confirmation and deletion. Check representative RTL and long-text locales with VoiceOver and TalkBack at maximum text size. Track each release language against M-I18N-2.
- [ ] **Complete device and distribution checks.** Run both §9 checklists on release candidates. Verify locking, restart, backup exclusion, clear-and-reimport and share-file cleanup with fictional records. Record outstanding skips and verify signing and store privacy declarations against the shipped build.

## Verification on 2026-11-18

- **iOS.** 71 IPSKit tests passed. The iPhone 18 Pro Max suite passed on iOS 27.2 with three device- or runtime-specific skips. The two tablet tests and encrypted-store relaunch passed on iPad Air 13-inch (M4). Paste, refusal and JSON sharing passed on iPhone 17 with iOS 26.1.
- **Android.** 111 JVM tests, the debug build and lint passed. The Pixel 10 API 37 emulator report recorded all four instrumented UI and PDF tests passing.
- **Shared.** All seven common specification sections matched byte for byte. Regenerating the 65 localizations produced no changes to the checked-in resources.

## Work in progress on 2026-11-20

Implementation commit `1732dd7` is on `main` and has been pushed to GitHub, Codeberg and GitLab.

- **Viewer coverage.** 179 unit and component tests pass. Line coverage is 95.24% (1,604/1,684), and CI now enforces a 95% line threshold. The full browser suite passed locally. The pushed Viewer check passed lint, type checking and coverage, then reported 72/73 browser tests passing: the render budget measured 202.1 ms against the strict `< 200 ms` limit. Re-run or investigate that timing-sensitive check before release.
- **Mobile verification.** Android unit tests, build and lint pass. The iOS 27.2 UI suite passes with nine tests and three expected environment-specific skips; the Duo families-and-carers test also passes. GitHub's Android and mobile-parity checks pass; its iOS check is still running at the time of this handoff.
- **Service verification.** The service check passes, and local viewer-to-service integration is verified.
- **Remaining release work.** Complete the language reviews and physical-device/distribution checks above. Manually verify the iOS Duo fold/unfold pose transition, the iOS 27 paste-runtime issue and Android API 29/33 behavior.
- **Remaining product decisions.** Resolve service access by record, Bundle identifier uniqueness, and audit/record retention and backup policy. SMART links and authoring, service authentication and authorization remain later phases.
