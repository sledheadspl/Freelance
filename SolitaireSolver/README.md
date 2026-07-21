# SolitaireSolver

An iOS app with a companion Broadcast Upload Extension (ReplayKit) that can
capture live screen frames from another app running on the same device.

## Targets

- **SolitaireSolver** — the main SwiftUI app. Shows an `RPSystemBroadcastPickerView`
  that starts/stops a broadcast targeting `SolitaireBroadcastExt`.
- **SolitaireBroadcastExt** — a Broadcast Upload Extension (`RPBroadcastSampleHandler`
  subclass, `SampleHandler`). `processSampleBuffer(_:with:)` currently just
  counts and logs each received video frame via `os_log`
  (subsystem `com.example.SolitaireSolver.SolitaireBroadcastExt`,
  category `SampleHandler`) — no recognition logic yet.

Both targets share the App Group `group.com.example.solitairesolver` (see
`Shared/AppGroup.swift`) so they can exchange data — e.g. recognized board
state or frame metadata — via the shared container / `UserDefaults(suiteName:)`.

## Project was assembled outside Xcode

This project's `.xcodeproj` was hand-authored (this session runs on Linux,
without Xcode or a Mac available), not created by Xcode or verified with
`xcodebuild`/on-device. The pbxproj was generated programmatically with
verified-unique object IDs and every reference cross-checked for internal
consistency, and the Swift code compiles by inspection against the current
ReplayKit / SwiftUI APIs, but **you must open it in Xcode on a Mac and build
once before trusting it** — hand-written pbxproj files are the most likely
place for a subtle mistake. If Xcode reports a project-file error, the fix
is usually fastest by letting Xcode re-save the project (open it, make a
trivial change like reordering a file in the navigator, save) rather than
hand-editing the pbxproj further.

## Before it will build for you

Open `SolitaireSolver.xcodeproj` in Xcode and, for **each target**
(SolitaireSolver and SolitaireBroadcastExt), go to **Signing & Capabilities**:

1. **Team** — select your Apple Developer team (currently blank
   `DEVELOPMENT_TEAM = ""` in both targets' build settings). A broadcast
   extension requires a real device and a paid or free Apple Developer
   account with automatic signing (or manual provisioning profiles that
   include the App Groups + Broadcast Upload Extension entitlements).

2. **Bundle Identifier** — currently:
   - Main app: `com.example.SolitaireSolver`
   - Extension: `com.example.SolitaireSolver.SolitaireBroadcastExt`

   `com.example` is a placeholder and not usable for real signing. Change
   both to an identifier prefix you control (e.g. `com.yourcompany.SolitaireSolver`
   / `com.yourcompany.SolitaireSolver.SolitaireBroadcastExt`) — **the extension's
   bundle ID must stay `<app bundle ID>.SolitaireBroadcastExt`** (a dotted
   suffix of the app's ID) or Xcode/App Store Connect will reject it as an
   app extension.

   After changing it, update `Shared/AppGroup.swift`'s
   `broadcastExtensionBundleID` constant to match the extension's new bundle
   ID — `RPSystemBroadcastPickerView.preferredExtension` uses this string to
   find the extension, and a mismatch means the picker won't offer it.

3. **App Groups capability** — with automatic signing, ticking "App Groups"
   under Signing & Capabilities for each target and adding/selecting a group
   will let Xcode manage the entitlement and portal registration for you. If
   you'd rather control the ID yourself, register
   `group.com.example.solitairesolver` (or your own group ID) manually at
   [developer.apple.com](https://developer.apple.com/account/resources/identifiers/list/applicationGroup)
   under your team, then update it in **three** places to match:
   - `SolitaireSolver/SolitaireSolver.entitlements`
   - `SolitaireBroadcastExt/SolitaireBroadcastExt.entitlements`
   - `Shared/AppGroup.swift`'s `identifier` constant

4. Xcode will also need to register the two App IDs (app + extension) under
   your team if they don't already exist — automatic signing normally does
   this the first time you build with a Team selected.

## Testing on device

`RPSystemBroadcastPickerView` and broadcast extensions **do not work in the
iOS Simulator** — you must run on a physical device.

1. Build and run the SolitaireSolver app on your device (⌘R).
2. Tap the broadcast picker button in the app; the system broadcast picker
   sheet should list "SolitaireBroadcastExt". Select it and tap Start.
3. Open **Settings → Privacy & Security** the first time — iOS may ask you
   to confirm screen recording permission.
4. Switch to any other app (the one whose screen you want to capture) — the
   broadcast keeps running system-wide while your extension processes frames.
5. Open **Console.app** (macOS, connected to your device) or run
   `xcrun devicectl device process view-console` / use Xcode's device
   console, filter by subsystem `com.example.SolitaireSolver.SolitaireBroadcastExt`
   (or process `SolitaireBroadcastExt`), and confirm you see
   "Broadcast started" followed by repeating "Received video frame #N" logs.
6. Stop the broadcast from the picker or Control Center — "Broadcast finished
   after N frame(s)" should log once.

If the picker doesn't list the extension: double-check the extension's
`NSExtensionPointIdentifier` is `com.apple.broadcast-services-upload` (already
set in `SolitaireBroadcastExt/Info.plist`), that both targets built and
installed successfully, and that `preferredExtension` in `ContentView.swift`
(via `AppGroup.broadcastExtensionBundleID`) exactly matches the extension's
final bundle identifier.
