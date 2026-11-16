#!/usr/bin/env python3
"""The mobile apps' translations (spec M-I18N-2), kept in one place.

    python3 translations.py source     # English from both apps -> source.json
    python3 translations.py check      # every language has every string, same placeholders
    python3 translations.py missing    # what each language still needs, after an English change
    python3 translations.py generate   # languages/*.json -> both apps' string files

English lives in the apps (iOS `App/Localizable.xcstrings`, Android
`res/values/strings.xml`). Every other language lives here, in
`languages/<code>.json`, and `generate` writes it into both apps. Standard
library only.
"""

import json
import os
import re
import sys
import xml.etree.ElementTree as ET
from xml.sax.saxutils import escape

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
CATALOG = os.path.join(REPO, "international-patient-summary-app-with-swift/App/Localizable.xcstrings")
INFO_PLIST_CATALOG = os.path.join(REPO, "international-patient-summary-app-with-swift/App/InfoPlist.xcstrings")
RES = os.path.join(REPO, "international-patient-summary-app-with-kotlin/app/src/main/res")
SOURCE = os.path.join(HERE, "source.json")
LANGUAGES = os.path.join(HERE, "languages")

# languages/<code>.json -> (iOS localization, Android values-* qualifier). A code
# not listed maps to itself on both. Android: java.util.Locale still uses the old
# codes for Hebrew and Indonesian (lint LocaleFolder), and three-letter and
# script codes use the b+ form.
PLATFORM = {
    "en-GB": ("en-GB", "en-rGB"),
    "pt-BR": ("pt-BR", "pt"),
    "pt-PT": ("pt-PT", "pt-rPT"),
    "zh-Hans": ("zh-Hans", "b+zh+Hans"),
    "zh-Hant": ("zh-Hant", "b+zh+Hant"),
    "yue": ("yue-Hant", "b+yue"),
    "wuu": ("wuu", "b+wuu"),
    "bho": ("bho", "b+bho"),
    "pcm": ("pcm", "b+pcm"),
    "sco": ("sco", "b+sco"),
    "tl": ("fil", "tl"),
    "he": ("he", "iw"),
    "id": ("id", "in"),
}

# Android plural quantities per language (CLDR cardinal categories); default one/other.
PLURALS = json.load(open(os.path.join(HERE, "plurals.json")))
CATEGORIES = ["zero", "one", "two", "few", "many", "other"]
PLACEHOLDER = re.compile(r"%(?:\d+\$)?(?:@|ld|d|s)")

# Context for translators, by key (a trailing * matches a prefix).
NOTES = {
    "code.*": "FHIR status and category codes beside a condition, allergy, medication, immunization or result: clinical status (Active, Resolved), verification status (Confirmed, Refuted), result status (Final, Preliminary), medication status (Intended, Not taken). One or two words. Stopped (discontinued) and Cancelled (never started) must differ.",
    "code_*": "As code.* in the iOS strings: use the same words.",
    "detail.lot": "Vaccine lot (batch) number label.",
    "detail.dose": "Immunization dose number label.",
    "detail.value": "An observation's measured value label.",
    "detail.format": "Label: value. Keep the two placeholders.",
    "detail_line": "Label: value. Keep the two placeholders.",
    "identifier_line": "System: value. Keep the two placeholders.",
    "row_delete_background": "Shown behind a list row as it is swiped away to delete it.",
    "refusal.code": "Followed by a machine code such as not_json, never translated.",
    "problem_code": "Followed by a machine code such as not_json, never translated.",
    "app.name": "The app's name: short, under the icon and on the privacy cover.",
    "app_name": "The app's name: short, under the icon and on the privacy cover.",
    "state.unavailableReason": "Followed by a reason the document gives, in its own words.",
}


