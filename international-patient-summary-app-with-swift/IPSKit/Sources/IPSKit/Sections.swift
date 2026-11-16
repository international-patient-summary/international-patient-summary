/// The IPS 2.0.1 sections (spec M-READ-3; the web viewer's `src/lib/fhir/sections.ts`).
public enum SectionKey: String, Sendable, CaseIterable {
    case allergies, medications, problems
    case immunizations, results, procedures, devices
    case vitalSigns, pastIllness, functional, planOfCare, socialHistory, pregnancy
    case advanceDirectives, alerts, patientStory

    /// The section's LOINC code.
    public var code: String {
        switch self {
        case .allergies: "48765-2"
        case .medications: "10160-0"
        case .problems: "11450-4"
        case .immunizations: "11369-6"
        case .results: "30954-2"
        case .procedures: "47519-4"
        case .devices: "46264-8"
        case .vitalSigns: "8716-3"
        case .pastIllness: "11348-0"
        case .functional: "47420-5"
        case .planOfCare: "18776-5"
        case .socialHistory: "29762-2"
        case .pregnancy: "10162-6"
        case .advanceDirectives: "42348-3"
        case .alerts: "104605-1"
        case .patientStory: "81338-6"
        }
    }

    public var level: SectionLevel {
        switch self {
        case .allergies, .medications, .problems: .required
        case .immunizations, .results, .procedures, .devices: .recommended
        default: .optional
        }
    }

    /// Whether the IG gives this section entries; Patient Story is narrative only.
    public var expectsEntries: Bool { self != .patientStory }

    /// The section a LOINC code names, if it is one of these.
    public init?(code: String) {
        guard let key = Self.allCases.first(where: { $0.code == code }) else { return nil }
        self = key
    }

    /// The required sections, in the order they are listed when missing.
    public static let required: [SectionKey] = [.allergies, .medications, .problems]
}

public enum SectionLevel: String, Sendable {
    case required, recommended, optional
}
