import Foundation

// Writing FHIR datatypes for people (spec M-VIEW-7). These decide how a value
// is written, never what it is: no unit conversion, rounding or terminology.

let systemLabels: [String: String] = [
    "http://snomed.info/sct": "SNOMED CT",
    "http://loinc.org": "LOINC",
    "http://www.whocc.no/atc": "ATC",
    "http://hl7.org/fhir/sid/icd-10": "ICD-10",
    "http://hl7.org/fhir/sid/icd-10-cm": "ICD-10-CM",
    "http://id.who.int/icd/release/11/mms": "ICD-11",
    "http://hl7.org/fhir/sid/cvx": "CVX",
    "http://www.nlm.nih.gov/research/umls/rxnorm": "RxNorm",
    "http://unitsofmeasure.org": "UCUM",
    "http://hl7.org/fhir/uv/ips/CodeSystem/absent-unknown-uv-ips": "IPS absent/unknown",
    "http://terminology.hl7.org/CodeSystem/list-empty-reason": "List empty reason",
    "http://terminology.hl7.org/CodeSystem/data-absent-reason": "Data absent reason",
    "http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation": "v3 ObservationInterpretation",
    "http://terminology.hl7.org/CodeSystem/v3-ActCode": "v3 ActCode",
    "http://terminology.hl7.org/CodeSystem/v3-Confidentiality": "v3 Confidentiality",
    "http://standardterms.edqm.eu": "EDQM",
    "urn:oid:1.2.36.1.2001.1005.17": "AMT",
    "http://hl7.org/fhir/sid/ndc": "NDC",
    "http://hl7.org/fhir/sid/us-ssn": "US SSN",
    "https://fhir.nhs.uk/Id/nhs-number": "NHS number",
]

/// A short name for a code system URI; the URI itself when it has none.
public func systemLabel(_ system: String?) -> String {
    guard let system else { return "" }
    return systemLabels[system] ?? system
}

/// The words for a CodeableConcept: `coding.display`, then `text`, then `system|code`.
public func displayOf(_ concept: JSON?) -> String? {
    guard let concept else { return nil }
    let codings = concept["coding"]?.items ?? []
    if let display = codings.lazy.compactMap({ $0["display"]?.text }).first { return display }
    if let text = concept["text"]?.text { return text }
    if let coding = codings.first(where: { $0["code"]?.text != nil }), let code = coding["code"]?.text {
        if let system = coding["system"]?.text { return "\(systemLabel(system))|\(code)" }
        return code
    }
    return nil
}

/// The code of a status concept (`clinicalStatus`, `verificationStatus`), such as
/// "active": the app puts it in words. Falls back to the display, then `text`.
public func statusCode(_ concept: JSON?) -> String? {
    let codings = concept?["coding"]?.items ?? []
    return codings.lazy.compactMap { $0["code"]?.text }.first
        ?? codings.lazy.compactMap { $0["display"]?.text }.first ?? concept?["text"]?.text
}

/// The display of the first concept in an array that has one.
public func displayOfAny(_ concepts: JSON?) -> String? {
    concepts?.items.lazy.compactMap(displayOf).first
}

/// A person's name: `text`, or given names then family name. Prefers an `official`
/// then `usual` name over the first.
public func formatHumanName(_ names: JSON?) -> String? {
    let all = names?.items ?? []
    let preferred =
        all.first { $0["use"]?.string == "official" } ?? all.first { $0["use"]?.string == "usual" }
        ?? all.first
    guard let name = preferred else { return nil }
    if let text = name["text"]?.text { return text }
    let parts =
        (name["prefix"]?.items ?? []).compactMap(\.text) + (name["given"]?.items ?? []).compactMap(\.text)
        + [name["family"]?.text].compactMap { $0 } + (name["suffix"]?.items ?? []).compactMap(\.text)
    return parts.isEmpty ? nil : parts.joined(separator: " ")
}

/// The parts of a FHIR date, dateTime or instant: year, and month and day when given.
public struct FHIRDate: Sendable, Equatable {
    public let year: Int
    public let month: Int?
    public let day: Int?

    public init?(_ text: String?) {
        guard let text, text.count >= 4 else { return nil }
        let digits = text.split(separator: "T", maxSplits: 1).first.map(String.init) ?? text
        let parts = digits.split(separator: "-", omittingEmptySubsequences: false).map { Int($0) }
        guard let year = parts.first ?? nil, (1...9999).contains(year) else { return nil }
        self.year = year
        month = parts.count > 1 ? parts[1].flatMap { (1...12).contains($0) ? $0 : nil } : nil
        day = month != nil && parts.count > 2 ? parts[2].flatMap { (1...31).contains($0) ? $0 : nil } : nil
    }
}

