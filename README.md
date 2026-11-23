# International Patient Summary

International Patient Summary - work in progress

## Contents

- `locales/<code>/index.md`: the one-page introduction to the International Patient Summary, per locale.
- `international-patient-summary.github.io/`: the website, published to <https://international-patient-summary.github.io/>. See its README for how to develop, build, and publish it.
- `international-patient-summary-ui-with-svelte/`: the viewer, the frontend (Svelte 5, SvelteKit 3, Lily Design System), with a public, backendless tour at `/tour/` that signs in as `example@example.com`. See its README.
- `international-patient-summary-service-with-axum/`: the service, the backend (Rust, Axum, Axa, sqlx, Postgres). See its README.
- `international-patient-summary-app-with-swift/`: the Apple iOS app (Swift, SwiftUI first, UIKit as the fallback). See its README.
- `international-patient-summary-app-with-kotlin/`: the Google Android app (Kotlin, Jetpack Compose). See its README.
- `international-patient-summary-app-translations/`: both mobile apps' translations (65 languages) and the script that writes them in. See its README.

The two mobile apps share one specification (§1–§7 of each `spec/index.md`), take their privacy model and roadmap from the [MyIPS user guide](https://myips.health/user-guide/), keep summaries in memory only, make no network requests, and check documents exactly as the service does.
- `bin/publish`: publishes the website folder to its own repository.
- `spec/`: cross-project specifications.

## For contributors and AI agents

- [AGENTS.md](AGENTS.md): rules for every project, the supply-chain policy, and how to verify each project. `CLAUDE.md` imports it.
- [llms.txt](llms.txt) and [llms.json](llms.json): a map of the repository for AI tools; each project has its own.
- `.github/dependabot.yml`: weekly updates for npm, Cargo and GitHub Actions, with a two-day cooldown.
