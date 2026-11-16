// Absent and unknown data (spec M-VIEW-5), as the web viewer's
// `src/lib/fhir/absent.ts` decides it. Words are the app's; this says which state.

public let absentUnknownSystem = "http://hl7.org/fhir/uv/ips/CodeSystem/absent-unknown-uv-ips"
public let snomedSystem = "http://snomed.info/sct"

/// SNOMED CT concepts that state an explicit negation ("none known").
let snomedNoneKnown: Set<String> = [
    "716186003",  // No known allergy
    "409137002",  // No known history of drug allergy
    "428607008",  // No known environmental allergy
    "429625007",  // No known food allergy
    "428197003",  // No known insect allergy
    "160245001",  // No current problems or disability
]

/// What a section says about its contents.
public enum SectionState: String, Sendable {
    /// Clinical entries, or a narrative.
    case known
    /// An explicit negation: "no known allergies".
    case noneKnown
    /// Not asked, not started, or nothing there.
    case notRecorded
    /// Withheld, unavailable, or closed.
    case unavailable
    /// A required section the Composition does not have.
    case omitted
}

/// The state an `emptyReason` names; an unknown code reads as unavailable.
public func state(fromEmptyReason reason: JSON?) -> SectionState? {
    guard let reason else { return nil }
    let code = reason["coding"]?.items.lazy.compactMap { $0["code"]?.string }.first
    switch code {
    case "nilknown": return .noneKnown
    case "notasked", "notstarted": return .notRecorded
    default: return .unavailable
    }
}

/// What an IPS absent/unknown or SNOMED CT negation code states, if anything.
public func absentState(ofConcept concept: JSON?) -> SectionState? {
    for coding in concept?["coding"]?.items ?? [] {
        guard let code = coding["code"]?.string else { continue }
        let system = coding["system"]?.string
        if system == absentUnknownSystem {
            if code.hasPrefix("no-known-") { return .noneKnown }
            if code.hasSuffix("-info") { return .notRecorded }
        }
        if system == snomedSystem, snomedNoneKnown.contains(code) { return .noneKnown }
    }
    return nil
}
