import Foundation

/// An IPS document the app has opened: the exact bytes, and readers for what the
/// screens show (spec §3.2, §4.2). Values, not views; the app chooses the words.
public struct Document: Sendable, Identifiable {
    public let id: UUID
    /// The bytes the document was opened from, shared back unchanged (M-SHARE-1).
    public let data: Data
    public let bundle: JSON
    public let composition: JSON
    public let patient: JSON?
    public let sections: [Section]
    let index: [String: JSON]

    /// Check `data` (M-CHECK-1, M-CHECK-2) and read it. A summary read back from
    /// the store (M-STORE-3) keeps the ID it was saved with.
    public static func open(_ data: Data, id: UUID = UUID()) -> Result<Document, Refusal> {
        check(data).map { Document(id: id, data: data, bundle: $0) }
    }

    init(id: UUID = UUID(), data: Data, bundle: JSON) {
        self.id = id
        self.data = data
        self.bundle = bundle
        let composition = bundle["entry"]?[0]?["resource"] ?? .null
        self.composition = composition
        let index = Self.index(bundle)
        self.index = index
        let resolve = { (reference: String?) in Self.resolve(reference, in: index) }
        patient = resolve(composition["subject"]?["reference"]?.text).flatMap {
            $0["resourceType"]?.string == "Patient" ? $0 : nil
        }
        sections = Self.sections(of: composition, resolve: resolve)
    }

    /// Resources by `fullUrl` and by `ResourceType/id` (M-READ-1).
    static func index(_ bundle: JSON) -> [String: JSON] {
        var index: [String: JSON] = [:]
        for entry in bundle["entry"]?.items ?? [] {
            guard let resource = entry["resource"], resource.isObject else { continue }
            if let fullUrl = entry["fullUrl"]?.text { index[fullUrl] = resource }
            if let type = resource["resourceType"]?.text, let id = resource["id"]?.text {
                let key = "\(type)/\(id)"
                if index[key] == nil { index[key] = resource }
            }
        }
        return index
    }

    static func resolve(_ reference: String?, in index: [String: JSON]) -> JSON? {
        guard let reference else { return nil }
        if let resource = index[reference] { return resource }
        // An absolute URL whose last two segments are Type/id.
        let segments = reference.split(separator: "/")
        guard segments.count >= 2 else { return nil }
        return index[segments.suffix(2).joined(separator: "/")]
    }

    /// The resource a reference names within this Bundle.
    public func resolve(_ reference: String?) -> JSON? { Self.resolve(reference, in: index) }

    // MARK: Document details (M-VIEW-2)

    public var title: String? { composition["title"]?.text }
    public var date: String? { composition["date"]?.text }

    /// The authors' names: the reference's display, or the resolved resource's name.
    public var authors: [String] {
        (composition["author"]?.items ?? []).compactMap { author in
            if let display = author["display"]?.text { return display }
            guard let resource = resolve(author["reference"]?.text) else { return nil }
            if let name = resource["name"]?.text { return name }
            if let name = formatHumanName(resource["name"]) { return name }
            if let practitioner = resolve(resource["practitioner"]?["reference"]?.text) {
                return formatHumanName(practitioner["name"])
            }
            return nil
        }
    }

    // MARK: Patient (M-VIEW-1)

    public var patientName: String? { formatHumanName(patient?["name"]) }
    public var birthDate: String? { patient?["birthDate"]?.text }
    public var gender: String? { patient?["gender"]?.text }

    /// Identifiers as (system's short name, value).
    public var identifiers: [(system: String, value: String)] {
        (patient?["identifier"]?.items ?? []).compactMap { identifier in
            guard let value = identifier["value"]?.text else { return nil }
            let system =
                identifier["system"]?.text.map(systemLabel) ?? displayOf(identifier["type"]) ?? ""
            return (system, value)
        }
    }

    /// Allergies with criticality high: shown above everything else.
    public var highCriticalityAllergies: [String] {
        sections.filter { $0.key == .allergies }.flatMap(\.entries).filter { $0.criticality == "high" }
            .map(\.text)
    }

    /// Whether the allergies section is missing from the Composition.
    public var allergiesMissing: Bool {
        sections.contains { $0.key == .allergies && $0.state == .omitted }
    }

