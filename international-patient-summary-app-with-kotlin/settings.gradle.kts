// International Patient Summary app with Kotlin (spec/index.md §9).
pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "international-patient-summary-app-with-kotlin"
include(":app")

// Lily Design System for Android, built from a local checkout (spec §9.1). Set `lily.dir` in
// ~/.gradle/gradle.properties or pass -Plily.dir=... to put the checkout elsewhere.
val lilyDir = providers.gradleProperty("lily.dir").orNull
    ?: "../../../lilydesignsystem/lily-design-system/lily-design-system-kotlin"
includeBuild(lilyDir) {
    dependencySubstitution {
        substitute(module("io.github.lilydesignsystem:lily-core")).using(project(":lily-core"))
        substitute(module("io.github.lilydesignsystem:lily-compose")).using(project(":lily-compose"))
    }
}
