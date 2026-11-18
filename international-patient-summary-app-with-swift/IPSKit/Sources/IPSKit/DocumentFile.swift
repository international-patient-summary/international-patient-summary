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
    guard let stream = InputStream(url: url) else { return .failure(.unreadable) }
    return readDocumentStream(stream)
}

func readDocumentStream(_ stream: InputStream) -> Result<Data, DocumentFileProblem> {
    stream.open()
    defer { stream.close() }
    var data = Data()
    var buffer = [UInt8](repeating: 0, count: 64 * 1024)
    while true {
        let remaining = maximumDocumentBytes - data.count
        let length = min(buffer.count, remaining + 1)
        let count = stream.read(&buffer, maxLength: length)
        if count < 0 { return .failure(.unreadable) }
        if count == 0 { return .success(data) }
        if count > remaining { return .failure(.refused(.tooLarge)) }
        data.append(buffer, count: count)
    }
}
