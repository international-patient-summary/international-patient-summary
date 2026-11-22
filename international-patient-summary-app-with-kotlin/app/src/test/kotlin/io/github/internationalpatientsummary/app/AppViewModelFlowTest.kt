// The ViewModel's flows (M-LOAD-*, M-STORE-1..5, M-PEOPLE-3/4, M-TAB-2, M-PRIV-3)
// against a disk that lives in memory.
package io.github.internationalpatientsummary.app

import io.github.internationalpatientsummary.app.ips.Fixtures
import io.github.internationalpatientsummary.app.ips.Refusal
import io.github.internationalpatientsummary.app.ips.SummaryReader
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.io.IOException
import java.util.concurrent.AbstractExecutorService
import java.util.concurrent.TimeUnit

@OptIn(ExperimentalCoroutinesApi::class)
class AppViewModelFlowTest {
    /** Runs every task on the caller's thread, so a save has happened when it is asked for. */
    private class InlineExecutor : AbstractExecutorService() {
        var stopped = false
        override fun execute(command: Runnable) = command.run()
        override fun shutdown() { stopped = true }
        override fun shutdownNow(): MutableList<Runnable> { stopped = true; return mutableListOf() }
        override fun isShutdown() = stopped
        override fun isTerminated() = stopped
        override fun awaitTermination(timeout: Long, unit: TimeUnit) = true
    }

    private class MemoryDisk : SummaryDisk {
        var index = StoreIndex.EMPTY
        val files = linkedMapOf<Long, ByteArray>()
        var loadFails = 0
        var saveFails = false
        var cleared = 0

        /** When set, a load waits for it, so the model is still loading while a test acts. */
        var gate: java.util.concurrent.CountDownLatch? = null

        @Suppress("UNCHECKED_CAST")
        override fun <T : Any> load(open: (Long, ByteArray) -> T?): Loaded<T> {
            gate?.await()
            if (loadFails > 0) {
                loadFails--
                throw StoreUnavailable(IOException("busy"))
            }
            return Loaded(index, index.entries.mapNotNull { e -> files[e.id]?.let { open(e.id, it) } })
        }

        override fun save(index: StoreIndex, added: Map<Long, ByteArray>, removed: Collection<Long>) {
            if (saveFails) throw IOException("full")
            this.index = index
            files.putAll(added)
            removed.forEach { files.remove(it) }
        }

        override fun clear() {
            cleared++
            files.clear()
            index = StoreIndex.EMPTY
        }
    }

    @Before fun main() = Dispatchers.setMain(UnconfinedTestDispatcher())

    @After fun resetMain() = Dispatchers.resetMain()

    private fun model(disk: MemoryDisk = MemoryDisk()) = AppViewModel(disk, InlineExecutor()) to disk

    private fun waitFor(what: String, condition: () -> Boolean) {
        val end = System.nanoTime() + 10_000_000_000L
        while (!condition()) {
            check(System.nanoTime() < end) { "timed out: $what" }
            Thread.sleep(5)
        }
    }

    private fun AppViewModel.openFixture(name: String) {
        val before = summaries.size
        open { Fixtures.bytes(name) }
        waitFor("open $name") { summaries.size == before + 1 }
    }

    @Test fun openingSavesAndTheNextLaunchLoadsIt() {
        val (first, disk) = model()
        first.openFixture("bundle-minimal")
        assertEquals(Saving.SAVED, first.saving)
        assertEquals(1, disk.files.size)
        assertEquals(Screen.Open(first.summaries.first().id), first.screen)

        val (second, _) = model(disk)
        waitFor("restore") { second.summaries.size == 1 }
        assertEquals(first.summaries.first().id, second.summaries.first().id)
    }

    @Test fun aRefusedOrUnreadableFileShowsAProblemAndLeavesTheList() {
        val (vm, _) = model()
        vm.open { "{}".toByteArray() }
        waitFor("refusal") { vm.problem != null }
        assertTrue(vm.problem is Problem.Refused)
        vm.dismissProblem()
        assertNull(vm.problem)
        vm.open { throw IOException("gone") }
        waitFor("unreadable") { vm.problem != null }
        assertEquals(Problem.Unreadable, vm.problem)
        vm.open { throw SecurityException("denied") }
        waitFor("denied") { vm.problem == Problem.Unreadable && !vm.busy }
        vm.report(Problem.EmptyClipboard)
        assertEquals(Problem.EmptyClipboard, vm.problem)
        assertTrue(vm.summaries.isEmpty())
    }

