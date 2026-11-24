import type { JSONObject } from '@memberjunction/ai';
import { AssemblyAISession, OpenAssemblyAISocket, type AssemblyAISocketOpener } from './assemblyAISocket';

/** AssemblyAI's streaming speech-to-text endpoint. */
export const ASSEMBLYAI_STT_URL = 'wss://streaming.assemblyai.com/v3/ws';

/** AssemblyAI's speech-to-text model for voice agents: it also decides when the user has finished a turn. */
export const ASSEMBLYAI_STT_MODEL = 'assemblyai-stt-3-7-realtime-agent';

/** AssemblyAI's presets for how long a pause may last before the turn ends. */
export type AssemblyAISTTMode = 'min_latency' | 'balanced' | 'max_accuracy';

export interface AssemblyAISTTOptions {
    APIKey: string;
    SpeechModel: string;
    /** Rate of the PCM16 mono audio that will be sent. */
    SampleRate: number;
    Mode?: AssemblyAISTTMode;
    /** Silence that always ends a turn, in ms. */
    MaxTurnSilenceMs?: number;
    /** How sure the model must be that a sound is speech, 0 to 1. */
    VadThreshold?: number;
    /** Names and terms to spell right. */
    Keyterms?: string[];
}

/** A transcript of the turn in progress; each one replaces the last. */
export interface AssemblyAITurn {
    Transcript: string;
    EndOfTurn: boolean;
}

export interface AssemblyAISTTHandlers {
    OnSpeechStarted(): void;
    OnTurn(turn: AssemblyAITurn): void;
    OnLost(message: string): void;
}

export interface IAssemblyAISTT {
    /** Queues PCM16 audio. Dropped once the session has ended. */
    SendAudio(pcm: Uint8Array): void;
    /** Tells the model what the agent just said, so it expects the kind of answer asked for. */
    UpdateAgentContext(reply: string): void;
    Close(): Promise<void>;
}

/** AssemblyAI accepts frames of 20 ms to 1 s and recommends 50 to 100 ms. */
const FRAME_MS = 50;
const MAX_FRAME_MS = 1000;
const BYTES_PER_SAMPLE = 2;

/** The model keeps 1750 characters of both sides of the conversation; a reply should not take all of it. */
const MAX_AGENT_CONTEXT_CHARS = 1000;

/** Opens a speech-to-text session. Rejects, with nothing left open, when it cannot. */
export async function OpenAssemblyAISTT(
    options: AssemblyAISTTOptions,
    handlers: AssemblyAISTTHandlers,
    openSocket: AssemblyAISocketOpener = OpenAssemblyAISocket,
    signal?: AbortSignal
): Promise<IAssemblyAISTT> {
    const { Session, Begin } = await AssemblyAISession.Open(
        'AssemblyAI STT',
        openSocket(buildUrl(options), options.APIKey),
        { OnFrame: (frame) => dispatch(frame, handlers), OnLost: (message) => handlers.OnLost(message) },
        signal
    );
    warnOnDifferentModel(options.SpeechModel, Begin);
    return new AssemblyAISTT(Session, options.SampleRate);
}

function buildUrl(options: AssemblyAISTTOptions): string {
    const url = new URL(ASSEMBLYAI_STT_URL);
    url.searchParams.set('speech_model', options.SpeechModel);
    url.searchParams.set('sample_rate', String(options.SampleRate));
    if (options.Mode) {
        url.searchParams.set('mode', options.Mode);
    }
    if (options.MaxTurnSilenceMs !== undefined) {
        url.searchParams.set('max_turn_silence', String(options.MaxTurnSilenceMs));
    }
    if (options.VadThreshold !== undefined) {
        url.searchParams.set('vad_threshold', String(options.VadThreshold));
    }
    if (options.Keyterms && options.Keyterms.length > 0) {
        url.searchParams.set('keyterms_prompt', JSON.stringify(options.Keyterms));
    }
    return url.toString();
}

function dispatch(frame: JSONObject, handlers: AssemblyAISTTHandlers): void {
    if (frame['type'] === 'SpeechStarted') {
        handlers.OnSpeechStarted();
    } else if (frame['type'] === 'Turn') {
        const transcript = frame['transcript'];
        handlers.OnTurn({ Transcript: typeof transcript === 'string' ? transcript : '', EndOfTurn: frame['end_of_turn'] === true });
    }
}

/** An unknown parameter is ignored rather than refused, so this echo is the only sign of a wrong model. */
function warnOnDifferentModel(requested: string, begin: JSONObject): void {
    const configuration = begin['configuration'];
    const model = typeof configuration === 'object' && configuration !== null && !Array.isArray(configuration) ? configuration['model'] : undefined;
    if (typeof model === 'string' && model !== requested) {
        console.warn(`AssemblyAI STT: asked for '${requested}' but the session runs '${model}'`);
    }
}

class AssemblyAISTT implements IAssemblyAISTT {
    private pending: Uint8Array[] = [];
    private pendingBytes = 0;
    private readonly frameBytes: number;
    private readonly maxFrameBytes: number;

    constructor(
        private readonly session: AssemblyAISession,
        sampleRate: number
    ) {
        this.frameBytes = (sampleRate * BYTES_PER_SAMPLE * FRAME_MS) / 1000;
        this.maxFrameBytes = (sampleRate * BYTES_PER_SAMPLE * MAX_FRAME_MS) / 1000;
    }

    public SendAudio(pcm: Uint8Array): void {
        if (!this.session.IsOpen) {
            return;
        }
        this.pending.push(pcm);
        this.pendingBytes += pcm.byteLength;
        if (this.pendingBytes < this.frameBytes) {
            return;
        }
        const audio = Buffer.concat(this.pending);
        this.pending = [];
        this.pendingBytes = 0;
        for (let start = 0; start < audio.byteLength; start += this.maxFrameBytes) {
            this.session.SendBinary(audio.subarray(start, start + this.maxFrameBytes));
        }
    }

    public UpdateAgentContext(reply: string): void {
        this.session.Send({ type: 'UpdateConfiguration', agent_context: reply.slice(-MAX_AGENT_CONTEXT_CHARS) });
    }

    public Close(): Promise<void> {
        this.pending = [];
        this.pendingBytes = 0;
        return this.session.Close();
    }
}