/// A FHIR date written with the month as text ("11 December 2017"), so it cannot be
/// read two ways. Partial dates stay partial. The time of day is not shown.
public func formatFHIRDate(_ text: String?, locale: Locale = .current) -> String? {
    guard let date = FHIRDate(text) else { return nil }
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = TimeZone(identifier: "UTC")!
    let components = DateComponents(year: date.year, month: date.month ?? 1, day: date.day ?? 1)
    guard let instant = calendar.date(from: components) else { return nil }
    let formatter = DateFormatter()
    formatter.calendar = calendar
    formatter.timeZone = calendar.timeZone
    formatter.locale = locale
    let template = date.day != nil ? "dMMMMy" : date.month != nil ? "MMMMy" : "y"
    formatter.setLocalizedDateFormatFromTemplate(template)
    return formatter.string(from: instant)
}

/// Whole years from a full birth date to `today`; nil for a partial date.
public func ageInYears(birthDate: String?, today: Date = Date()) -> Int? {
    guard let birth = FHIRDate(birthDate), let month = birth.month, let day = birth.day else { return nil }
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = TimeZone(identifier: "UTC")!
    let now = calendar.dateComponents([.year, .month, .day], from: today)
    guard let year = now.year, let nowMonth = now.month, let nowDay = now.day else { return nil }
    let age = year - birth.year - ((nowMonth, nowDay) < (month, day) ? 1 : 0)
    return age >= 0 ? age : nil
}

/// A number as FHIR gave it, without a trailing ".0".
public func formatNumber(_ value: Double) -> String {
    if value.rounded() == value, abs(value) < 1e15 { return String(Int64(value)) }
    return String(value)
}

/// A Quantity: comparator, value, a no-break space, and the unit.
public func formatQuantity(_ quantity: JSON?) -> String? {
    guard let quantity, let value = quantity["value"]?.number else { return nil }
    let comparator = quantity["comparator"]?.text ?? ""
    let unit = quantity["unit"]?.text ?? quantity["code"]?.text
    return comparator + formatNumber(value) + (unit.map { "\u{00A0}\($0)" } ?? "")
}

/// A Range: "low–high".
public func formatRange(_ range: JSON?) -> String? {
    let low = formatQuantity(range?["low"])
    let high = formatQuantity(range?["high"])
    switch (low, high) {
    case let (low?, high?): return "\(low)–\(high)"
    case let (low?, nil): return "≥\(low)"
    case let (nil, high?): return "≤\(high)"
    default: return nil
    }
}

/// An XHTML narrative as plain text (spec M-VIEW-6): markup removed, entities
/// decoded, blocks on lines of their own. Nothing in it is run or loaded.
public func plainText(fromXHTML xhtml: String?) -> String? {
    guard var text = xhtml, !text.isEmpty else { return nil }
    let rules: [(String, String)] = [
        ("(?is)<(script|style)\\b.*?</\\1\\s*>", ""),
        ("(?i)<br\\s*/?>", "\n"),
        ("(?i)<li\\b[^>]*>", "\n• "),
        ("(?i)</t[dh]\\s*>", "\t"),
        ("(?i)</?(p|div|tr|table|thead|tbody|ul|ol|h[1-6])\\b[^>]*>", "\n"),
        ("<[^>]*>", ""),
    ]
    for (pattern, replacement) in rules {
        text = text.replacingOccurrences(of: pattern, with: replacement, options: .regularExpression)
    }
    text = decodeEntities(text)
    let lines = text.components(separatedBy: "\n").map {
        $0.replacingOccurrences(of: "[ \\t\\u00A0]+", with: " ", options: .regularExpression)
            .trimmingCharacters(in: .whitespaces)
    }
    let result = lines.filter { !$0.isEmpty }.joined(separator: "\n")
    return result.isEmpty ? nil : result
}

func decodeEntities(_ text: String) -> String {
    guard text.contains("&") else { return text }
    let named = ["amp": "&", "lt": "<", "gt": ">", "quot": "\"", "apos": "'", "nbsp": "\u{00A0}"]
    var result = ""
    var rest = Substring(text)
    while let ampersand = rest.firstIndex(of: "&") {
        result += rest[..<ampersand]
        let after = rest[rest.index(after: ampersand)...]
        if let semicolon = after.prefix(10).firstIndex(of: ";") {
            let name = after[..<semicolon]
            var scalar: String?
            if name.hasPrefix("#x") || name.hasPrefix("#X") {
                scalar = UInt32(name.dropFirst(2), radix: 16).flatMap(Unicode.Scalar.init).map { String($0) }
            } else if name.hasPrefix("#") {
                scalar = UInt32(name.dropFirst()).flatMap(Unicode.Scalar.init).map { String($0) }
            } else {
                scalar = named[String(name)]
            }
            if let scalar {
                result += scalar
                rest = after[after.index(after: semicolon)...]
                continue
            }
        }
        result += "&"
        rest = after
    }
    return result + rest
}
