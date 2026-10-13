import { vi, type Mock } from 'vitest';
import { RECORDING_FRAME_SAMPLES } from '@memberjunction/ai-core-plus';
import type { IRealtimeMediaHost, IRealtimeSessionRecorder } from '../hosts/IRealtimeMediaHost';
import type { IRecordingShardStore, PendingRecordingShard } from '../session/RecordingShardStore';
import type { IRecordingTransport, RecordingTerminalInput, RecordingUploadOptions, RecordingUploadOutcome } from '../session/RecordingTransport';
import type { RecordingShard } from '../session/RecordingShardWindow';
import { RealtimeSessionRuntime } from '../session/RealtimeSessionRuntime';

/** Bytes per fake Opus packet: small, fixed, and distinct per packet so a resend is recognisable. */
export const FAKE_PACKET_BYTES = 20;

/**
 * A recorder whose encoder output the test controls: {@link Capture} queues packets as if 20 ms of
 * audio had been encoded, and {@link TakeEncodedPackets} hands them over exactly once.
 */
export class FakeRecorder implements IRealtimeSessionRecorder {
    public IsRecording = true;
    public Start: Mock<IRealtimeSessionRecorder['Start']> = vi.fn();
    public AttachRemoteStream: Mock<IRealtimeSessionRecorder['AttachRemoteStream']> = vi.fn();
    public NowOffsetMs = (): number => 0;
    public StopCalls = 0;
    /** Packets the encoder flushes during {@link Stop} (its buffered last frames). */
    public PacketsFlushedOnStop = 0;
    /** Samples the encoder padded onto its last frame; {@link Stop} reports that many fewer. */
    public PaddingSamples = 0;
    /** When set, {@link Stop} rejects with it. */
    public StopError: Error | null = null;
    /** When true, {@link Stop} never settles (a wedged encoder). */
    public StopHangs = false;
    /** When set, {@link Stop} waits for it before flushing (an encoder still finishing its last frames). */
    public StopGate: Promise<void> | null = null;
    private pending: Uint8Array[] = [];
    private produced = 0;

    /** Encodes `count` packets; each packet's bytes are filled with its sequence number. */
    public Capture(count: number): void {
        for (let i = 0; i < count; i++) {
            this.pending.push(new Uint8Array(FAKE_PACKET_BYTES).fill(this.produced % 256));
            this.produced++;
        }
    }

    public TakeEncodedPackets(): Uint8Array[] {
        const out = this.pending;
        this.pending = [];
        return out;
    }

    public async Stop(): Promise<number> {
        this.StopCalls++;
        if (this.StopError) {
            throw this.StopError;
        }
        if (this.StopHangs) {
            return new Promise<number>(() => undefined);
        }
        if (this.StopGate) {
            await this.StopGate;
        }
        this.Capture(this.PacketsFlushedOnStop);
        this.PacketsFlushedOnStop = 0;
        return this.produced * RECORDING_FRAME_SAMPLES - this.PaddingSamples;
    }
}

/** A media host with a structural mic stream and a {@link FakeRecorder}. */
export class FakeRecordingHost implements IRealtimeMediaHost {
    public recorder: FakeRecorder | null = null;
    public async AcquireMicrophone(): Promise<MediaStream> {
        return { getTracks: () => [], getAudioTracks: () => [] } as unknown as MediaStream;
    }
    public CreateRecorder(): IRealtimeSessionRecorder | null {
        this.recorder = new FakeRecorder();
        return this.recorder;
    }
}

/** An in-memory shard store that writes every call into a log shared with the transport. */
export class FakeShardStore implements IRecordingShardStore {
    public readonly Rows = new Map<string, PendingRecordingShard>();
    constructor(public readonly Log: string[] = []) {}

    public async Put(shard: PendingRecordingShard): Promise<void> {
        this.Log.push(`put:${shard.SessionID}/${shard.Index}`);
        this.Rows.set(`${shard.SessionID}/${shard.Index}`, shard);
    }
    public async Delete(sessionID: string, index: number): Promise<void> {
        this.Log.push(`delete:${sessionID}/${index}`);
        this.Rows.delete(`${sessionID}/${index}`);
    }
    public async ListOldest(limit: number): Promise<PendingRecordingShard[]> {
        this.Log.push(`list:${limit}`);
        return [...this.Rows.values()].sort((a, b) => a.SavedAt - b.SavedAt).slice(0, limit);
    }
    /** Keys still waiting for an ack, sorted. */
    public get Keys(): string[] {
        return [...this.Rows.keys()].sort();
    }
}

