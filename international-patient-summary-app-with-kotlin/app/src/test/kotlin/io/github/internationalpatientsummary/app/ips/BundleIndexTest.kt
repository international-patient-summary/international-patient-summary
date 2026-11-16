// M-READ-1: by fullUrl, then by Type/id.
package io.github.internationalpatientsummary.app.ips

import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class BundleIndexTest {
    private val index = BundleIndex(
        Json.parseToJsonElement(
            """{"entry":[
              {"fullUrl":"urn:uuid:1","resource":{"resourceType":"Patient","id":"a"}},
              {"fullUrl":"https://example.org/fhir/Condition/c1","resource":{"resourceType":"Condition"}},
              {"resource":{"resourceType":"Device","id":"d1"}}
            ]}""",
        ),
    )

    @Test fun byFullUrl() = assertEquals("a", index.resolve("urn:uuid:1")?.string("id"))

    @Test fun byResourceTypeAndId() = assertEquals("a", index.resolve("Patient/a")?.string("id"))

    @Test fun byTheTypeAndIdAFullUrlEndsIn() =
        assertEquals("Condition", index.resolve("Condition/c1")?.string("resourceType"))

    @Test fun byAnAbsoluteReferenceToAKnownTypeAndId() =
        assertEquals("d1", index.resolve("https://elsewhere.org/Device/d1/_history/2")?.string("id"))

    @Test fun notFound() {
        assertNull(index.resolve("Patient/zzz"))
        assertNull(index.resolve(""))
        assertNull(index.resolve(null as String?))
    }
}