def english():
    catalog = json.load(open(CATALOG))
    ios = {k: v["localizations"]["en"]["stringUnit"]["value"] for k, v in catalog["strings"].items()}
    strings, plurals = {}, {}
    for e in ET.parse(os.path.join(RES, "values/strings.xml")).getroot():
        unescape = lambda s: s.replace("\\'", "'").replace('\\"', '"')
        if e.tag == "string":
            strings[e.get("name")] = unescape(e.text)
        elif e.tag == "plurals":
            plurals[e.get("name")] = {i.get("quantity"): unescape(i.text) for i in e}
    return {"ios": ios, "android": {"strings": strings, "plurals": plurals}, "notes": NOTES}


def codes():
    return sorted(f[:-5] for f in os.listdir(LANGUAGES) if f.endswith(".json"))


def load(code):
    return json.load(open(os.path.join(LANGUAGES, f"{code}.json")))


def problems(src, code, t):
    out = []

    def compare(path, en, tr):
        if not isinstance(tr, str) or not tr.strip():
            out.append(f"{path}: missing")
        elif sorted(PLACEHOLDER.findall(en)) != sorted(PLACEHOLDER.findall(tr)):
            out.append(f"{path}: placeholders {PLACEHOLDER.findall(en)} != {PLACEHOLDER.findall(tr)}")
        elif "..." in tr:
            out.append(f"{path}: use … not ...")

    for k, en in src["ios"].items():
        compare(f"{code} ios {k}", en, t.get("ios", {}).get(k))
    for k in set(t.get("ios", {})) - set(src["ios"]):
        out.append(f"{code} ios {k}: no longer in English")
    for k, en in src["android"]["strings"].items():
        compare(f"{code} android {k}", en, t.get("android", {}).get("strings", {}).get(k))
    for k in set(t.get("android", {}).get("strings", {})) - set(src["android"]["strings"]):
        out.append(f"{code} android {k}: no longer in English")
    for k in src["android"]["plurals"]:
        forms = t.get("android", {}).get("plurals", {}).get(k, {})
        for c in CATEGORIES:
            compare(f"{code} android plural {k}[{c}]", "%d", forms.get(c))
    return out


def check():
    src = json.load(open(SOURCE))
    if src != english():
        print("source.json is out of date with the apps' English: run `source` first")
        return 1
    found = [p for c in codes() for p in problems(src, c, load(c))]
    print("\n".join(found) if found else f"OK: {len(codes())} languages")
    return 1 if found else 0


def missing():
    """After an English change: what each language needs, as one list to translate."""
    src = json.load(open(SOURCE))
    todo = {}
    for c in codes():
        t = load(c)
        need = [k for k, en in src["ios"].items() if not t["ios"].get(k)]
        need += [k for k in src["android"]["strings"] if not t["android"]["strings"].get(k)]
        if need:
            todo[c] = need
    print(json.dumps(todo, ensure_ascii=False, indent=1) if todo else "nothing missing")
    return 0


def android_escape(text):
    text = escape(text).replace("\\", "\\\\").replace("'", "\\'").replace('"', '\\"')
    return "\\" + text if text[:1] in "@?" else text


def write_catalog(path, catalog):
    with open(path, "w") as f:
        json.dump(catalog, f, ensure_ascii=False, indent=2, separators=(",", " : "))
        f.write("\n")


