// M-TAB-2: a hardware keyboard's shortcuts.
package io.github.internationalpatientsummary.app

import android.view.KeyEvent
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class ShortcutsTest {
    @Test fun theKeyCodesAreAndroids() {
        assertEquals(KeyEvent.KEYCODE_O, Shortcuts.KEYCODE_O)
        assertEquals(KeyEvent.KEYCODE_V, Shortcuts.KEYCODE_V)
        assertEquals(KeyEvent.KEYCODE_E, Shortcuts.KEYCODE_E)
        assertEquals(KeyEvent.KEYCODE_DEL, Shortcuts.KEYCODE_DEL)
        assertEquals(KeyEvent.KEYCODE_FORWARD_DEL, Shortcuts.KEYCODE_FORWARD_DEL)
    }

    @Test fun ctrlWithALetterIsAnAction() {
        assertEquals(Shortcut.IMPORT, Shortcuts.of(KeyEvent.KEYCODE_O, ctrl = true))
        assertEquals(Shortcut.PASTE, Shortcuts.of(KeyEvent.KEYCODE_V, ctrl = true))
        assertEquals(Shortcut.EXAMPLES, Shortcuts.of(KeyEvent.KEYCODE_E, ctrl = true))
        assertEquals(Shortcut.DELETE_OPEN, Shortcuts.of(KeyEvent.KEYCODE_DEL, ctrl = true))
        assertEquals(Shortcut.DELETE_OPEN, Shortcuts.of(KeyEvent.KEYCODE_FORWARD_DEL, ctrl = true))
    }

    @Test fun withoutCtrlOrForAnotherKeyNothingHappens() {
        assertNull(Shortcuts.of(KeyEvent.KEYCODE_O, ctrl = false))
        assertNull(Shortcuts.of(KeyEvent.KEYCODE_DEL, ctrl = false))
        assertNull(Shortcuts.of(KeyEvent.KEYCODE_Q, ctrl = true))
    }

    @Test fun deleteNeedsAnOpenSummary() {
        val viewModel = AppViewModel()
        assertEquals(false, viewModel.shortcut(Shortcut.DELETE_OPEN))
        assertEquals(true, viewModel.shortcut(Shortcut.EXAMPLES))
        assertEquals(Shortcut.EXAMPLES, viewModel.pending)
        viewModel.shortcutDone()
        assertNull(viewModel.pending)
    }
}
