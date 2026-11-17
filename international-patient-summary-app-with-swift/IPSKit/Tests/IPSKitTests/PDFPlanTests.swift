import Foundation
import Testing

@testable import IPSKit

/// M-PDF-1, M-PDF-2: what goes on the one-page PDF, and how it is fitted.
@Suite struct PDFPlanTests {
    static func section(_ key: SectionKey?, mustShow: Int = 0, others: Int) -> PDFSection {
        let entry = Entry(resourceType: nil, text: "x", details: [], resolved: true, absent: nil, criticality: nil)
        let section = Section(
            key: key, code: key?.code, title: nil, state: .known, entries: [], narrative: nil, emptyReason: nil)
        return PDFSection(
            section: section, mustShow: Array(repeating: entry, count: mustShow),
            others: Array(repeating: entry, count: others))
    }

    @Test func sectionsFollowThePriorityOrderAfterTheBox() throws {
        let document = try DocumentTests.open("bundle-ips-all-sections")
        let keys = PDFLayout.sections(of: document).map(\.section.key)
        #expect(!keys.contains(.allergies) && !keys.contains(.alerts), "those are in the box")
        let priorities = keys.map { $0?.pdfPriority ?? 99 }
        #expect(priorities == priorities.sorted())
        #expect(keys.first == .medications)
    }

    @Test func currentMedicinesAreMustShowAndOthersAreNewestFirst() throws {
        let document = try DocumentTests.open("IPS-examples-Bundle-01")
        let medications = try #require(PDFLayout.sections(of: document).first { $0.section.key == .medications })
        #expect(!medications.mustShow.isEmpty)
        #expect(medications.mustShow.allSatisfy { ["active", "intended", "on-hold", "draft"].contains($0.detail(.status) ?? "") })
        let results = try #require(PDFLayout.sections(of: document).first { $0.section.key == .results })
        let dates = results.others.compactMap(\.date)
        #expect(dates == dates.sorted(by: >))
    }

    @Test func thePlansShrinkThenCapThenOmitLowestPriorityFirst() {
        // Index 0: medications with 2 current and 5 others; 1: problems with 2; 2: devices with 4.
        let sections = [
            Self.section(.medications, mustShow: 2, others: 5),
            Self.section(.problems, others: 2),
            Self.section(.devices, others: 4),
        ]
        let plans = PDFLayout.plans(sections)
        #expect(plans.prefix(5).map(\.fontSize) == [10, 9.5, 9, 8.5, 8])
        #expect(plans.prefix(5).allSatisfy { $0.caps.isEmpty })
        let caps = plans.dropFirst(5).map(\.caps)
        #expect(
            caps == [
                [2: .limit(3)],  // devices (lowest) at 3
                [2: .limit(3), 0: .limit(3)],  // medications at 3 (problems has only 2)
                [2: .limit(1), 0: .limit(3)],  // devices at 1
                [2: .limit(1), 0: .limit(3), 1: .limit(1)],
                [2: .limit(1), 0: .limit(1), 1: .limit(1)],
                [2: .omit, 0: .limit(1), 1: .limit(1)],  // then replace, lowest first
                [2: .omit, 0: .limit(1), 1: .omit],
                [2: .omit, 0: .limit(0), 1: .omit],  // current medicines are never replaced
            ])
        #expect(plans.dropFirst(5).allSatisfy { $0.fontSize == 8 })
    }

    @Test func mustShowEntriesAreNeverTrimmed() {
        let medications = Self.section(.medications, mustShow: 2, others: 5)
        let plan = PDFPlan(fontSize: 8, caps: [0: .limit(0)])
        let shown = plan.entries(of: medications, at: 0)
        #expect(shown?.shown.count == 2)
        #expect(shown?.hidden == 5)
    }

    @Test func fittingStopsAtTheFirstPlanThatFitsOrRunsOn() {
        let sections = [Self.section(.results, others: 10)]
        let fits = PDFLayout.fit(sections) { $0.fontSize > 9 ? 2 : 1 }
        #expect(fits.plan.fontSize == 9)
        #expect(!fits.continued)
        let never = PDFLayout.fit(sections) { _ in 2 }
        #expect(never.continued)
        #expect(never.plan == PDFLayout.plans(sections).last)
    }

    @Test func paperAndFileName() {
        #expect(PDFLayout.usesLetter(language: "en", region: "US"))
        #expect(!PDFLayout.usesLetter(language: "en", region: "GB"))
        #expect(!PDFLayout.usesLetter(language: "es", region: "US"))
        #expect(PDFLayout.fileName(documentDate: "2020-12-11T14:30:00+01:00") == "international-patient-summary-2020-12-11.pdf")
        #expect(PDFLayout.fileName(documentDate: "2020-12") == "international-patient-summary-2020-12.pdf")
        #expect(PDFLayout.fileName(documentDate: "2020") == "international-patient-summary-2020.pdf")
        #expect(PDFLayout.fileName(documentDate: "December") == "international-patient-summary.pdf")
        #expect(PDFLayout.fileName(documentDate: nil) == "international-patient-summary.pdf")
    }
}
