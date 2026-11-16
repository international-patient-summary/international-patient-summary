// M-TAB-2: a hardware keyboard's shortcuts, the same actions as the buttons.
// Pure Kotlin (key codes as ints) so the mapping is tested on the JVM.
package io.github.internationalpatientsummary.app

enum class Shortcut { IMPORT, PASTE, EXAMPLES, DELETE_OPEN }

object Shortcuts {
    // android.view.KeyEvent key codes, kept here so the core needs no android.* import.
    const val KEYCODE_O = 43
    const val KEYCODE_V = 50
    const val KEYCODE_E = 33
    const val KEYCODE_DEL = 67
    const val KEYCODE_FORWARD_DEL = 112

    /** Ctrl+O import, Ctrl+V paste, Ctrl+E examples, Ctrl+Backspace or Ctrl+Delete delete the open summary. */
    fun of(keyCode: Int, ctrl: Boolean): Shortcut? = if (!ctrl) {
        null
    } else {
        when (keyCode) {
            KEYCODE_O -> Shortcut.IMPORT
            KEYCODE_V -> Shortcut.PASTE
            KEYCODE_E -> Shortcut.EXAMPLES
            KEYCODE_DEL, KEYCODE_FORWARD_DEL -> Shortcut.DELETE_OPEN
            else -> null
        }
    }
}
