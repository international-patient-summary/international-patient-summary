import Foundation
import Testing

/// M-I18N-1: the app's string catalog (`App/Localizable.xcstrings`) has every key in
/// every language, with the same format placeholders as English.
@Suite struct CatalogTests {
    static let url = URL(filePath: #filePath)
        .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
        .deletingLastPathComponent().appending(path: "App/Localizable.xcstrings")

    typealias Catalog = [String: [String: String]]  // key -> language -> value

    static func load(_ file: URL = url) throws -> Catalog {
        let json = try #require(
            JSONSerialization.jsonObject(with: Data(contentsOf: file)) as? [String: Any])
        let strings = try #require(json["strings"] as? [String: [String: Any]])
        return strings.mapValues { entry in
            let localizations = entry["localizations"] as? [String: [String: Any]] ?? [:]
            return localizations.compactMapValues { ($0["stringUnit"] as? [String: Any])?["value"] as? String }
        }
    }

    static func placeholders(_ text: String) -> [String] {
        text.matches(of: /%(\d+\$)?(@|ld|d)/).map { String($0.output.0) }.sorted()
    }

    @Test func thereAreTranslations() throws {
        let languages = Set(try #require(Self.load()["ok"]).keys)
        #expect(languages.count > 60)
        #expect(languages.isSuperset(of: ["en", "cy", "zh-Hans", "ar"]))
    }

    @Test func everyKeyIsInEveryLanguage() throws {
        let catalog = try Self.load()
        let languages = Set(try #require(catalog["ok"]).keys)
        for (key, values) in catalog {
            #expect(Set(values.keys) == languages, "\(key): missing \(languages.subtracting(values.keys).sorted())")
            #expect(values.values.allSatisfy { !$0.trimmingCharacters(in: .whitespaces).isEmpty }, "\(key)")
        }
    }

    /// The home-screen name (`App/InfoPlist.xcstrings`) is in every language too.
    @Test func theAppNameIsInEveryLanguage() throws {
        let languages = Set(try #require(Self.load()["ok"]).keys)
        let info = Self.url.deletingLastPathComponent().appending(path: "InfoPlist.xcstrings")
        let names = try Self.load(info)
        #expect(Set(try #require(names["CFBundleDisplayName"]).keys) == languages)
        #expect(names["CFBundleDisplayName"] == (try Self.load())["app.name"])
    }

    @Test func placeholdersMatchEnglish() throws {
        for (key, values) in try Self.load() {
            let english = Self.placeholders(try #require(values["en"]))
            for (language, value) in values {
                #expect(Self.placeholders(value) == english, "\(key) [\(language)]")
            }
        }
    }
}
