package io.github.internationalpatientsummary.app

import androidx.core.content.FileProvider

/**
 * FileProvider caches its path strategy per authority in a static map, and
 * Robolectric gives every test its own cache directory: clear the map so a
 * test never meets another's directory.
 */
fun resetFileProviderCache() {
    val cache = FileProvider::class.java.getDeclaredField("sCache").apply { isAccessible = true }
    (cache.get(null) as MutableMap<*, *>).clear()
}
