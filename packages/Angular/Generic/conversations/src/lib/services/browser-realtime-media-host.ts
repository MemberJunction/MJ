import {
    IRealtimeMediaHost,
    IRealtimeSessionRecorder,
} from '@memberjunction/realtime-runtime';
import { RealtimeAudioRecorder } from './realtime-audio-recorder';

/**
 * The browser's implementation of the realtime runtime's media seam.
 *
 * Everything here is the half of a realtime session that genuinely *is* platform-specific:
 * how the microphone is requested, and how captured audio becomes bytes we can upload. The
 * orchestration around it — mint, connect, transcripts, tools, narration, channels, teardown —
 * lives in `@memberjunction/realtime-runtime` and is identical on every host.
 */
export class BrowserRealtimeMediaHost implements IRealtimeMediaHost {
    /**
     * Requests the microphone through the standard Web API, which surfaces the browser's own
     * permission prompt. A denial rejects, and the runtime treats that as a failed session start.
     */
    public async AcquireMicrophone(): Promise<MediaStream> {
        return navigator.mediaDevices.getUserMedia({ audio: true });
    }

    /**
     * Wraps the browser recorder so the runtime never sees a `Blob`.
     *
     * Returns `null` when the platform cannot record, which the runtime treats as "recording is
     * simply off" rather than an error — recording is consent-gated and optional by design.
     */
    public CreateRecorder(): IRealtimeSessionRecorder | null {
        return new BrowserRealtimeSessionRecorder(new RealtimeAudioRecorder());
    }
}

/**
 * Adapts {@link RealtimeAudioRecorder} (which speaks `Blob`, because that is what `MediaRecorder`
 * and the Web Audio API hand you) to the runtime's byte-agnostic recorder contract.
 *
 * The base64 encoding that used to sit in the session service lives here now. That is the correct
 * home for it: a browser reaches for `FileReader`, React Native reads a file off disk, and a test
 * harness holds bytes in memory — three different answers to a question the orchestration layer
 * should never have been asking.
 */
class BrowserRealtimeSessionRecorder implements IRealtimeSessionRecorder {
    constructor(private readonly recorder: RealtimeAudioRecorder) {}

    public get IsRecording(): boolean {
        return this.recorder.IsRecording;
    }

    public get SampleRate(): number {
        return this.recorder.SampleRate;
    }

    public get MimeType(): string {
        return this.recorder.MimeType;
    }

    public Start(micStream: MediaStream, remoteStream: MediaStream | null): void {
        this.recorder.Start(micStream, remoteStream);
    }

    public AttachRemoteStream(stream: MediaStream): void {
        this.recorder.AttachRemoteStream(stream);
    }

    public NowOffsetMs(): number {
        return this.recorder.NowOffsetMs();
    }

    public GetPeaks(): number[] {
        return this.recorder.GetPeaks();
    }

    public async SnapshotNewSegmentBase64(): Promise<string | null> {
        const segment = this.recorder.SnapshotNewSegment();
        if (!segment || segment.size === 0) {
            return null;
        }
        return this.blobToBase64(segment);
    }

    public async StopAndEncode(): Promise<string | null> {
        const blob = await this.recorder.Stop();
        if (!blob || blob.size === 0) {
            return null;
        }
        return this.blobToBase64(blob);
    }

    /**
     * Encodes a {@link Blob} as base64 with the `data:` prefix stripped, via {@link FileReader}.
     * Resolves to `null` rather than rejecting — a failed encode costs us the recording, never
     * the live call.
     */
    private blobToBase64(blob: Blob): Promise<string | null> {
        return new Promise<string | null>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                const result = typeof reader.result === 'string' ? reader.result : '';
                const comma = result.indexOf(',');
                resolve(comma >= 0 ? result.slice(comma + 1) : null);
            };
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(blob);
        });
    }
}
