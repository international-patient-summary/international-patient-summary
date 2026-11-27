import LilyThemes
import SwiftUI
import Testing

@testable import IPSApp

/// The SwiftUI screens use Lily's theme, light or dark as the system says (spec §8.1).
@Suite struct LilyAppearanceTests {
    @Test func theTokensFollowTheAppearance() {
        #expect(lilyTokens(for: .light) == .light)
        #expect(lilyTokens(for: .dark) == .dark)
    }
}
