// The open summaries, in memory only (spec M-PRIV-1): no file, database,
// preference or backup ever holds them. They are gone when the process ends.
package io.github.internationalpatientsummary.app

import io.github.internationalpatientsummary.app.ips.Summary
import java.util.concurrent.atomic.AtomicLong

class SummaryStore {
    private val items = ArrayList<Summary>()
    private val nextId = AtomicLong(1)

    /** A fresh id for a summary about to be opened. */
    fun newId(): Long = nextId.getAndIncrement()

    /** Every open summary, newest first (M-LIST-1). */
    fun all(): List<Summary> = items.toList()

    fun get(id: Long): Summary? = items.firstOrNull { it.id == id }

    fun add(summary: Summary) {
        items.add(0, summary)
    }

    fun remove(id: Long) {
        items.removeAll { it.id == id }
    }

    /** Forget every summary (M-PRIV-3). */
    fun clear() {
        items.clear()
    }
}