def generate():
    if check():
        return 1
    src = json.load(open(SOURCE))
    langs = {c: load(c) for c in codes()}

    # iOS: one catalog. A string keeps its review state while its value is
    # unchanged; a new or changed translation is `needs_review`.
    catalog = json.load(open(CATALOG))
    for key, entry in catalog["strings"].items():
        old = entry.get("localizations", {})
        new = {"en": old["en"]}
        for c, t in langs.items():
            ios = PLATFORM.get(c, (c, c))[0]
            value = t["ios"][key]
            before = old.get(ios, {}).get("stringUnit", {})
            state = before.get("state", "needs_review") if before.get("value") == value else "needs_review"
            new[ios] = {"stringUnit": {"state": state, "value": value}}
        entry["localizations"] = dict(sorted(new.items()))
    write_catalog(CATALOG, catalog)

    # iOS: the home-screen name (CFBundleDisplayName) is app.name in each language.
    info = {"sourceLanguage": "en", "version": "1.0", "strings": {}}
    if os.path.exists(INFO_PLIST_CATALOG):
        info = json.load(open(INFO_PLIST_CATALOG))
    for key in ("CFBundleDisplayName", "CFBundleName"):
        entry = info["strings"].setdefault(key, {})
        entry["comment"] = "The app's name on the home screen (spec M-I18N-2); from app.name."
        entry["extractionState"] = "manual"
        old = entry.get("localizations", {})
        names = {"en": src["ios"]["app.name"]} | {PLATFORM.get(c, (c, c))[0]: t["ios"]["app.name"] for c, t in langs.items()}
        entry["localizations"] = {}
        for ios, value in sorted(names.items()):
            before = old.get(ios, {}).get("stringUnit", {})
            state = "translated" if ios == "en" else (before.get("state", "needs_review") if before.get("value") == value else "needs_review")
            entry["localizations"][ios] = {"stringUnit": {"state": state, "value": value}}
    info["strings"] = dict(sorted(info["strings"].items()))
    write_catalog(INFO_PLIST_CATALOG, info)

    # iOS: the project's knownRegions.
    project = os.path.join(REPO, "international-patient-summary-app-with-swift/IPSApp.xcodeproj/project.pbxproj")
    text = open(project).read()
    regions = sorted(["en"] + [PLATFORM.get(c, (c, c))[0] for c in langs]) + ["Base"]
    quote = lambda r: r if re.fullmatch(r"[A-Za-z0-9]+", r) else f'"{r}"'
    body = "".join(f"\t\t\t\t{quote(r)},\n" for r in regions)
    open(project, "w").write(re.sub(r"knownRegions = \(\n.*?\t\t\t\);", "knownRegions = (\n" + body + "\t\t\t);", text, flags=re.S))

    # Android: values-<qualifier>/strings.xml in values/ order.
    order = list(src["android"]["strings"])
    for c, t in langs.items():
        android = t["android"]
        quantities = PLURALS.get(c.split("-")[0], ["one", "other"])
        lines = [
            '<?xml version="1.0" encoding="utf-8"?>',
            "<!-- Generated by international-patient-summary-app-translations/translations.py from",
            f"     languages/{c}.json; edit that file, not this one (spec M-I18N-2). -->",
            '<resources xmlns:tools="http://schemas.android.com/tools">',
        ]
        for name in order:
            ignore = ' tools:ignore="TypographyDashes"' if name == "refusal_not_a_patient_summary" else ""
            lines.append(f'    <string name="{name}"{ignore}>{android_escape(android["strings"][name])}</string>')
        for name, forms in android["plurals"].items():
            lines.append(f'    <plurals name="{name}">')
            lines += [f'        <item quantity="{q}">{android_escape(forms[q])}</item>' for q in quantities]
            lines.append("    </plurals>")
        lines.append("</resources>")
        folder = os.path.join(RES, "values-" + PLATFORM.get(c, (c, c))[1])
        os.makedirs(folder, exist_ok=True)
        open(os.path.join(folder, "strings.xml"), "w").write("\n".join(lines) + "\n")
    print(f"wrote {len(langs)} languages into both apps")
    return 0


def source():
    with open(SOURCE, "w") as f:
        json.dump(english(), f, ensure_ascii=False, indent=1)
        f.write("\n")
    print("source.json written")
    return 0


if __name__ == "__main__":
    commands = {"source": source, "check": check, "missing": missing, "generate": generate}
    if len(sys.argv) != 2 or sys.argv[1] not in commands:
        sys.exit(__doc__)
    sys.exit(commands[sys.argv[1]]())
