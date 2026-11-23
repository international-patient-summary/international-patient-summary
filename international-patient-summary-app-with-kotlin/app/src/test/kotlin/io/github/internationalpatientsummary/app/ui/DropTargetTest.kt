// M-TAB-3: what a drop does once it is accepted, and the hover cue, on the JVM. Compose's DragAndDropEvent has
// an internal constructor, so the test builds one by reflection around a platform DragEvent.
package io.github.internationalpatientsummary.app.ui

import android.content.ClipData
import android.content.ClipDescription
import android.content.Context
import android.view.DragEvent
import androidx.compose.ui.draganddrop.DragAndDropEvent
import androidx.test.core.app.ApplicationProvider
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [36])
class DropTargetTest {
    private val context: Context = ApplicationProvider.getApplicationContext()

    private fun event(clip: ClipData?): DragAndDropEvent {
        val drag = DragEvent::class.java.getDeclaredConstructor().apply { isAccessible = true }.newInstance()
        DragEvent::class.java.getDeclaredField("mClipData").apply { isAccessible = true }.set(drag, clip)
        val constructor = DragAndDropEvent::class.java.declaredConstructors.single()
        constructor.isAccessible = true
        return constructor.newInstance(drag) as DragAndDropEvent
    }

    private fun text(value: String) = ClipData.newPlainText("drop", value)

    @Test fun droppedTextOpensAsItsBytes() {
        var read: (suspend () -> ByteArray)? = null
        assertTrue(dropped(event(text("{\"a\":1}")), context, null) { read = it })
        assertEquals("{\"a\":1}", runBlocking { String(read!!()) })
    }

    @Test fun aDroppedFileIsReadFromItsUri() {
        val uri = android.net.Uri.parse("content://drops/summary")
        shadowOf(context.contentResolver).registerInputStream(uri, java.io.ByteArrayInputStream("{}".toByteArray()))
        var read: (suspend () -> ByteArray)? = null
        assertTrue(dropped(event(ClipData.newRawUri("file", uri)), context, null) { read = it })
        assertEquals("{}", runBlocking { String(read!!()) })
    }

    @Test fun anEmptyTextSeveralItemsOrNothingAreNotTaken() {
        var opened = false
        assertFalse(dropped(event(text("")), context, null) { opened = true })
        val two = ClipData(ClipDescription("two", arrayOf("text/plain")), ClipData.Item("a")).apply { addItem(ClipData.Item("b")) }
        assertFalse(dropped(event(two), context, null) { opened = true })
        assertFalse(dropped(event(null), context, null) { opened = true })
        assertFalse(opened)
    }

    @Test fun hoveringShowsWhileSomethingIsOverTheList() {
        val target = DropTarget { true }
        val any = event(null)
        target.onEntered(any)
        assertTrue(target.hovering)
        target.onExited(any)
        assertFalse(target.hovering)
        target.onEntered(any)
        target.onEnded(any)
        assertFalse(target.hovering)
        target.onEntered(any)
        assertTrue(target.onDrop(any))
        assertFalse(target.hovering)
    }
}
