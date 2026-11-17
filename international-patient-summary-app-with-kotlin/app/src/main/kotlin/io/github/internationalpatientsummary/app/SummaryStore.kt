// The open summaries and the relationships given to people, in memory. The
// app saves them in the encrypted store (EncryptedStore, spec M-STORE-1) from
// [index] after each change, and puts them back with [restore] at launch.
package io.github.internationalpatientsummary.app

import io.github.internationalpatientsummary.app.ips.People
import io.github.internationalpatientsummary.app.ips.Summary
import java.util.concurrent.atomic.AtomicLong

/** A person's relationship to the person using the app (M-PEOPLE-3); the app's note, never a document's. */
enum class Relationship { NONE, SELF, PARTNER, PARENT, CHILD, SIBLING, GRANDPARENT, GRANDCHILD, FAMILY, CARED_FOR }

/** The summaries about one person (M-PEOPLE-1), newest first, and their relationship. */
class Person(val summaries: List<Summary>, val relationship: Relationship) {
    val newest: Summary get() = summaries.first()

    /** A key for the list: the id of their first-opened summary still open. */
    val key: Long get() = summaries.minOf { it.id }
}

class SummaryStore {
    private val items = ArrayList<Summary>()
    private val nextId = AtomicLong(1)

    /**
     * Each summary's person's relationship, by summary id. Every summary of a
     * person carries the same one, so a person keeps theirs as summaries come
     * and go, and it goes with their last summary.
     */
    private val relationships = HashMap<Long, Relationship>()

    /** A fresh id for a summary about to be opened. */
    fun newId(): Long = nextId.getAndIncrement()

    /** Every open summary, newest first (M-LIST-1). */
    fun all(): List<Summary> = items.toList()

    fun get(id: Long): Summary? = items.firstOrNull { it.id == id }

    /** The open summaries by person, in the order of each one's newest summary (M-PEOPLE-2). */
    fun people(): List<Person> = People.group(items).map { summaries ->
        Person(summaries, relationships[summaries.first().id] ?: Relationship.NONE)
    }

    /** The person a summary is about, or null when it is not open. */
    fun personOf(id: Long): Person? = people().firstOrNull { person -> person.summaries.any { it.id == id } }

    /** Add a summary; when it joins a person they keep their relationship. */
    fun add(summary: Summary) {
        items.add(0, summary)
        settle()
    }

    fun remove(id: Long) {
        items.removeAll { it.id == id }
        relationships.remove(id)
        settle()
    }

    /** Give the person this summary is about a relationship. Only one person is Me. */
    fun setRelationship(id: Long, relationship: Relationship) {
        val person = personOf(id) ?: return
        if (relationship == Relationship.SELF) {
            relationships.replaceAll { _, it -> if (it == Relationship.SELF) Relationship.NONE else it }
        }
        person.summaries.forEach { relationships[it.id] = relationship }
        relationships.values.removeAll { it == Relationship.NONE }
    }

    /** Forget every summary about the person this summary is about, and their relationship (M-PEOPLE-4). */
    fun forgetPerson(id: Long) {
        val gone = personOf(id)?.summaries?.map { it.id }?.toSet() ?: return
        items.removeAll { it.id in gone }
        gone.forEach(relationships::remove)
    }

    /** What the encrypted store saves (M-STORE-1): the summaries newest first, each with its person's relationship. */
    fun index(): StoreIndex = StoreIndex(
        nextId.get(),
        items.map { StoreIndex.Entry(it.id, relationships[it.id] ?: Relationship.NONE) },
    )

    /** Put back what the encrypted store loaded (M-STORE-1), in its order, replacing what is here. */
    fun restore(index: StoreIndex, summaries: List<Summary>) {
        items.clear()
        relationships.clear()
        items.addAll(summaries)
        val byId = index.entries.associateBy { it.id }
        summaries.forEach { summary ->
            byId[summary.id]?.relationship?.takeIf { it != Relationship.NONE }?.let { relationships[summary.id] = it }
        }
        nextId.set(maxOf(index.nextId, (summaries.maxOfOrNull { it.id } ?: 0) + 1))
        settle()
    }

    /** Forget every summary and every relationship (M-PRIV-3). */
    fun clear() {
        items.clear()
        relationships.clear()
    }

    /**
     * Make every summary of a person carry the same relationship: the one from
     * their newest summary that has one. Needed when a new summary links
     * people, or a removed one splits them. Then keep only one Me, the person
     * with the newest summary.
     */
    private fun settle() {
        var me = false
        People.group(items).forEach { summaries ->
            var relationship = summaries.firstNotNullOfOrNull { relationships[it.id] } ?: Relationship.NONE
            if (relationship == Relationship.SELF) {
                if (me) relationship = Relationship.NONE
                me = true
            }
            summaries.forEach { if (relationship == Relationship.NONE) relationships.remove(it.id) else relationships[it.id] = relationship }
        }
    }
}