/** What one shard upload does on the server: store it, refuse it, or throw on the wire. */
/**
 * What one fake upload does: `stored` (acked), `refused` (the server will never take it, e.g. 403),
 * `unavailable` (may succeed later, e.g. 503), or `network-error` (throws on the wire).
 */
export type FakeUploadOutcome = 'stored' | 'refused' | 'unavailable' | 'network-error';

export interface FakeUpload {
    SessionID: string;
    Index: number;
    Bytes: Uint8Array;
    /** True for a `keepalive` upload (the page-may-close path), false for the queue's ordinary ones. */
    Keepalive: boolean;
}

export interface FakeTerminal {
    SessionID: string;
    Input: RecordingTerminalInput;
}

/**
 * A transport that logs into the shared call log. Uploads answer with the next scripted outcome
 * (`stored` once the script runs out). Terminals answer `TerminalAck` unless {@link HoldTerminal}
 * was called, in which case they wait for {@link ReleaseTerminal}.
 */
export class FakeRecordingTransport implements IRecordingTransport {
    public readonly Uploads: FakeUpload[] = [];
    public readonly Terminals: FakeTerminal[] = [];
    public TerminalAck = true;
    /** While true every upload fails on the wire, like a browser that has lost the network. */
    public Offline = false;
    /** When set, the next upload waits on it and answers with the outcome it resolves to. */
    public HoldNextUpload: Promise<FakeUploadOutcome> | null = null;
    private heldTerminal: Promise<boolean> | null = null;
    private releaseTerminal: (ack: boolean) => void = () => undefined;

    constructor(
        public readonly Log: string[] = [],
        private readonly script: FakeUploadOutcome[] = [],
    ) {}

    public async UploadShard(
        sessionID: string,
        shard: RecordingShard | PendingRecordingShard,
        options?: RecordingUploadOptions,
    ): Promise<RecordingUploadOutcome> {
        this.Log.push(`upload${options?.Keepalive ? '(keepalive)' : ''}:${sessionID}/${shard.Index}`);
        this.Uploads.push({ SessionID: sessionID, Index: shard.Index, Bytes: shard.Bytes, Keepalive: options?.Keepalive === true });
        if (this.Offline) {
            throw new Error('offline');
        }
        const held = this.HoldNextUpload;
        this.HoldNextUpload = null;
        const outcome = held ? await held : (this.script.shift() ?? 'stored');
        if (outcome === 'network-error') {
            throw new Error('network blip');
        }
        return outcome === 'stored' ? 'Acked' : outcome === 'refused' ? 'Refused' : 'Retry';
    }

    public SendTerminal(sessionID: string, input: RecordingTerminalInput): Promise<boolean> {
        this.Log.push(`terminal:${sessionID}/${input.LastShardIndex}`);
        this.Terminals.push({ SessionID: sessionID, Input: input });
        return this.heldTerminal ?? Promise.resolve(this.TerminalAck);
    }

    /** Makes every later terminal wait until {@link ReleaseTerminal}. */
    public HoldTerminal(): void {
        this.heldTerminal = new Promise<boolean>((resolve) => {
            this.releaseTerminal = resolve;
        });
    }

    public ReleaseTerminal(ack: boolean): void {
        this.releaseTerminal(ack);
    }
}

/** A runtime whose recording store and transport are the test's fakes. */
export class FakeRecordingRuntime extends RealtimeSessionRuntime {
    constructor(
        host: IRealtimeMediaHost,
        public Store: IRecordingShardStore,
        public Transport: IRecordingTransport | null,
    ) {
        super(host);
    }
    protected override createRecordingTransport(): IRecordingTransport | null {
        return this.Transport;
    }
    protected override createRecordingShardStore(): IRecordingShardStore {
        return this.Store;
    }
}
