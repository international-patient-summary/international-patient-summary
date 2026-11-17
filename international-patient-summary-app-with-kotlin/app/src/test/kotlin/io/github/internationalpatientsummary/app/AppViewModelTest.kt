// M-TAB-4: the summary being read is the ViewModel's state, not the screen's,
// so it outlives the activity being recreated when a foldable folds or unfolds.
package io.github.internationalpatientsummary.app

import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.ViewModelStore
import androidx.lifecycle.ViewModelStoreOwner
import org.junit.Assert.assertEquals
import org.junit.Assert.assertSame
import org.junit.Test

class AppViewModelTest {
    @Test fun theOpenSummaryOutlivesARecreatedActivity() {
        val owner = object : ViewModelStoreOwner {
            override val viewModelStore = ViewModelStore()
        }
        val before = ViewModelProvider(owner)[AppViewModel::class.java]
        before.show(Screen.Open(7))
        // A recreated activity asks the same store again (as `by viewModels()` does).
        val after = ViewModelProvider(owner)[AppViewModel::class.java]
        assertSame(before, after)
        assertEquals(Screen.Open(7), after.screen)
    }
}
