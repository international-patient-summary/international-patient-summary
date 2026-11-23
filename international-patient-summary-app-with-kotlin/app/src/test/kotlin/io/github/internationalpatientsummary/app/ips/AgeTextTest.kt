// M-VIEW-1: the age for a clinician, at every band edge. ICU words the units, so this runs under Robolectric.
package io.github.internationalpatientsummary.app.ips

import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.time.LocalDate
import java.util.Locale

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [36])
class AgeTextTest {
    private val today = LocalDate.of(2026, 11, 23)

    private fun age(birth: String, locale: Locale = Locale.US) = Format.ageText(birth, today, locale)

    @Test fun daysUnderTwentyEight() {
        assertEquals("0 days", age("2026-11-23"))
        assertEquals("1 day", age("2026-11-22"))
        assertEquals("27 days", age("2026-10-27"))
    }

    @Test fun weeksAndDaysUnderAYear() {
        assertEquals("4 weeks", age("2026-10-26"))
        assertEquals("4 weeks 1 day", age("2026-10-25"))
        assertEquals("51 weeks 6 days", age("2025-11-25"))
    }

    @Test fun monthsAndDaysUnderTwo() {
        assertEquals("12 months", age("2025-11-23"))
        assertEquals("12 months 1 day", age("2025-11-22"))
        assertEquals("23 months 30 days", age("2024-11-24"))
    }

    @Test fun yearsAndMonthsUnderEighteen() {
        assertEquals("2 years", age("2024-11-23"))
        assertEquals("2 years 1 month", age("2024-10-23"))
        assertEquals("17 years 11 months", age("2008-11-24"))
    }

    @Test fun yearsAloneFromEighteen() {
        assertEquals("18 years", age("2008-11-23"))
        assertEquals("18 years", age("2008-01-01"))
        assertEquals("54 years", age("1972-05-01"))
    }

    @Test fun theWordsFollowTheReadersLanguage() {
        // ICU sets a no-break space (or a narrow one) between a number and its unit.
        assertEquals("2 ans 1 mois", age("2024-10-23", Locale.FRANCE)?.replace(Regex("[\\u00a0\\u202f]"), " "))
    }
}
