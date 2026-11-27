import org.gradle.testing.jacoco.plugins.JacocoTaskExtension

// The one module. AGP 9 compiles Kotlin itself (built-in Kotlin), so the
// org.jetbrains.kotlin.android plugin is not applied.
plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
}

android {
    namespace = "io.github.internationalpatientsummary.app"
    // 37: Compose UI 1.12 and core-ktx 1.19 require it. targetSdk stays 36.
    compileSdk { version = release(37) { minorApiLevel = 2 } }

    defaultConfig {
        applicationId = "io.github.internationalpatientsummary.app"
        minSdk = 29
        targetSdk = 36
        versionCode = 1
        versionName = "0.1.0"
        // The Compose smoke test in src/androidTest (P1-T13), on an emulator or device.
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    buildTypes {
        debug {
            // `./gradlew createDebugUnitTestCoverageReport` writes the JaCoCo report of
            // the unit tests under app/build/reports/coverage/test/debug/.
            enableUnitTestCoverage = true
        }
        release {
            isMinifyEnabled = false
        }
    }

    // Android 13+ lists the app's languages in Settings (per-app language), from
    // the values-* folders and res/resources.properties (spec M-I18N-1).
    androidResources {
        generateLocaleConfig = true
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_21
        targetCompatibility = JavaVersion.VERSION_21
    }

    testOptions {
        unitTests.isIncludeAndroidResources = true
        // Robolectric loads the app's classes through its own class loader; JaCoCo
        // must still count them.
        unitTests.all {
            it.extensions.configure<JacocoTaskExtension>("jacoco") {
                isIncludeNoLocationClasses = true
                excludes = listOf("jdk.internal.*")
            }
        }
    }

    lint {
        abortOnError = true
        warningsAsErrors = true
        // Lily is checked by its own build; its lint findings are not this app's.
        checkDependencies = false
        lintConfig = file("lint.xml")
    }
}

dependencies {
    implementation(platform(libs.compose.bom))
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.compose.ui)
    implementation(libs.compose.foundation)
    implementation(libs.compose.material3)
    implementation(libs.compose.material.icons.core)
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.lily.core)
    implementation(libs.lily.compose)
    implementation(libs.lily.compose.themes)

    testImplementation(libs.junit)
    testImplementation(libs.kotlinx.coroutines.test)
    // Android code on the JVM (P13-T3): Robolectric, and Compose's test rule over it.
    testImplementation(libs.robolectric)
    testImplementation(libs.androidx.test.core)
    testImplementation(platform(libs.compose.bom))
    testImplementation(libs.compose.ui.test.junit4)

    // Instrumented tests only: these go in the test APK's manifest, never the app's.
    androidTestImplementation(platform(libs.compose.bom))
    androidTestImplementation(libs.compose.ui.test.junit4)
    androidTestImplementation(libs.androidx.test.runner)
    androidTestImplementation(libs.androidx.test.ext.junit)
    androidTestImplementation(libs.androidx.test.espresso.core)
}

// ManifestTest reads the merged manifest (M-PRIV-1), so make sure it exists.
tasks.withType<Test>().configureEach {
    dependsOn("processDebugMainManifest")
}
