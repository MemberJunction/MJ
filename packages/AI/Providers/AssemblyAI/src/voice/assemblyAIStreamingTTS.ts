import type { JSONObject } from '@memberjunction/ai';
import { AssemblyAISession, OpenAssemblyAISocket, type AssemblyAISocketOpener } from './assemblyAISocket';

/** AssemblyAI's streaming text-to-speech endpoint. */
export const ASSEMBLYAI_TTS_URL = 'wss://tts.us.assemblyai.com/v1/ws';

export interface AssemblyAITTSOptions {
    APIKey: string;
    /** A library voice's slug or UUID, or a cloned voice's id. */
    VoiceID: string;
    /** Rate of the PCM16 mono audio to receive. */
    SampleRate: number;
}

export interface AssemblyAITTSHandlers {
    /** Base64 PCM16 for the piece of text given this id. */
    OnAudio(base64Pcm: string, segmentID: number): void;
    /** All audio for that piece has arrived (not: has been played). */
    OnSegmentDone(segmentID: number): void;
    OnLost(message: string): void;
}

export interface IAssemblyAITTS {
    readonly IsOpen: boolean;
    /** Speaks one piece of text after the pieces before it. `segmentID` comes back with its audio. */
    Speak(text: string, segmentID: number): void;
    /** Stops all speech asked for so far. No more audio for it is delivered. */
    Cancel(): void;
    Close(): Promise<void>;
}

/** The provider drops a session after two minutes without a frame in either direction. */
const KEEP_ALIVE_MS = 45_000;

/** How long the provider has to confirm a cancel, in ms. Until it does, nothing that arrives can be used. */
const CANCEL_CONFIRM_TIMEOUT_MS = 5_000;

/** Opens a text-to-speech session. Rejects, with nothing left open, when it cannot. */
export async function OpenAssemblyAITTS(
    options: AssemblyAITTSOptions,
    handlers: AssemblyAITTSHandlers,
    openSocket: AssemblyAISocketOpener = OpenAssemblyAISocket,
    signal?: AbortSignal
): Promise<IAssemblyAITTS> {
    const url = new URL(ASSEMBLYAI_TTS_URL);
    url.searchParams.set('voice_id', options.VoiceID);
    url.searchParams.set('sample_rate', String(options.SampleRate));
    url.searchParams.set('encoding', 'pcm_s16le');
    const tts = new AssemblyAITTS(handlers);
    const { Session } = await AssemblyAISession.Open(
        'AssemblyAI TTS',
        openSocket(url.toString(), options.APIKey),
        { OnFrame: (frame) => tts.OnFrame(frame), OnLost: (message) => tts.OnLost(message) },
        signal
    );
    tts.Attach(Session);
    return tts;
}

class AssemblyAITTS implements IAssemblyAITTS {
    private session: AssemblyAISession | null = null;
    private keepAlive: ReturnType<typeof setInterval> | null = null;
    /** Pieces flushed and not finished, oldest first. The provider answers them one at a time, in this order. */
    private queue: number[] = [];
    /** Cancels not confirmed yet: until each is, what arrives belongs to speech it stopped. */
    private unconfirmedCancels = 0;
    private cancelTimer: ReturnType<typeof setTimeout> | null = null;

    constructor(private readonly handlers: AssemblyAITTSHandlers) {}

    public Attach(session: AssemblyAISession): void {
        this.session = session;
        this.keepAlive = setInterval(() => session.Send({ type: 'KeepAlive' }), KEEP_ALIVE_MS);
        this.keepAlive.unref?.();
    }

    public get IsOpen(): boolean {
        return this.session?.IsOpen ?? false;
    }

    public Speak(text: string, segmentID: number): void {
        if (!this.IsOpen) {
            return;
        }
        this.queue.push(segmentID);
        // The provider joins consecutive texts exactly as sent, so each piece brings its own separator.
        this.session?.Send({ type: 'Generate', text: `${text} ` });
        this.session?.Send({ type: 'Flush' });
    }

    public Cancel(): void {
        if (!this.IsOpen || this.queue.length === 0) {
            return;
        }
        this.queue = [];
        this.unconfirmedCancels++;
        this.cancelTimer ??= setTimeout(() => this.onCancelUnconfirmed(), CANCEL_CONFIRM_TIMEOUT_MS);
        this.session?.Send({ type: 'Cancel' });
    }

    public Close(): Promise<void> {
        // Terminate alone would first speak what is queued, and bill it.
        this.Cancel();
        this.stopTimers();
        return this.session?.Close() ?? Promise.resolve();
    }

    public OnFrame(frame: JSONObject): void {
        if (frame['type'] === 'Cancelled') {
            this.unconfirmedCancels = Math.max(0, this.unconfirmedCancels - 1);
            if (this.unconfirmedCancels === 0) {
                this.stopCancelTimer();
            }
            return;
        }
        if (this.unconfirmedCancels > 0 || this.queue.length === 0) {
            return;
        }
        const audio = frame['audio'];
        if (frame['type'] === 'Audio' && typeof audio === 'string') {
            this.handlers.OnAudio(audio, this.queue[0]);
        } else if (frame['type'] === 'FlushDone') {
            const finished = this.queue.shift();
            if (finished !== undefined) {
                this.handlers.OnSegmentDone(finished);
            }
        }
    }

    public OnLost(message: string): void {
        this.stopTimers();
        this.queue = [];
        this.handlers.OnLost(message);
    }

    /** The session stopped answering: end it, so the owner opens another. */
    private onCancelUnconfirmed(): void {
        this.cancelTimer = null;
        void this.Close();
        this.OnLost(`AssemblyAI TTS: a cancel was not confirmed within ${CANCEL_CONFIRM_TIMEOUT_MS} ms`);
    }

    private stopCancelTimer(): void {
        if (this.cancelTimer) {
            clearTimeout(this.cancelTimer);
            this.cancelTimer = null;
        }
    }

    private stopTimers(): void {
        this.stopCancelTimer();
        if (this.keepAlive) {
            clearInterval(this.keepAlive);
            this.keepAlive = null;
        }
    }
}
