[Specification](index.md) › §6

# 6. Accessibility and language

- **M-A11Y-1** Every control has an accessible label; section and screen
  titles are headings to the screen reader; rows read as one sentence.
- **M-A11Y-2** Text follows the system text size (up to the largest
  accessibility sizes) without clipping; light and dark appearance follow
  the system; contrast meets WCAG 2.2 AA; touch targets are at least 44 pt
  (iOS) or 48 dp (Android).
- **M-I18N-1** Every interface string comes from the platform's string
  resources, English first. Clinical text is never translated.
- **M-I18N-2** The apps speak every language the repository's `locales/`
  folder covers: 65 localizations besides US English (60 languages, pt-BR
  and pt-PT, zh-Hans and zh-Hant, and en-GB). Every language has every
  string, with the same placeholders as English, and the platform's plural
  forms for counts. Right-to-left languages lay out right to left. Numbers
  the app writes (dates, ages) use the language's own digits, all alike;
  values from the document (quantities, identifiers) stay as written. The
  translations live in `international-patient-summary-app-translations/`,
  which writes them into both apps. They are machine-made and marked as
  needing review: a clinician who reads the language checks each one before
  a release names it.
