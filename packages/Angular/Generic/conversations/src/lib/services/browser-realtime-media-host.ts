import {
    IRealtimeMediaHost,
    IRealtimeSessionRecorder,
} from '@memberjunction/realtime-runtime';
import {
    type DisplayCaptureOptions,
    type DisplayCaptureResult,
    type ILocalMediaController,
    LocalMediaController,
    RequestDisplayCapture,
} from '@memberjunction/ai-realtime-client/media';
import { RealtimeAudioRecorder } from './realtime-audio-recorder';

/**
 * The browser's implementation of the realtime runtime's media seam.
 *
 * Everything here is the half of a realtime session that genuinely *is* platform-specific:
 * how the microphone is requested, and how captured audio becomes Opus packets. The
 * orchestration around it — mint, connect, transcripts, tools, narration, channels, shard
 * upload, teardown — lives in `@memberjunction/realtime-runtime` and is identical on every host.
 */
export class BrowserRealtimeMediaHost implements IRealtimeMediaHost {
    /**
     * Requests the microphone through the standard Web API, which surfaces the browser's own
     * permission prompt. A denial rejects, and the runtime treats that as a failed session start.
     * The runtime uses {@link CreateLocalMediaController} instead when it is present, as it is here.
     */
    public async AcquireMicrophone(): Promise<MediaStream> {
        return navigator.mediaDevices.getUserMedia({ audio: true });
    }

    /**
     * The browser's camera-and-microphone controller. The runtime starts the microphone through it,
     * so a call follows a device switch and keeps going when a headset is unplugged.
     */
    public CreateLocalMediaController(): ILocalMediaController {
        return new LocalMediaController();
    }

    /**
     * Opens the browser's share picker for the session's screen share: a screen, window or tab, or one panel of
     * this page where the browser can narrow a capture to it.
     */
    public RequestDisplayCapture(options?: DisplayCaptureOptions): Promise<DisplayCaptureResult> {
        return RequestDisplayCapture(options);
    }

    /**
     * A fresh, unstarted 48 kHz Opus recorder for this call. {@link RealtimeAudioRecorder}
     * implements the runtime's recorder contract itself (packets out, sample count back), so no
     * adapter sits in between. When the browser cannot record, the recorder disables itself on
     * Start and the runtime sees `IsRecording === false`, which it treats as "recording is off".
     */
    public CreateRecorder(): IRealtimeSessionRecorder | null {
        return new RealtimeAudioRecorder();
    }
}
