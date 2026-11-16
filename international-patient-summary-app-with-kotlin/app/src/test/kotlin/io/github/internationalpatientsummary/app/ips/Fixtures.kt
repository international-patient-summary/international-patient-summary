package io.github.internationalpatientsummary.app.ips

object Fixtures {
    val NAMES = listOf(
        "bundle-minimal",
        "bundle-ips-all-sections",
        "bundle-no-info-required-sections",
        "IPS-examples-Bundle-01",
        "IPS-examples-Bundle-with-immunization",
    )

    fun bytes(name: String): ByteArray =
        requireNotNull(Fixtures::class.java.getResourceAsStream("/fixtures/$name.json")) { name }.use { it.readBytes() }

    fun open(name: String): Summary = SummaryReader.open(bytes(name), 1)

    /** A Bundle around a Composition and other entries, for crafted cases. */
    fun bundle(sections: String, vararg entries: String, subject: String = "Patient/p1"): ByteArray = """
        {"resourceType":"Bundle","type":"document","entry":[
          {"fullUrl":"urn:uuid:c","resource":{"resourceType":"Composition","title":"Crafted",
            "type":{"coding":[{"system":"http://loinc.org","code":"60591-5"}]},
            "subject":{"reference":"$subject"},"section":[$sections]}},
          {"fullUrl":"https://example.org/fhir/Patient/p1","resource":{"resourceType":"Patient","id":"p1",
            "name":[{"family":"Example","given":["Pat"]}]}}
          ${entries.joinToString("") { ",$it" }}
        ]}
    """.trimIndent().toByteArray()
}
