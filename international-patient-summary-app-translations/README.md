# Mobile app translations

Both mobile apps' interface strings in every language the repository's
`locales/` folder covers: 65 localizations besides US English (spec
M-I18N-2 in each app). English lives in the apps; every other language lives
here and is written into both apps by one script.

```text
languages/<code>.json   one language: {"ios": {...}, "android": {"strings": {...}, "plurals": {...}}}
source.json             the apps' English, made by `source`; what the languages are checked against
plurals.json            Android plural quantities per language (CLDR); others use one/other
translations.py         source | check | missing | generate (Python 3, standard library only)
```

## Add or change an English string

1. Change English in the app: `App/Localizable.xcstrings` (iOS) or
   `app/src/main/res/values/strings.xml` (Android). If both apps show it,
   change both.
2. `python3 translations.py source` writes `source.json`.
3. `python3 translations.py missing` lists, per language, the keys that need
   a translation. Add each to `languages/<code>.json`. A changed English
   string needs its translations changed too; `check` cannot see that.
4. `python3 translations.py generate` checks every language (every key, the
   English placeholders, all six plural forms) and writes the iOS catalog,
   the iOS home-screen name (`InfoPlist.xcstrings`, from `app.name`), the
   Xcode project's `knownRegions`, and Android's `values-*/strings.xml`.
5. Run each app's tests: `CatalogTests` (iOS) and `TranslationsTest`
   (Android) fail if a language is missing a string.

## Language codes

A file name is the code; `translations.py` maps the few that differ by
platform. iOS uses `fil` for `tl`, `yue-Hant` for `yue`. Android uses the old
`iw` and `in` for Hebrew and Indonesian (as `java.util.Locale` does), the
`b+` form for three-letter and script codes (`values-b+bho`,
`values-b+zh+Hans`), and `values-pt` for Brazilian Portuguese.

## Review

The translations are machine-made. iOS marks each `needs_review`; a string
keeps its state while its value is unchanged, so set it to `translated` in
Xcode once a clinician who reads the language has checked it. Clinical text
from a document is never translated, and never appears here.

Known questions for reviewers: words for remission, relapse, recurrence and
differential (several languages barely distinguish them); "advance
directives"; "Sex" for FHIR's administrative gender in fr, es, it and pt;
and the Irish, Luxembourgish, Scottish Gaelic and Javanese files throughout.

The relationship words for families and carers (M-PEOPLE-3) need a native
reader in every language. Several languages have no neutral word for
grandparent, grandchild or sibling, or split a parent's side, so the
translation names both (hi, gu, pa, ur, bho, bn, te, sv, lb). In some the
grandchild word also means nephew or niece (it, ro, mt, vi). "Partner" may
read as spouse (ta, ur, th, tr), and "Someone I care for" was reworded to
avoid a gendered verb (ur, mr, pa, hi, cy, he). To avoid declining a
person's name, several titles put it after "person" or a colon (cs, sk, sl,
hr, hu, et, fi, eu, lt, lv, pl, ro, ru, uk).
