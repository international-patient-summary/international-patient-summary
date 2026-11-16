// The app's state and its simple, state-driven navigation (no navigation
// library): which screen is showing, the open summaries, and any refusal.
package io.github.internationalpatientsummary.app

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import io.github.internationalpatientsummary.app.ips.Refusal
import io.github.internationalpatientsummary.app.ips.RefusedException
import io.github.internationalpatientsummary.app.ips.Summary
import io.github.internationalpatientsummary.app.ips.SummaryReader
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.IOException

sealed interface Screen {
    data object Summaries : Screen
    data class Open(val id: Long) : Screen
    data object About : Screen
}

/** A problem to show in an alert; never quotes the document. */
sealed interface Problem {
    data class Refused(val refusal: Refusal) : Problem
    data object Unreadable : Problem
    data object EmptyClipboard : Problem
}

class AppViewModel : ViewModel() {
    private val store = SummaryStore()

    var screen: Screen by mutableStateOf(Screen.Summaries)
        private set
    var summaries: List<Summary> by mutableStateOf(emptyList())
        private set
    var problem: Problem? by mutableStateOf(null)
        private set
    var busy: Boolean by mutableStateOf(false)
        private set

    fun summary(id: Long): Summary? = store.get(id)

    fun show(next: Screen) {
        screen = next
    }

    /** Back: from any screen to the list. Answers false when already there. */
    fun back(): Boolean {
        if (screen == Screen.Summaries) return false
        screen = Screen.Summaries
        return true
    }

    fun dismissProblem() {
        problem = null
    }

    fun report(next: Problem) {
        problem = next
    }

    /**
     * Read, check and open one document, then show it. A refusal leaves the
     * list as it was (M-LIST-3).
     */
    fun open(read: suspend () -> ByteArray) {
        viewModelScope.launch {
            busy = true
            val result = withContext(Dispatchers.Default) {
                try {
                    Result.success(SummaryReader.open(withContext(Dispatchers.IO) { read() }, store.newId()))
                } catch (e: RefusedException) {
                    Result.failure(e)
                } catch (e: IOException) {
                    Result.failure(e)
                } catch (e: SecurityException) {
                    Result.failure(e)
                }
            }
            busy = false
            result.onSuccess { summary ->
                store.add(summary)
                summaries = store.all()
                screen = Screen.Open(summary.id)
            }.onFailure { error ->
                problem = if (error is RefusedException) Problem.Refused(error.refusal) else Problem.Unreadable
            }
        }
    }

    /** Open the bundled examples (M-LOAD-3), each checked like any other document. */
    fun openExamples(names: List<String>, read: (String) -> ByteArray) {
        viewModelScope.launch {
            busy = true
            val opened = withContext(Dispatchers.IO) {
                names.map { name ->
                    try {
                        Result.success(SummaryReader.open(read(name), store.newId()))
                    } catch (e: RefusedException) {
                        Result.failure(e)
                    } catch (e: IOException) {
                        Result.failure(e)
                    }
                }
            }
            busy = false
            // Added in reverse so the first example ends up at the top.
            opened.reversed().forEach { result -> result.onSuccess(store::add) }
            summaries = store.all()
            opened.firstNotNullOfOrNull { it.exceptionOrNull() }?.let { error ->
                problem = if (error is RefusedException) Problem.Refused(error.refusal) else Problem.Unreadable
            }
        }
    }

    fun delete(id: Long) {
        store.remove(id)
        summaries = store.all()
        if (screen == Screen.Open(id)) screen = Screen.Summaries
    }

    /** Forget every summary (M-PRIV-3). */
    fun clearAll() {
        store.clear()
        summaries = store.all()
        screen = Screen.Summaries
    }
}