    // MARK: Sections (M-VIEW-3, M-VIEW-5, M-VIEW-6)

    static func sections(of composition: JSON, resolve: (String?) -> JSON?) -> [Section] {
        var result: [Section] = (composition["section"]?.items ?? []).map { section in
            let code = section["code"]?["coding"]?.items.lazy.compactMap { $0["code"]?.text }.first
            let entries = (section["entry"]?.items ?? []).map { reference in
                let target = reference["reference"]?.text
                return resolve(target).map { Entry(resource: $0, resolve: resolve) } ?? .unresolved
            }
            let narrative = plainText(fromXHTML: section["text"]?["div"]?.string)
            let key = code.flatMap(SectionKey.init(code:))
            let sectionState = state(
                of: entries, emptyReason: section["emptyReason"], hasNarrative: narrative != nil,
                narrativeIsContent: key?.expectsEntries != true)
            return Section(
                key: key, code: code, title: section["title"]?.text,
                state: sectionState, entries: entries, narrative: narrative,
                emptyReason: displayOf(section["emptyReason"]))
        }
        for key in SectionKey.required where !result.contains(where: { $0.key == key }) {
            result.append(
                Section(
                    key: key, code: key.code, title: nil, state: .omitted, entries: [], narrative: nil,
                    emptyReason: nil))
        }
        return result
    }
}

/// A section's state, in the web viewer's order (`src/lib/fhir/composition.ts`):
/// any clinical entry makes it known; then entries that state an absence; then
/// `emptyReason`; then entries that do not resolve; then a narrative that is the
/// section's content (Patient Story, an unknown section); else not recorded.
func state(of entries: [Entry], emptyReason: JSON?, hasNarrative: Bool, narrativeIsContent: Bool)
    -> SectionState
{
    let resolved = entries.filter(\.resolved)
    if resolved.contains(where: { $0.absent == nil }) { return .known }
    let absent = Set(resolved.compactMap(\.absent))
    if absent.contains(.noneKnown) { return .noneKnown }
    if absent.contains(.notRecorded) { return .notRecorded }
    if let reason = IPSKit.state(fromEmptyReason: emptyReason) { return reason }
    if entries.contains(where: { !$0.resolved }) { return .unavailable }
    if hasNarrative, narrativeIsContent { return .known }
    return .notRecorded
}

/// One Composition section as the document has it.
public struct Section: Sendable {
    /// The registry key, or nil for a section this app does not know ("generic").
    public let key: SectionKey?
    public let code: String?
    /// The document's own title for the section; nil when it gives none or the section is omitted.
    public let title: String?
    public let state: SectionState
    public let entries: [Entry]
    /// The narrative as plain text.
    public let narrative: String?
    /// The words of the `emptyReason`, when there is one.
    public let emptyReason: String?
}

/// What a detail line is, so the app can label it.
public enum DetailKind: String, Sendable {
    case status, verification, type, criticality, reaction, dosage
    case onset, abatement, effective, occurrence, recorded
    case value, interpretation, referenceRange, dose, lot

    /// Whether the value is a FHIR code the app may put in words ("active").
    public var isCode: Bool { [.status, .verification, .type, .criticality].contains(self) }
}

/// One section entry, read for display (M-VIEW-4).
public struct Entry: Sendable {
    public let resourceType: String?
    /// The main text: the entry's concept, as `displayOf` writes it.
    public let text: String
    public let details: [(kind: DetailKind, value: String)]
    /// False when the reference does not resolve within the Bundle (M-READ-1).
    public let resolved: Bool
    /// Set when the entry is itself a statement of absence ("no known allergies").
    public let absent: SectionState?
    public let criticality: String?
    /// The entry's own date as the document writes it (ISO 8601), for "most recent
    /// first" (M-PDF-2): effective, occurrence, performed, onset, timing, or date.
    public let date: String?

    static let unresolved = Entry(
        resourceType: nil, text: "", details: [], resolved: false, absent: nil, criticality: nil)

