import IPSKit
import UIKit

/// The one-page PDF for people (spec §5.1, M-PDF-1..3). `PDFLayout` (IPSKit) decides
/// what goes on the page and fits it; this measures and draws it with UIKit and the
/// system fonts, which cover every script the app speaks.
enum SummaryPDF {
    /// The PDF and its file name (never the patient's).
    static func make(_ document: Document, now: Date = .now) -> (data: Data, name: String) {
        let name = PDFLayout.fileName(documentDate: document.date)
        let language = Bundle.main.preferredLocalizations.first ?? "en"
        let page =
            PDFLayout.usesLetter(language: language, region: Locale.current.region?.identifier)
            ? CGRect(x: 0, y: 0, width: 612, height: 792) : CGRect(x: 0, y: 0, width: 595.28, height: 841.89)
        let rightToLeft = Locale.Language(identifier: language).characterDirection == .rightToLeft
        let sections = PDFLayout.sections(of: document)
        let writer = Writer(document: document, sections: sections, page: page, rightToLeft: rightToLeft, now: now)
        let fit = PDFLayout.fit(sections) { writer.pages(for: $0, continued: false).count }
        return (writer.draw(fit, title: name), name)
    }

    /// One unbreakable piece of the page: a line, a heading, an entry.
    struct Block {
        let text: NSAttributedString
        /// Inside the red "Alerts and allergies" box.
        var boxed = false
        var spaceBefore: CGFloat = 0
    }

    struct Writer {
        let document: Document
        let sections: [PDFSection]
        let page: CGRect
        let rightToLeft: Bool
        let now: Date

        static let side: CGFloat = 28
        static let footer: CGFloat = 40
        static let boxInset: CGFloat = 6
        static let red = UIColor(red: 0.706, green: 0.137, blue: 0.094, alpha: 1)  // #b42318, as the viewer

        func top(continued: Bool) -> CGFloat { continued ? 34 : 26 }
        var width: CGFloat { page.width - 2 * Self.side }

        // MARK: Content

        private func paragraph() -> NSMutableParagraphStyle {
            let style = NSMutableParagraphStyle()
            style.alignment = .natural
            style.baseWritingDirection = rightToLeft ? .rightToLeft : .leftToRight
            style.lineHeightMultiple = 1.12
            return style
        }

        private func text(_ string: String, size: Double, bold: Bool = false, color: UIColor = .black)
            -> NSAttributedString
        {
            NSAttributedString(
                string: string,
                attributes: [
                    .font: bold ? UIFont.boldSystemFont(ofSize: size) : UIFont.systemFont(ofSize: size),
                    .foregroundColor: color, .paragraphStyle: paragraph(),
                ])
        }

        /// One entry: its concept in bold, then its details joined with " · " (M-PDF-1).
        private func entry(_ entry: Entry, size: Double, boxed: Bool = false) -> Block {
            let line = NSMutableAttributedString(attributedString: text(entry.text, size: size, bold: true))
            let details = entry.details.map { L10n.detail($0.kind, $0.value) }
            if !details.isEmpty { line.append(text("  " + details.joined(separator: " · "), size: size)) }
            return Block(text: line, boxed: boxed, spaceBefore: size * 0.15)
        }

        private func note(_ string: String, size: Double, boxed: Bool = false) -> Block {
            Block(text: text(string, size: size, color: .darkGray), boxed: boxed, spaceBefore: size * 0.15)
        }

        private func sectionTitle(_ section: Section) -> String {
            section.key.map { L10n.sectionTitle($0) } ?? section.title ?? L10n.sectionTitle(nil)
        }

        /// Everything on the page under `plan`, in order.
        func blocks(for plan: PDFPlan) -> [Block] {
            let base = plan.fontSize
            var blocks: [Block] = []

            // The patient's identity: never trimmed.
            blocks.append(Block(text: text(document.patientName ?? L10n.text("banner.noName"), size: base + 5, bold: true)))
            var identity: [String] = []
            if let born = formatFHIRDate(document.birthDate) {
                identity.append(
                    ageInYears(birthDate: document.birthDate).map { L10n.text("banner.bornAge", born, $0) }
                        ?? L10n.text("banner.born", born))
            }
            if let gender = document.gender { identity.append(L10n.text("banner.gender", L10n.gender(gender))) }
            if let first = document.identifiers.first {
                identity.append(first.system.isEmpty ? first.value : "\(first.system): \(first.value)")
            }
            if document.patient == nil { identity.append(L10n.text("banner.unknownPatient")) }
            if !identity.isEmpty { blocks.append(Block(text: text(identity.joined(separator: " · "), size: base))) }

            // Alerts and allergies: never trimmed.
            blocks.append(
                Block(text: text(L10n.text("pdf.alerts"), size: base + 1, bold: true, color: Self.red), boxed: true,
                    spaceBefore: base * 0.8))
            for section in document.sections where section.key == .alerts || section.key == .allergies {
                if let words = L10n.state(section.state, reason: section.emptyReason) {
                    blocks.append(note("\(sectionTitle(section)): \(words)", size: base, boxed: true))
                }
                for item in section.entries where item.resolved { blocks.append(entry(item, size: base, boxed: true)) }
            }
            if document.allergiesMissing { blocks.append(note(L10n.text("alerts.allergiesMissing"), size: base, boxed: true)) }

            // The sections, in priority order, as the plan allows.
            var notShown: [String] = []
            for (index, prepared) in sections.enumerated() {
                let section = prepared.section
                let title = sectionTitle(section)
                blocks.append(Block(text: text(title, size: base + 1, bold: true), spaceBefore: base * 0.6))
                guard let (shown, hidden) = plan.entries(of: prepared, at: index) else {
                    blocks.append(note(L10n.text("pdf.sectionNotShown"), size: base))
                    notShown.append(title)
                    continue
                }
                if let words = L10n.state(section.state, reason: section.emptyReason) {
                    blocks.append(note(words, size: base))
                }
                for item in shown { blocks.append(entry(item, size: base)) }
                // A section with narrative but no entries prints its narrative (M-VIEW-6).
                if section.entries.isEmpty, let narrative = section.narrative {
                    blocks.append(Block(text: text(narrative, size: base), spaceBefore: base * 0.15))
                }
                if hidden > 0 {
                    blocks.append(note(L10n.text("pdf.more", hidden), size: base))
                    notShown.append(title)
                }
            }
            if !notShown.isEmpty {
                let list = ListFormatter.localizedString(byJoining: notShown)
                blocks.append(
                    Block(text: text(L10n.text("pdf.notShown", list), size: base, bold: true), spaceBefore: base * 0.8))
            }
            return blocks
        }

