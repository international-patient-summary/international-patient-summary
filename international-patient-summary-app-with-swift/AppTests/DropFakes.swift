import UIKit

/// A drop session and coordinator holding one item provider, for the list's drop delegate.
final class FakeDropSession: NSObject, @MainActor UIDropSession {
    let items: [UIDragItem]
    init(_ providers: [NSItemProvider]) { items = providers.map { UIDragItem(itemProvider: $0) } }

    let progress = Progress()
    var localDragSession: (any UIDragSession)? { nil }
    var progressIndicatorStyle: UIDropSessionProgressIndicatorStyle = .none
    var allowsMoveOperation = false
    var isRestrictedToDraggingApplication = false

    func hasItemsConforming(toTypeIdentifiers typeIdentifiers: [String]) -> Bool {
        items.contains { item in typeIdentifiers.contains { item.itemProvider.hasItemConformingToTypeIdentifier($0) } }
    }
    func canLoadObjects(ofClass aClass: any NSItemProviderReading.Type) -> Bool { false }
    func canLoadObjects(ofClass aClass: any _ObjectiveCBridgeable.Type) -> Bool { false }
    func loadObjects(ofClass aClass: any NSItemProviderReading.Type, completion: @escaping ([any NSItemProviderReading]) -> Void) -> Progress { Progress() }
    func location(in view: UIView) -> CGPoint { .zero }
}

final class FakeDropCoordinator: NSObject, @MainActor UITableViewDropCoordinator {
    let session: any UIDropSession
    init(_ providers: [NSItemProvider]) { session = FakeDropSession(providers) }

    var items: [UITableViewDropItem] { [] }
    var destinationIndexPath: IndexPath? { nil }
    var proposal: UITableViewDropProposal { UITableViewDropProposal(operation: .copy) }
    func drop(_ dragItem: UIDragItem, toRowAt indexPath: IndexPath) -> any UIDragAnimating { fatalError() }
    func drop(_ dragItem: UIDragItem, intoRowAt indexPath: IndexPath, rect: CGRect) -> any UIDragAnimating { fatalError() }
    func drop(_ dragItem: UIDragItem, to target: UITraitCollection?) -> any UIDragAnimating { fatalError() }
    func drop(_ dragItem: UIDragItem, to placeholder: UITableViewDropPlaceholder) -> UITableViewDropPlaceholderContext { fatalError() }
    func drop(_ dragItem: UIDragItem, to target: UIDragPreviewTarget) -> any UIDragAnimating { fatalError() }
    func drop(_ dragItem: UIDragItem, toTarget target: UIDragPreviewTarget) -> any UIDragAnimating { fatalError() }
}
