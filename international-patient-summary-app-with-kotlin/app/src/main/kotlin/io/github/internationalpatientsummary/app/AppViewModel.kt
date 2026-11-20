// The app's state and its simple, state-driven navigation (no navigation
// library): which screen is showing, the open summaries by person, and any
// refusal. A ViewModel outlives the activity being recreated, so folding or
// unfolding (M-TAB-4) keeps the summaries, relationships and open summary.
// With an EncryptedStore (the app's; tests may leave it out) it loads the
// saved summaries at launch and saves every change (M-STORE-1..5), all on one
// background thread, in order, so a later change never overtakes an earlier.
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
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.asCoroutineDispatcher
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.IOException
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

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

/** Whether everything open is safely represented by the encrypted store. */
enum class Saving { SAVED, UNSAVED, UNAVAILABLE }

class AppViewModel internal constructor(
    private val disk: SummaryDisk?,
    private val writer: ExecutorService?,
) : ViewModel() {
    constructor(disk: EncryptedStore?) : this(disk, disk?.let { Executors.newSingleThreadExecutor() })

    /** Without a store: in memory only (the JVM tests). */
    constructor() : this(null, null)

    private val store = SummaryStore()

    var screen: Screen by mutableStateOf(Screen.Summaries)
        private set
    var summaries: List<Summary> by mutableStateOf(emptyList())
        private set

    /** The open summaries grouped by person (M-PEOPLE-1, M-PEOPLE-2). */
    var people: List<Person> by mutableStateOf(emptyList())
        private set
    var problem: Problem? by mutableStateOf(null)
        private set
    var busy: Boolean by mutableStateOf(false)
        private set
    var saving: Saving by mutableStateOf(Saving.SAVED)
        private set
    var storageProblemVisible: Boolean by mutableStateOf(false)
        private set

    /** A keyboard shortcut for the screen to carry out (it holds the file picker and clipboard). */
    var pending: Shortcut? by mutableStateOf(null)
        private set

    /** Done once the saved summaries are back (M-STORE-1, M-STORE-3); opening waits for it. */
    private val loaded: Job = load()

    private fun load(): Job {
        val disk = disk ?: return CompletableDeferred(Unit)
        val writer = writer ?: return CompletableDeferred(Unit)
        return viewModelScope.launch {
            busy = true
            val result = try {
                withContext(writer.asCoroutineDispatcher()) {
                    // Each saved summary is checked again as it is read (M-STORE-3).
                    disk.load { id, bytes -> SummaryReader.open(bytes, id) }
                }
            } catch (_: StoreUnavailable) {
                saving = Saving.UNAVAILABLE
                storageProblemVisible = true
                null
            }
            if (result != null) {
                store.restore(result.index, result.items)
                refresh()
            }
            busy = false
        }
    }

    /** Save the current state after a change, with the summaries added and removed (M-STORE-1, M-STORE-4). */
    private fun persist(removed: Collection<Long> = emptyList()) {
        val disk = disk ?: return
        if (saving == Saving.UNAVAILABLE) {
            // Do not replace saved summaries we have not been able to read.
            // Retry reads and merges them before writing anything (M-STORE-5).
            storageProblemVisible = true
            return
        }
        val index = store.index()
        // Always offer every exact byte. If an earlier summary write failed,
        // the next change or Retry can complete it rather than only its index.
        val bytes = store.all().associate { it.id to it.bytes }
        writer?.execute {
            try {
                disk.save(index, bytes, removed)
                saving = Saving.SAVED
                storageProblemVisible = false
            } catch (_: Exception) {
                // Nothing is logged (M-PRIV-4); what is open stays in memory.
                saving = Saving.UNSAVED
                storageProblemVisible = true
            }
        }
    }

    fun dismissStorageProblem() {
        storageProblemVisible = false
    }

    /** M-STORE-5: retry an unavailable read, or save the complete current state again. */
    fun retryStorage() {
        val disk = disk ?: return
        val writer = writer ?: return
        storageProblemVisible = false
        if (saving != Saving.UNAVAILABLE) {
            persist()
            return
        }
        viewModelScope.launch {
            busy = true
            val result = try {
                withContext(writer.asCoroutineDispatcher()) {
                    disk.load { id, bytes -> SummaryReader.open(bytes, id) }
                }
            } catch (_: StoreUnavailable) {
                saving = Saving.UNAVAILABLE
                storageProblemVisible = true
                null
            }
            if (result != null) {
                store.reopen(result.index, result.items)
                refresh()
                saving = Saving.UNSAVED
                persist()
            }
            busy = false
        }
    }

    override fun onCleared() {
        // Writes already queued still run.
        writer?.shutdown()
    }

    /** M-TAB-2: delete acts here; the others wait for the screen. Answers whether it was used. */
    fun shortcut(shortcut: Shortcut): Boolean {
        if (shortcut == Shortcut.DELETE_OPEN) {
            val open = screen as? Screen.Open ?: return false
            delete(open.id)
        } else {
            pending = shortcut
        }
        return true
    }

    fun shortcutDone() {
        pending = null
    }

    fun summary(id: Long): Summary? = store.get(id)

    /** The person a summary is about (M-PEOPLE-1). */
    fun personOf(id: Long): Person? = people.firstOrNull { person -> person.summaries.any { it.id == id } }

    /** M-SHARE-2: Share asks first when more than one person's summaries are open. */
    val shareAsksFirst: Boolean get() = people.size > 1

    /** M-PEOPLE-3: give the person this summary is about a relationship. */
    fun setRelationship(id: Long, relationship: Relationship) {
        store.setRelationship(id, relationship)
        refresh()
        persist()
    }

    /** M-PEOPLE-4: forget every summary about this person, and their relationship. */
    fun forgetPerson(id: Long) {
        val gone = store.personOf(id)?.summaries?.map { it.id } ?: return
        store.forgetPerson(id)
        refresh()
        persist(removed = gone)
        val open = screen as? Screen.Open
        if (open != null && store.get(open.id) == null) screen = Screen.Summaries
    }

    private fun refresh() {
        summaries = store.all()
        people = store.people()
    }

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
            loaded.join()
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
                refresh()
                persist()
                screen = Screen.Open(summary.id)
            }.onFailure { error ->
                problem = if (error is RefusedException) Problem.Refused(error.refusal) else Problem.Unreadable
            }
        }
    }

    /** Open the bundled examples (M-LOAD-3), each checked like any other document. */
    fun openExamples(names: List<String>, read: (String) -> ByteArray) {
        viewModelScope.launch {
            loaded.join()
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
            refresh()
            persist()
            opened.firstNotNullOfOrNull { it.exceptionOrNull() }?.let { error ->
                problem = if (error is RefusedException) Problem.Refused(error.refusal) else Problem.Unreadable
            }
        }
    }

    fun delete(id: Long) {
        val wasOpen = store.get(id) != null
        store.remove(id)
        refresh()
        if (wasOpen) persist(removed = listOf(id))
        if (screen == Screen.Open(id)) screen = Screen.Summaries
    }

    /** Forget every summary (M-PRIV-3). */
    fun clearAll() {
        if (!loaded.isCompleted) {
            // Clear what is still loading too, not only what is shown.
            viewModelScope.launch {
                loaded.join()
                clearAll()
            }
            return
        }
        store.clear()
        refresh()
        screen = Screen.Summaries
        // Every file and the key (M-STORE-4).
        val disk = disk ?: return
        writer?.execute { runCatching { disk.clear() } }
    }
}
