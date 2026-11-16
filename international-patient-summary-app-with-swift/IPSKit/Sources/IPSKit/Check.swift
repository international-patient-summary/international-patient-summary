import Foundation

/// Why a document was refused (spec M-CHECK-1, M-CHECK-2). The codes and
/// pointers are the service's S-API-2 (`src/ips.rs`) and the web viewer's
/// `REFUSALS`; change all three together.
public enum Refusal: String, Error, Sendable, CaseIterable {
    case tooLarge = "too_large"
    case notJSON = "not_json"
    case notABundle = "not_a_bundle"
    case notADocument = "not_a_document"
    case noComposition = "no_composition"
    case notAPatientSummary = "not_a_patient_summary"
    case noSubject = "no_subject"

    /// The code, as the service names it.
    public var code: String { rawValue }

    /// Where in the document the check failed (RFC 6901, as a URI fragment).
    public var pointer: String {
        switch self {
        case .tooLarge, .notJSON: "#"
        case .notABundle: "#/resourceType"
        case .notADocument: "#/type"
        case .noComposition: "#/entry/0/resource/resourceType"
        case .notAPatientSummary: "#/entry/0/resource/type"
        case .noSubject: "#/entry/0/resource/subject/reference"
        }
    }
}

/// The largest document the app opens: 10 MiB, the service's and viewer's limit.
public let maximumDocumentBytes = 10 * 1024 * 1024

/// LOINC 60591-5, "Patient summary Document".
public let ipsLOINCCode = "60591-5"
public let loincSystem = "http://loinc.org"

/// Check that `data` is an IPS document, in the service's order.
public func check(_ data: Data) -> Result<JSON, Refusal> {
    guard data.count <= maximumDocumentBytes else { return .failure(.tooLarge) }
    guard let json = try? JSON.parse(data) else { return .failure(.notJSON) }
    if let refusal = checkIPS(json) { return .failure(refusal) }
    return .success(json)
}

/// The first S-API-2 check that `bundle` fails, or nil when it passes them all.
public func checkIPS(_ bundle: JSON) -> Refusal? {
    guard bundle["resourceType"]?.string == "Bundle" else { return .notABundle }
    guard bundle["type"]?.string == "document" else { return .notADocument }
    guard let composition = bundle["entry"]?[0]?["resource"],
        composition["resourceType"]?.string == "Composition"
    else { return .noComposition }
    let isIPS = (composition["type"]?["coding"]?.items ?? []).contains {
        $0["system"]?.string == loincSystem && $0["code"]?.string == ipsLOINCCode
    }
    guard isIPS else { return .notAPatientSummary }
    guard composition["subject"]?["reference"]?.text != nil else { return .noSubject }
    return nil
}
