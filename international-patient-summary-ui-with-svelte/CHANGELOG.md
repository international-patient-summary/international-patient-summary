# Changelog

## 0.1.0 — unreleased

First implementation of the specification (spec/index.md).

- SvelteKit 3 + Svelte 5 static app (adapter-static, fully prerendered,
  client-rendered), strict Content-Security-Policy.
- Lily Design System 0.9.0 headless components, including the medical record
  lists, `MedicationView`, `ObservationView`, `MedicalBanner`,
  `AddressographBox` and `AgeView`; PickerBar 0.6.0 for theme, language, text
  size and share.
- Loading from file, drag-and-drop, paste, https URL, and the five IG 2.0.1
  examples; JSON and YAML (YAML 1.2 core schema).
- Patient banner, document details, contents, all 16 IPS sections plus a
  generic fallback, distinct absent states, narrative, source JSON, codes.
- Exports: JSON, YAML (both lossless), Markdown, one-page PDF with priority
  trimming and a never-trimmed must-show set.
- Locales: cy-001, en-US, en-GB, zh-CN (Welsh and Chinese machine-drafted,
  pending clinical review).
- Procedures and immunizations: optional timeline view (`TimelineList`).
- Tests: 120 vitest (unit, component, locale, export incl. PDF text
  extraction); 65 Playwright (loaders × fixtures, YAML = JSON rendering,
  locales, keyboard, print, axe in light/dark themes and all four locales,
  privacy, budgets).
