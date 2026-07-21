import SwiftUI
import ReplayKit

struct ContentView: View {
    var body: some View {
        VStack(spacing: 24) {
            Text("SolitaireSolver")
                .font(.title)
                .bold()

            Text("Start a broadcast to capture the screen of another app running on this device. SolitaireBroadcastExt will receive live frames while the broadcast is active.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal)

            BroadcastPickerView(preferredExtension: AppGroup.broadcastExtensionBundleID)
                .frame(width: 60, height: 60)
        }
        .padding()
    }
}

/// SwiftUI wrapper around RPSystemBroadcastPickerView, which shows the
/// system's broadcast start/stop button. Tapping it lets the user pick
/// SolitaireBroadcastExt (or Xcode auto-selects it via preferredExtension)
/// and starts/stops a broadcast — no custom UI needed for that flow.
struct BroadcastPickerView: UIViewRepresentable {
    let preferredExtension: String

    func makeUIView(context: Context) -> RPSystemBroadcastPickerView {
        let picker = RPSystemBroadcastPickerView(frame: .zero)
        picker.preferredExtension = preferredExtension
        picker.showsMicrophoneButton = false
        return picker
    }

    func updateUIView(_ uiView: RPSystemBroadcastPickerView, context: Context) {}
}

#Preview {
    ContentView()
}
