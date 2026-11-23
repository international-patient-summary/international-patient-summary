# AGENTS.md

Guidance for AI agents (and people) working anywhere in this repository. Each
project has its own `AGENTS.md` with its rules; read it before changing that
project.

## Projects

| Folder                                            | What                                                                                  | Rules                                                         |
| ------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `locales/<code>/index.md`                         | The one-page IPS introduction, in 116 locales                                         | Content; the website vendors it                               |
| `international-patient-summary.github.io/`        | The website (SvelteKit 3, Lily Design System, GitHub Pages), published by `bin/publish` | its `README.md`                                             |
| `international-patient-summary-ui-with-svelte/`   | The viewer, the **frontend** (Svelte 5, SvelteKit 3, Lily), with a backendless tour   | [its AGENTS.md](international-patient-summary-ui-with-svelte/AGENTS.md)   |
| `international-patient-summary-service-with-axum/` | The service, the **backend** (Rust, Axum, Axa 0.19, sqlx, Postgres)                  | [its AGENTS.md](international-patient-summary-service-with-axum/AGENTS.md) |
| `international-patient-summary-app-with-swift/`   | The iOS app (Swift, SwiftUI first, UIKit fallback)                                     | [its AGENTS.md](international-patient-summary-app-with-swift/AGENTS.md)   |
| `international-patient-summary-app-with-kotlin/`  | The Android app (Kotlin, Jetpack Compose)                                              | [its AGENTS.md](international-patient-summary-app-with-kotlin/AGENTS.md)  |
| `international-patient-summary-app-translations/` | Both mobile apps' translations (65 languages) and the script that writes them in       | [its README.md](international-patient-summary-app-translations/README.md) |
| `spec/`                                           | Cross-project specifications (GitHub Discussions, locales)                            |                                                               |

## Rules for every project

- Specification-driven: each project's `spec/index.md` is its source of truth.
  A change in behaviour carries a spec edit, a code edit and a test edit in
  the same commit, and updates `plans.md`/`tasks.md` where they exist.
- The frontend and backend share one API contract: the service's spec §4 and
  the viewer's spec §6.8 (`src/lib/service/`). Change them together.
- One IPS check everywhere: the service's S-API-2, the viewer's
  `checkIps`, and both mobile apps' M-CHECK-1 (same order, codes, pointers).
- The two mobile apps share spec §1–§7 word for word; change both. Their
  translations live in `international-patient-summary-app-translations/`:
  after an English string changes, run `translations.py source`, add the
  string to every `languages/*.json` (`missing` lists them), then `generate`.
- Patient data is never sent anywhere it was not asked to go, and never
  logged. The web viewer keeps it in memory only. The mobile apps keep it on
  the device only, encrypted at rest under a key that never leaves the
  device, out of backups and device transfer (their spec M-STORE); nothing
  else persists it. The tour uses only published, fictional examples.
- Supply chain: Cargo enforces a two-day minimum publish age, and pnpm a
  minimum release age. Never disable either; exempt only an exact version the
  user names (`pnpm-workspace.yaml` `minimumReleaseAgeExclude`; for Cargo,
  lock that crate alone). Dependabot uses the same two-day cooldown.
- Rust: edition 2024, `rust-version` stable minus two. Node 26, pnpm 11,
  TypeScript 6 (TypeScript 7 waits for svelte-check support). iOS: Swift 6
  mode, deployment target current iOS minus two majors. Android: Kotlin only,
  versions in `gradle/libs.versions.toml`, each at least two days old.
- Keep each `AGENTS.md` under 40 kB, and `llms.txt`/`llms.json` current when
  files, commands or features change.
- Commit or push only when asked. `origin` pushes to GitHub, Codeberg and GitLab.

## Verify

GitHub runs only the root `.github/workflows/`: `viewer-check`, `service-check`,
`ios-check`, `android-check` and `site-check` run these on pull requests and on
pushes to `main` that change their folder. On mobile app or translation changes,
`mobile-parity` also compares the shared specs and regenerates the catalogs.

```sh
# viewer
cd international-patient-summary-ui-with-svelte && pnpm run lint && pnpm run check && pnpm test && pnpm run test:e2e
# service (AXA_TEST_DB_URL: a Postgres role that may create databases)
cd international-patient-summary-service-with-axum && cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test -- --include-ignored
# website
cd international-patient-summary.github.io && pnpm run lint && pnpm run check && pnpm run build
# iOS app
cd international-patient-summary-app-with-swift/IPSKit && swift test && cd .. && xcodebuild test -project IPSApp.xcodeproj -scheme IPSApp -destination 'platform=iOS Simulator,name=iPhone 18 Pro Max' CODE_SIGN_IDENTITY=- CODE_SIGNING_REQUIRED=NO
# Android app
cd international-patient-summary-app-with-kotlin && ./gradlew testDebugUnitTest assembleDebug lintDebug
# Android smoke test (optional; needs a running emulator or phone)
cd international-patient-summary-app-with-kotlin && ./gradlew connectedDebugAndroidTest
```