    init(
        resourceType: String?, text: String, details: [(kind: DetailKind, value: String)],
        resolved: Bool, absent: SectionState?, criticality: String?, date: String? = nil
    ) {
        self.date = date
        self.resourceType = resourceType
        self.text = text
        self.details = details
        self.resolved = resolved
        self.absent = absent
        self.criticality = criticality
    }

    init(resource r: JSON, resolve: (String?) -> JSON?) {
        let type = r["resourceType"]?.string
        resourceType = type
        resolved = true
        criticality = type == "AllergyIntolerance" ? r["criticality"]?.text : nil
        let dated: [JSON?] = [
            r["effectiveDateTime"], r["effectivePeriod"]?["start"], r["occurrenceDateTime"],
            r["performedDateTime"], r["performedPeriod"]?["start"], r["onsetDateTime"],
            r["onsetPeriod"]?["start"], r["timingPeriod"]?["start"], r["date"], r["recordedDate"],
        ]
        date = dated.lazy.compactMap { $0?.text }.first

        let concept: JSON?
        switch type {
        case "MedicationStatement", "MedicationRequest":
            concept =
                r["medicationCodeableConcept"]
                ?? resolve(r["medicationReference"]?["reference"]?.text)?["code"]
        case "Immunization": concept = r["vaccineCode"]
        case "DeviceUseStatement": concept = resolve(r["device"]?["reference"]?.text)?["type"]
        case "ImmunizationRecommendation": concept = r["recommendation"]?[0]?["vaccineCode"]?[0]
        default: concept = r["code"]
        }
        absent = absentState(ofConcept: concept)
        text =
            displayOf(concept) ?? r["medicationReference"]?["display"]?.text
            ?? r["device"]?["display"]?.text ?? r["title"]?.text ?? r["description"]?.text
            ?? displayOfAny(r["category"]) ?? type ?? "?"

        var details: [(kind: DetailKind, value: String)] = []
        func add(_ kind: DetailKind, _ value: String?) {
            if let value, !value.isEmpty { details.append((kind, value)) }
        }
        add(.status, statusCode(r["clinicalStatus"]) ?? r["status"]?.text)
        add(.verification, statusCode(r["verificationStatus"]))
        add(.criticality, criticality)
        if type == "AllergyIntolerance" { add(.type, r["type"]?.text) }
        for reaction in r["reaction"]?.items ?? [] {
            let manifestation = displayOfAny(reaction["manifestation"])
            let severity = reaction["severity"]?.text
            add(.reaction, [manifestation, severity.map { "(\($0))" }].compactMap { $0 }.joined(separator: " "))
        }
        let dosage = r["dosage"]?[0] ?? r["dosageInstruction"]?[0]
        add(.dosage, dosage?["text"]?.text)
        add(.onset, formatFHIRDate(r["onsetDateTime"]?.text ?? r["onsetPeriod"]?["start"]?.text) ?? r["onsetString"]?.text)
        add(.abatement, formatFHIRDate(r["abatementDateTime"]?.text) ?? r["abatementString"]?.text)
        add(
            .effective,
            formatFHIRDate(
                r["effectiveDateTime"]?.text ?? r["effectivePeriod"]?["start"]?.text
                    ?? r["timingPeriod"]?["start"]?.text))
        add(
            .occurrence,
            formatFHIRDate(
                r["occurrenceDateTime"]?.text ?? r["performedDateTime"]?.text
                    ?? r["performedPeriod"]?["start"]?.text) ?? r["occurrenceString"]?.text)
        add(
            .value,
            formatQuantity(r["valueQuantity"]) ?? r["valueString"]?.text ?? displayOf(r["valueCodeableConcept"])
                ?? r["valueBoolean"]?.bool.map { $0 ? "true" : "false" } ?? r["valueInteger"]?.number.map(formatNumber))
        add(.interpretation, displayOfAny(r["interpretation"]))
        let range = r["referenceRange"]?[0]
        add(.referenceRange, range?["text"]?.text ?? range.flatMap(formatRange))
        add(.dose, r["protocolApplied"]?[0]?["doseNumberPositiveInt"]?.number.map(formatNumber))
        add(.lot, r["lotNumber"]?.text)
        self.details = details
    }

    /// The value of the first detail of `kind`.
    public func detail(_ kind: DetailKind) -> String? { details.first { $0.kind == kind }?.value }
}
