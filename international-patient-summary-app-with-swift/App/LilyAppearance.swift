import LilyThemes
import SwiftUI

/// Lily's tokens for the system's light or dark appearance (spec §8.1).
func lilyTokens(for scheme: ColorScheme) -> LilyTokens {
    scheme == .dark ? .dark : .light
}

/// Lily's theme for the SwiftUI screens, light or dark as the system says, so
/// Lily's components draw with Lily's gated colour pairs and its link tint.
struct LilyAppearance: ViewModifier {
    @Environment(\.colorScheme) private var scheme

    func body(content: Content) -> some View {
        content.lilyTheme(lilyTokens(for: scheme))
    }
}

extension View {
    func lilyAppearance() -> some View { modifier(LilyAppearance()) }
}