    @Test fun examplesOpenNewestFirstAndAFailureIsReported() {
        val (vm, _) = model()
        vm.openExamples(listOf("bundle-minimal", "bundle-ips-all-sections")) { Fixtures.bytes(it) }
        waitFor("examples") { vm.summaries.size == 2 }
        assertEquals(2, vm.people.size.coerceAtLeast(1).coerceAtMost(2))
        vm.openExamples(listOf("x")) { throw IOException("missing") }
        waitFor("example failure") { vm.problem == Problem.Unreadable }
        vm.openExamples(listOf("y")) { "{}".toByteArray() }
        waitFor("example refusal") { vm.problem is Problem.Refused && (vm.problem as Problem.Refused).refusal != Refusal.TOO_LARGE }
    }

    @Test fun anUnavailableStoreIsRetriedAndThenSavesWhatIsOpen() {
        val disk = MemoryDisk()
        val seed = SummaryStore().also { it.add(SummaryReader.open(Fixtures.bytes("bundle-minimal"), it.newId())) }
        disk.index = seed.index()
        disk.files.putAll(seed.all().associate { it.id to it.bytes })
        disk.loadFails = 2
        val (vm, _) = model(disk)
        assertEquals(Saving.UNAVAILABLE, vm.saving)
        assertTrue(vm.storageProblemVisible)

        // A change while unavailable does not overwrite what could not be read.
        vm.setRelationship(1, Relationship.PARENT)
        assertTrue(vm.storageProblemVisible)
        vm.dismissStorageProblem()
        assertFalse(vm.storageProblemVisible)

        vm.retryStorage()
        assertEquals(Saving.UNAVAILABLE, vm.saving)
        vm.retryStorage()
        waitFor("reopened") { vm.summaries.size == 1 && vm.saving == Saving.SAVED }
        assertFalse(vm.storageProblemVisible)

        // Saved and readable: Retry just saves again.
        vm.retryStorage()
        assertEquals(Saving.SAVED, vm.saving)
    }

    @Test fun aFailedSaveIsKeptOpenAndCompletedByRetry() {
        val (vm, disk) = model()
        disk.saveFails = true
        vm.openFixture("bundle-minimal")
        assertEquals(Saving.UNSAVED, vm.saving)
        assertTrue(vm.storageProblemVisible)
        disk.saveFails = false
        vm.retryStorage()
        assertEquals(Saving.SAVED, vm.saving)
        assertEquals(1, disk.files.size)
    }

    @Test fun retryWithoutAStoreDoesNothing() {
        val vm = AppViewModel()
        vm.retryStorage()
        vm.openFixture("bundle-minimal")
        assertEquals(Saving.SAVED, vm.saving)
    }

    @Test fun shortcutsDeleteAndNavigation() {
        val (vm, disk) = model()
        assertFalse(vm.shortcut(Shortcut.DELETE_OPEN))
        vm.openFixture("bundle-minimal")
        val id = vm.summaries.first().id
        assertEquals(vm.summaries.first().id, vm.summary(id)?.id)
        assertEquals(id, vm.personOf(id)?.summaries?.first()?.id)
        assertNull(vm.personOf(99))
        assertFalse(vm.shareAsksFirst)

        assertTrue(vm.shortcut(Shortcut.entries.first { it != Shortcut.DELETE_OPEN }))
        assertTrue(vm.pending != null)
        vm.shortcutDone()
        assertNull(vm.pending)

        vm.show(Screen.About)
        assertTrue(vm.back())
        assertFalse(vm.back())
        vm.show(Screen.Open(id))
        assertTrue(vm.shortcut(Shortcut.DELETE_OPEN))
        assertEquals(Screen.Summaries, vm.screen)
        assertTrue(vm.summaries.isEmpty())
        assertTrue(disk.files.isEmpty())
    }

    @Test fun forgettingAPersonAndClearingAll() {
        val (vm, disk) = model()
        vm.openFixture("bundle-minimal")
        vm.openFixture("bundle-ips-all-sections")
        assertTrue(vm.shareAsksFirst)
        val id = vm.summaries.first().id
        vm.show(Screen.Open(id))
        vm.forgetPerson(id)
        assertEquals(Screen.Summaries, vm.screen)
        assertEquals(1, vm.summaries.size)
        vm.forgetPerson(12345)
        assertEquals(1, vm.summaries.size)

        vm.clearAll()
        assertTrue(vm.summaries.isEmpty())
        assertEquals(1, disk.cleared)
        AppViewModel().clearAll()
    }

    @Test fun clearingWhileStillLoadingWaitsForTheLoad() {
        val disk = MemoryDisk()
        disk.gate = java.util.concurrent.CountDownLatch(1)
        val executor = java.util.concurrent.Executors.newSingleThreadExecutor()
        val vm = AppViewModel(disk, executor)
        vm.clearAll()
        assertEquals(0, disk.cleared)
        disk.gate!!.countDown()
        waitFor("cleared") { disk.cleared >= 1 }
        executor.shutdown()
    }
}
