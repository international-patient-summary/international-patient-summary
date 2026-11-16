import Foundation

/// Why a document file was not read.
public enum DocumentFileProblem: Error, Equatable, Sendable {
    /// Over the limit (M-CHECK-2): refused before it is read.
    case refused(Refusal)
    /// The file could not be read at all.
    case unreadable
}

/// Read a file someone picked or dropped (M-LOAD-1, M-TAB-3), refusing one over
/// `maximumDocumentBytes` from its size before reading it. The bytes are then
/// checked like any other document.
public func readDocumentFile(at url: URL) -> Result<Data, DocumentFileProblem> {
    if let size = try? url.resourceValues(forKeys: [.fileSizeKey]).fileSize, size > maximumDocumentBytes {
        return .failure(.refused(.tooLarge))
    }
    guard let data = try? Data(contentsOf: url) else { return .failure(.unreadable) }
    // A file that grew after its size was read is still refused.
    return data.count > maximumDocumentBytes ? .failure(.refused(.tooLarge)) : .success(data)
}
