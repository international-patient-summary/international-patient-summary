import Foundation

/// One temporary export (M-PRIV-1, M-SHARE-1, M-PDF-3). Each export owns a
/// directory, so completing or cancelling it cannot remove a file that a
/// different recipient still needs.
public struct TemporaryShare: Sendable {
    public let url: URL
    private let directory: URL

    public static func write(
        _ data: Data, name: String, under root: URL,
        id: UUID = UUID(), options: Data.WritingOptions = .atomic
    ) throws -> TemporaryShare {
        let directory = root.appending(path: id.uuidString, directoryHint: .isDirectory)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let url = directory.appending(path: name)
        try data.write(to: url, options: options)
        return TemporaryShare(url: url, directory: directory)
    }

    /// Completion or cancellation removes this export only.
    public func remove() {
        try? FileManager.default.removeItem(at: directory)
    }

    /// Launch cleanup removes exports abandoned when the previous process ended.
    public static func removeAll(under root: URL) {
        try? FileManager.default.removeItem(at: root)
    }
}
