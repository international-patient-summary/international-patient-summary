// M-LOAD-4: which part of an intent from another app holds the document.
package io.github.internationalpatientsummary.app

import io.github.internationalpatientsummary.app.Incoming.Source
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class IncomingTest {
    private val uri = "content://com.android.providers.downloads.documents/document/1"

    @Test fun openWithGivesTheContentUri() {
        assertEquals(Source.Content(uri), Incoming.source(Incoming.ACTION_VIEW, 0, uri, null, null))
    }

    @Test fun shareGivesTheStreamBeforeAnyText() {
        assertEquals(Source.Content(uri), Incoming.source(Incoming.ACTION_SEND, 0, null, uri, "{}"))
    }

    @Test fun sharedTextWithoutAFileIsTheDocument() {
        assertEquals(Source.Text("{\"resourceType\":\"Bundle\"}"), Incoming.source(Incoming.ACTION_SEND, 0, null, null, "{\"resourceType\":\"Bundle\"}"))
    }

    @Test fun nothingToReadIsTheUnreadableAlert() {
        assertEquals(Source.Unreadable, Incoming.source(Incoming.ACTION_VIEW, 0, null, null, null))
        assertEquals(Source.Unreadable, Incoming.source(Incoming.ACTION_SEND, 0, null, null, ""))
        // A file: URI is not the app's to read.
        assertEquals(Source.Unreadable, Incoming.source(Incoming.ACTION_VIEW, 0, "file:///sdcard/Download/a.json", null, null))
        assertEquals(Source.Unreadable, Incoming.source(Incoming.ACTION_SEND, 0, null, "file:///sdcard/a.json", null))
    }

    @Test fun theLauncherAndOtherActionsOpenNothing() {
        assertNull(Incoming.source("android.intent.action.MAIN", 0, null, null, null))
        assertNull(Incoming.source(null, 0, null, null, null))
        assertNull(Incoming.source("android.intent.action.EDIT", 0, uri, null, null))
    }

    @Test fun reopenedFromRecentsOpensNothingAgain() {
        assertNull(Incoming.source(Incoming.ACTION_VIEW, Incoming.FLAG_LAUNCHED_FROM_HISTORY, uri, null, null))
        assertNull(Incoming.source(Incoming.ACTION_SEND, Incoming.FLAG_LAUNCHED_FROM_HISTORY or 0x10000000, null, uri, null))
    }

    @Test fun theConstantsAreAndroids() {
        assertEquals(android.content.Intent.ACTION_VIEW, Incoming.ACTION_VIEW)
        assertEquals(android.content.Intent.ACTION_SEND, Incoming.ACTION_SEND)
        assertEquals(android.content.Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY, Incoming.FLAG_LAUNCHED_FROM_HISTORY)
    }
}
