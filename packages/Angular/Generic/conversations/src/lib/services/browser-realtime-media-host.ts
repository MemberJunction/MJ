import {
    IRealtimeMediaHost,
    IRealtimeSessionRecorder,
} from '@memberjunction/realtime-runtime';
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
     */
    public async AcquireMicrophone(): Promise<MediaStream> {
        return navigator.mediaDevices.getUserMedia({ audio: true });
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
