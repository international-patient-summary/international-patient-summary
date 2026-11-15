# Fonts for the PDF export

Self-hosted so a PDF export makes no request beyond the app's own origin
(spec F-EXP-6). Loaded only when a PDF is made.

- `NotoSans-Regular.ttf`, `NotoSans-Bold.ttf` — Noto Sans (Latin, Greek,
  Cyrillic, including Welsh ŵ ŷ), from
  <https://github.com/notofonts/notofonts.github.io/tree/main/fonts/NotoSans/hinted/ttf>.
- `NotoSansSC-Regular.otf` — Noto Sans SC (Simplified Chinese subset), from
  <https://github.com/notofonts/noto-cjk/tree/main/Sans/SubsetOTF/SC>.
  Embedded only when the PDF's text contains CJK characters.

All are licensed under the SIL Open Font License 1.1: see `OFL.txt`.
