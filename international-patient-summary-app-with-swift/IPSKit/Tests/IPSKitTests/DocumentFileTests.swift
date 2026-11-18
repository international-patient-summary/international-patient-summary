import Foundation
import Testing

@testable import IPSKit

/// M-LOAD-1, M-TAB-3: a picked or dropped file, read with the size limit first.
@Suite struct DocumentFileTests {
    static func temporary(_ data: Data) throws -> URL {
        let url = FileManager.default.temporaryDirectory.appending(path: "ipskit-\(UUID().uuidString).json")
        try data.write(to: url)
        return url
    }

    @Test func aDocumentIsReadAsItsBytes() throws {
        let bytes = try DocumentTests.data("bundle-minimal")
        let url = try Self.temporary(bytes)
        defer { try? FileManager.default.removeItem(at: url) }
        #expect(readDocumentFile(at: url) == .success(bytes))
    }

    @Test func aFileOverTheLimitIsRefusedAsTooLarge() throws {
        let url = try Self.temporary(Data(count: maximumDocumentBytes + 1))
        defer { try? FileManager.default.removeItem(at: url) }
        #expect(readDocumentFile(at: url) == .failure(.refused(.tooLarge)))
    }

    @Test func theStreamLimitAppliesEvenWithoutAFileSize() {
        let bytes = Data(repeating: 42, count: maximumDocumentBytes)
        #expect(readDocumentStream(InputStream(data: bytes)) == .success(bytes))
        #expect(readDocumentStream(InputStream(data: bytes + Data([42]))) == .failure(.refused(.tooLarge)))
    }

    @Test func aMissingFileIsUnreadable() {
        let url = FileManager.default.temporaryDirectory.appending(path: "ipskit-missing-\(UUID().uuidString).json")
        #expect(readDocumentFile(at: url) == .failure(.unreadable))
    }
}
