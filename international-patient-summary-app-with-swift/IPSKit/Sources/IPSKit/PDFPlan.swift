import Foundation

/// The one-page PDF's content and how it is fitted (spec §5.1, M-PDF-1, M-PDF-2):
/// the web viewer's `src/lib/export/pdf.ts`, without the drawing. The app draws;
/// this decides what goes on the page.

extension SectionKey {
    /// The web viewer's `pdfPriority`: lower comes first and is cut last.
    public var pdfPriority: Int {
        switch self {
        case .alerts: 0
        case .allergies: 1
        case .medications: 2
        case .problems: 3
        case .immunizations: 4
        case .results: 5
        case .procedures: 6
        case .devices: 7
        case .advanceDirectives: 8
        case .vitalSigns: 9
        case .pastIllness: 10
        case .planOfCare: 11
        case .socialHistory: 12
        case .functional: 13
        case .pregnancy: 14
        case .patientStory: 15
        }
    }
}

/// A section as the PDF shows it, after alerts and allergies (which go in the box).
public struct PDFSection: Sendable {
    public let section: Section
    /// Entries that are never trimmed: current medicines (M-PDF-2).
    public let mustShow: [Entry]
    /// Entries that may be trimmed, most recent first.
    public let others: [Entry]
    public var priority: Int { section.key?.pdfPriority ?? 99 }
}

/// How much of a section a plan shows.
public enum PDFCap: Equatable, Sendable {
    /// At most this many of the section's trimmable entries (its must-show ones always).
    case limit(Int)
    /// The whole section is replaced by a notice.
    case omit
}

/// One attempt at the page: a font size and, per section (by index), a cap.
public struct PDFPlan: Equatable, Sendable {
    public let fontSize: Double
    public let caps: [Int: PDFCap]

    /// The section's shown entries under this plan, and how many are left out.
    public func entries(of section: PDFSection, at index: Int) -> (shown: [Entry], hidden: Int)? {
        switch caps[index] {
        case .omit: return nil
        case .limit(let n): return (section.mustShow + section.others.prefix(n), max(0, section.others.count - n))
        case nil: return (section.mustShow + section.others, 0)
        }
    }
}

/// The fitted result: the plan used, and whether it still runs past one page.
public struct PDFFit: Equatable, Sendable {
    public let plan: PDFPlan
    public let pageCount: Int
    /// True when must-show content needed a second page (M-PDF-2: "CONTINUED").
    public var continued: Bool { pageCount > 1 }
}

public enum PDFLayout {
    public static let fontSizes: [Double] = [10, 9.5, 9, 8.5, 8]

    /// A medicine is current when its status is active, intended, on hold or draft
    /// (the web viewer's `MedicationModel.current`).
    static let currentStatuses: Set<String> = ["active", "intended", "on-hold", "draft"]

    /// The sections after the box, in priority order (stable for equal priority).
    public static func sections(of document: Document) -> [PDFSection] {
        var prepared: [(order: Int, section: PDFSection)] = []
        for (order, section) in document.sections.enumerated() where section.key != .alerts && section.key != .allergies {
            let entries: [Entry] = section.state == .known ? section.entries.filter(\.resolved) : []
            var mustShow: [Entry] = []
            var others: [(position: Int, entry: Entry)] = []
            for (position, entry) in entries.enumerated() {
                if section.key == .medications, currentStatuses.contains(entry.detail(.status) ?? "") {
                    mustShow.append(entry)
                } else {
                    others.append((position, entry))
                }
            }
            // Most recent first; undated last; otherwise the document's order.
            others.sort { a, b in
                let x = a.entry.date ?? ""
                let y = b.entry.date ?? ""
                if x != y { return x > y }
                return a.position < b.position
            }
            prepared.append((order, PDFSection(section: section, mustShow: mustShow, others: others.map(\.entry))))
        }
        prepared.sort { a, b in
            if a.section.priority != b.section.priority { return a.section.priority < b.section.priority }
            return a.order < b.order
        }
        return prepared.map(\.section)
    }

    /// The order plans are tried (M-PDF-2): shrink the font; then, at 8 pt, cap the
    /// lowest-priority sections at 3 and then 1 of their most recent entries; then
    /// replace them, lowest priority first. A medication section with current
    /// medicines is capped at 0 instead of replaced.
    public static func plans(_ sections: [PDFSection]) -> [PDFPlan] {
        var plans = fontSizes.map { PDFPlan(fontSize: $0, caps: [:]) }
        let floor = fontSizes[fontSizes.count - 1]
        let trimmable = sections.indices
            .filter { !sections[$0].others.isEmpty }
            .sorted { a, b in
                sections[a].priority != sections[b].priority ? sections[a].priority > sections[b].priority : a > b
            }
        var caps: [Int: PDFCap] = [:]
        for limit in [3, 1] {
            for index in trimmable where sections[index].others.count > limit {
                caps[index] = .limit(limit)
                plans.append(PDFPlan(fontSize: floor, caps: caps))
            }
        }
        for index in trimmable {
            caps[index] = sections[index].mustShow.isEmpty ? .omit : .limit(0)
            plans.append(PDFPlan(fontSize: floor, caps: caps))
        }
        return plans
    }

    /// Try each plan until `pageCount` says it fits on one page; if none does, the
    /// last plan (the most cut), which then runs to more pages.
    public static func fit(_ sections: [PDFSection], pageCount: (PDFPlan) -> Int) -> PDFFit {
        let all = plans(sections)
        for plan in all {
            let pages = pageCount(plan)
            if pages <= 1 { return PDFFit(plan: plan, pageCount: max(1, pages)) }
        }
        let last = all[all.count - 1]
        return PDFFit(plan: last, pageCount: pageCount(last))
    }

    /// Letter for US English, A4 otherwise (M-PDF-1).
    /// - Parameters: language: the app's language code ("en"); region: the reader's region ("US").
    public static func usesLetter(language: String, region: String?) -> Bool {
        language.lowercased() == "en" && region?.uppercased() == "US"
    }

    /// `international-patient-summary-<date>.pdf`, the document's date as it gives it
    /// (YYYY, YYYY-MM or YYYY-MM-DD; the web viewer's `exportFilename`), never the
    /// patient's name.
    public static func fileName(documentDate: String?) -> String {
        if let date = documentDate, let match = date.prefixMatch(of: /\d{4}(-\d{2}(-\d{2})?)?/) {
            return "international-patient-summary-\(match.output.0).pdf"
        }
        return "international-patient-summary.pdf"
    }
}
