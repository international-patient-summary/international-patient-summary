// Null-safe reading of untyped FHIR JSON (spec §3). A field of the wrong JSON
// type reads as absent, so a malformed document can never crash the reader.
package io.github.internationalpatientsummary.app.ips

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/** The named member of an object, or null when this is not an object or has none. */
fun JsonElement?.field(name: String): JsonElement? = (this as? JsonObject)?.get(name)

/** The named member as an object. */
fun JsonElement?.obj(name: String): JsonObject? = field(name) as? JsonObject

/** The named member as a list; empty when it is missing or not an array. */
fun JsonElement?.list(name: String): List<JsonElement> = (field(name) as? JsonArray) ?: emptyList()

/** This element as a JSON string's content, or null. */
fun JsonElement?.asString(): String? = (this as? JsonPrimitive)?.takeIf { it.isString }?.content

/** The named member as a JSON string's content. */
fun JsonElement?.string(name: String): String? = field(name).asString()

/** The named member as a non-blank, trimmed string. */
fun JsonElement?.text(name: String): String? = string(name)?.trim()?.takeIf { it.isNotEmpty() }

/**
 * The named member as a JSON number, written exactly as the document wrote it
 * ("5.0" stays "5.0"): the app never rounds a clinical value.
 */
fun JsonElement?.number(name: String): String? =
    (field(name) as? JsonPrimitive)?.takeIf { !it.isString && it.content.toDoubleOrNull() != null }?.content

/** The named member as a JSON boolean. */
fun JsonElement?.boolean(name: String): Boolean? =
    (field(name) as? JsonPrimitive)?.takeIf { !it.isString }?.content?.toBooleanStrictOrNull()
