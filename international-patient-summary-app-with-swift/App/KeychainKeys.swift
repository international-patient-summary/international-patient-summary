import CryptoKit
import Foundation
import IPSKit
import Security

/// The encrypted store's key (M-STORE-2): 256 random bits in a Keychain item that
/// stays on this device (never in a backup or on another device) and can be read
/// only while the device is unlocked.
nonisolated struct KeychainKeys: StoreKeys {
    private var query: [CFString: Any] {
        [
            kSecClass: kSecClassGenericPassword,
            kSecAttrService: "io.github.internationalpatientsummary.app.store",
            kSecAttrAccount: "key",
            kSecUseDataProtectionKeychain: true,
        ]
    }

    func existing() throws -> SymmetricKey? {
        var search = query
        search[kSecReturnData] = true
        search[kSecMatchLimit] = kSecMatchLimitOne
        var item: CFTypeRef?
        let status = SecItemCopyMatching(search as CFDictionary, &item)
        switch status {
        case errSecSuccess:
            guard let data = item as? Data, data.count == 32 else { throw KeychainError(status: errSecDecode) }
            return SymmetricKey(data: data)
        case errSecItemNotFound:
            return nil
        default:
            // For example errSecInteractionNotAllowed while locked: the store is left alone.
            throw KeychainError(status: status)
        }
    }

    func create() throws -> SymmetricKey {
        delete()
        let key = SymmetricKey(size: .bits256)
        var item = query
        item[kSecValueData] = key.withUnsafeBytes { Data($0) }
        item[kSecAttrAccessible] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        let status = SecItemAdd(item as CFDictionary, nil)
        guard status == errSecSuccess else { throw KeychainError(status: status) }
        return key
    }

    func delete() {
        SecItemDelete(query as CFDictionary)
    }
}

nonisolated struct KeychainError: Error {
    let status: OSStatus
}
