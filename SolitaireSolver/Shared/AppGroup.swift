import Foundation

/// Constants shared between the main app and SolitaireBroadcastExt so both
/// targets agree on the App Group identifier and extension bundle ID.
///
/// IMPORTANT: If you change the App Group ID or bundle identifiers in Xcode's
/// signing settings, update the values below to match.
enum AppGroup {
    /// Must match the App Group entitlement in both targets' .entitlements
    /// files, and must be registered under your Apple Developer team.
    static let identifier = "group.com.example.solitairesolver"

    /// Must match the SolitaireBroadcastExt target's PRODUCT_BUNDLE_IDENTIFIER.
    /// Used as RPSystemBroadcastPickerView.preferredExtension.
    static let broadcastExtensionBundleID = "com.example.SolitaireSolver.SolitaireBroadcastExt"

    static var containerURL: URL? {
        FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: identifier)
    }

    static var defaults: UserDefaults? {
        UserDefaults(suiteName: identifier)
    }
}
