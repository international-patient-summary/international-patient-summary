// Versions live in gradle/libs.versions.toml; see AGENTS.md for the age rule.
plugins {
    alias(libs.plugins.android.application) apply false
    alias(libs.plugins.kotlin.compose) apply false
}
