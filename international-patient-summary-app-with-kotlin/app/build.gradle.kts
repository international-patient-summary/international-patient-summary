// The one module. AGP 9 compiles Kotlin itself (built-in Kotlin), so the
// org.jetbrains.kotlin.android plugin is not applied.
plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
}

android {
    namespace = "io.github.internationalpatientsummary.app"
    // 37: Compose UI 1.12 and core-ktx 1.19 require it. targetSdk stays 36.
    compileSdk = 37

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

    lint {
        abortOnError = true
        warningsAsErrors = true
        checkDependencies = true
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

    testImplementation(libs.junit)

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
