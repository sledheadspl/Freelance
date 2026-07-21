import ReplayKit
import os.log

private let log = OSLog(subsystem: "com.example.SolitaireSolver.SolitaireBroadcastExt", category: "SampleHandler")

class SampleHandler: RPBroadcastSampleHandler {

    private var frameCount = 0

    override func broadcastStarted(withSetupInfo setupInfo: [String: NSObject]?) {
        frameCount = 0
        os_log("Broadcast started", log: log, type: .info)

        // App Group container is reachable here for passing recognized
        // board state / frame metadata back to the main app, e.g.:
        // AppGroup.defaults?.set(..., forKey: "latestBoardState")
    }

    override func broadcastPaused() {
        os_log("Broadcast paused", log: log, type: .info)
    }

    override func broadcastResumed() {
        os_log("Broadcast resumed", log: log, type: .info)
    }

    override func broadcastFinished() {
        os_log("Broadcast finished after %d frame(s)", log: log, type: .info, frameCount)
    }

    override func processSampleBuffer(_ sampleBuffer: CMSampleBuffer, with sampleBufferType: RPSampleBufferType) {
        switch sampleBufferType {
        case .video:
            frameCount += 1
            os_log("Received video frame #%d", log: log, type: .debug, frameCount)
            // TODO: Board recognition on sampleBuffer goes here.

        case .audioApp:
            break

        case .audioMic:
            break

        @unknown default:
            break
        }
    }
}