        // MARK: Layout

        private func height(of block: Block) -> CGFloat {
            let inset = block.boxed ? 2 * Self.boxInset : 0
            let size = block.text.boundingRect(
                with: CGSize(width: width - inset, height: .greatestFiniteMagnitude),
                options: [.usesLineFragmentOrigin, .usesFontLeading], context: nil)
            return ceil(size.height) + block.spaceBefore + (block.boxed ? 2 : 0)
        }

        /// The blocks on each page, with their heights; a block never splits.
        func pages(for plan: PDFPlan, continued: Bool) -> [[(block: Block, height: CGFloat)]] {
            let room = page.height - top(continued: continued) - Self.footer
            var pages: [[(block: Block, height: CGFloat)]] = [[]]
            var used: CGFloat = 0
            for block in blocks(for: plan) {
                let height = height(of: block)
                if used + height > room, !pages[pages.count - 1].isEmpty {
                    pages.append([])
                    used = 0
                }
                pages[pages.count - 1].append((block, height))
                used += height
            }
            return pages
        }

        // MARK: Drawing

        func draw(_ fit: PDFFit, title: String) -> Data {
            let format = UIGraphicsPDFRendererFormat()
            // The title is the file name, never the patient's (M-PDF-1).
            format.documentInfo = [
                kCGPDFContextTitle as String: title, kCGPDFContextCreator as String: L10n.text("app.name"),
            ]
            let pages = self.pages(for: fit.plan, continued: fit.continued)
            return UIGraphicsPDFRenderer(bounds: page, format: format).pdfData { context in
                for (number, blocks) in pages.enumerated() {
                    context.beginPage()
                    var y = top(continued: fit.continued)
                    if fit.continued {
                        text(L10n.text("pdf.continued"), size: 9, bold: true, color: Self.red)
                            .draw(in: CGRect(x: Self.side, y: 12, width: width, height: 16))
                    }
                    for (block, height) in blocks {
                        let frame = CGRect(x: Self.side, y: y + block.spaceBefore, width: width, height: height - block.spaceBefore)
                        if block.boxed {
                            let box = frame.insetBy(dx: 0, dy: -1)
                            UIColor(red: 0.996, green: 0.953, blue: 0.949, alpha: 1).setFill()
                            UIRectFill(box)
                            Self.red.setFill()
                            UIRectFill(CGRect(x: box.minX, y: box.minY, width: 2, height: box.height))
                            UIRectFill(CGRect(x: box.maxX - 2, y: box.minY, width: 2, height: box.height))
                            block.text.draw(
                                with: frame.insetBy(dx: Self.boxInset, dy: 1),
                                options: [.usesLineFragmentOrigin, .usesFontLeading], context: nil)
                        } else {
                            block.text.draw(with: frame, options: [.usesLineFragmentOrigin, .usesFontLeading], context: nil)
                        }
                        y += height
                    }
                    drawFooter(page: number + 1, of: pages.count)
                }
            }
        }

        private func drawFooter(page number: Int, of count: Int) {
            let generated = DateFormatter.localizedString(from: now, dateStyle: .medium, timeStyle: .short)
            var parts = [L10n.text("pdf.generated", generated)]
            if let date = formatFHIRDate(document.date) { parts.append(L10n.text("pdf.source", date)) }
            parts += [L10n.text("pdf.version"), L10n.text("pdf.notDevice")]
            let pageText = L10n.text("pdf.page", number, count)
            let pageWidth: CGFloat = 70
            let y = page.height - Self.footer + 10
            text(parts.joined(separator: " · "), size: 7, color: .darkGray).draw(
                with: CGRect(
                    x: rightToLeft ? Self.side + pageWidth : Self.side, y: y, width: width - pageWidth,
                    height: Self.footer - 12),
                options: [.usesLineFragmentOrigin, .usesFontLeading], context: nil)
            let style = paragraph()
            style.alignment = rightToLeft ? .left : .right
            NSAttributedString(
                string: pageText,
                attributes: [.font: UIFont.systemFont(ofSize: 7), .foregroundColor: UIColor.darkGray, .paragraphStyle: style]
            ).draw(in: CGRect(x: rightToLeft ? Self.side : page.width - Self.side - pageWidth, y: y, width: pageWidth, height: 12))
        }
    }
}
