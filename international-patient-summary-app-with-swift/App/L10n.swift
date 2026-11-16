import Foundation
import IPSKit

/// Interface words from `Localizable.xcstrings` (M-I18N-1). Clinical text from a
/// document never goes through here: it is shown as the document has it.
enum L10n {
    /// A missing key shows as ⟦key⟧, which the UI tests look for.
    static func text(_ key: String, _ arguments: any CVarArg...) -> String {
        let format = Bundle.main.localizedString(forKey: key, value: "⟦\(key)⟧", table: nil)
        return arguments.isEmpty ? format : String(format: format, locale: .current, arguments: arguments)
    }

    static func refusal(_ refusal: Refusal) -> String {
        text("refusal.\(refusal.code)")
    }

    static func sectionTitle(_ key: SectionKey?) -> String {
        key.map { text("section.\($0.rawValue)") } ?? text("section.generic")
    }

    static func state(_ state: SectionState, reason: String?) -> String? {
        switch state {
        case .known: nil
        case .noneKnown: text("state.noneKnown")
        case .notRecorded: text("state.notRecorded")
        case .unavailable: reason.map { text("state.unavailableReason", $0) } ?? text("state.unavailable")
        case .omitted: text("state.omitted")
        }
    }

    static func detail(_ kind: DetailKind, _ value: String) -> String {
        text("detail.format", text("detail.\(kind.rawValue)"), kind.isCode ? code(value) : value)
    }

    /// A FHIR code in words when the catalog has it ("active" → "Active"); else the code.
    static func code(_ code: String) -> String {
        Bundle.main.localizedString(forKey: "code.\(code)", value: code, table: nil)
    }

    static func gender(_ code: String) -> String {
        ["male", "female", "other", "unknown"].contains(code) ? text("gender.\(code)") : code
    }
}
