/**
 * Opus ledger assembly. The pure part (`AssembleOpusRecordingPcm`, peaks, WAV) runs on REAL libopus
 * packets: a synthetic tone encoded with `@evan/opus` in 960-sample frames and cut into `MJOPUS1`
 * shards. The orchestrator (`AssembleRealtimeRecordingFromLedger`) runs against an in-memory ledger that
 * shares one session row with a fake provider (as the DB would), a mocked `FileStorageEngine`, and an
 * in-memory bucket.
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { Encoder } from '@evan/opus';
import { EncodeRecordingShard, RecordingShardContents, RECORDING_FRAME_SAMPLES } from '@memberjunction/ai-core-plus';
import { IMetadataProvider, UserInfo } from '@memberjunction/core';

const { getDriverMock, uploadFileMock, configMock, accountsMock } = vi.hoisted(() => ({
    getDriverMock: vi.fn(), uploadFileMock: vi.fn(), configMock: vi.fn(), accountsMock: vi.fn(),
}));

vi.mock('@memberjunction/storage', () => ({
    FileStorageEngine: {
        Instance: { GetDriver: getDriverMock, UploadFile: uploadFileMock, Config: configMock, GetAccountsByProviderID: accountsMock },
    },
}));

import {
    AssembleOpusRecordingPcm, AssembleRealtimeRecordingFromLedger, ComputeRecordingPeaks, EncodePcm16Wav, CreateLibopusDecoder,
    IOpusPacketDecoder, RecordingGap, MAX_ASSEMBLY_SHARDS, MAX_ASSEMBLY_SAMPLES,
} from '../realtime/realtime-recording-opus-assembly';
import { FinishAssemblyInput, IRealtimeRecordingLedger, LedgerShard, RecordShardResult } from '../realtime/realtime-recording-ledger';

const SESSION = '0B5E1C2D-3F4A-4B5C-8D6E-7F8091A2B3C4';
const FOLDER = `realtime-recordings/${SESSION}`;
const user = {} as UserInfo;

// Four shards of a continuous stream: three 1 s shards (50 packets) and a 0.5 s tail.
const SHARD_SAMPLES = 48000;
const CAPTURED = 3 * SHARD_SAMPLES + 24000;
const EXPECTED = 4;

/** Encodes `totalSamples` of a 440 Hz tone with one libopus encoder into 960-sample packets. */
function encodeTone(totalSamples: number): Uint8Array[] {
    const encoder = new Encoder({ channels: 1, sample_rate: 48000, application: 'voip' });
    encoder.bitrate = 32000;
    const packets: Uint8Array[] = [];
    for (let start = 0; start < totalSamples; start += RECORDING_FRAME_SAMPLES) {
        const frame = new Int16Array(RECORDING_FRAME_SAMPLES);
        for (let i = 0; i < RECORDING_FRAME_SAMPLES && start + i < totalSamples; i++) {
            frame[i] = Math.round(12000 * Math.sin((2 * Math.PI * 440 * (start + i)) / 48000));
        }
        packets.push(Uint8Array.from(encoder.encode(frame)));
    }
    return packets;
}

let fixtureShards: RecordingShardContents[];

beforeAll(() => {
    const packets = encodeTone(CAPTURED);
    const perShard = SHARD_SAMPLES / RECORDING_FRAME_SAMPLES;
    fixtureShards = [];
    for (let index = 0; index < EXPECTED; index++) {
        const shardPackets = packets.slice(index * perShard, (index + 1) * perShard);
        const startSample = index * SHARD_SAMPLES;
        fixtureShards.push({
            ShardIndex: index, StartSample: startSample, SampleCount: Math.min(SHARD_SAMPLES, CAPTURED - startSample),
            PacketCount: shardPackets.length, Packets: shardPackets,
        });
    }
});

function allZero(pcm: Int16Array, from: number, to: number): boolean {
    for (let i = from; i < to; i++) if (pcm[i] !== 0) return false;
    return true;
}

function pcmFromWav(wav: Buffer): Int16Array {
    const samples = new Int16Array((wav.length - 44) / 2);
    for (let i = 0; i < samples.length; i++) samples[i] = wav.readInt16LE(44 + 2 * i);
    return samples;
}

/** A decoder that emits a constant 960-sample frame and records resets. */
class ConstantDecoder implements IOpusPacketDecoder {
    public Resets = 0;
    public Decoded = 0;
    constructor(private readonly value = 1000, private readonly frame = RECORDING_FRAME_SAMPLES) {}
    public Decode(): Int16Array { this.Decoded++; return new Int16Array(this.frame).fill(this.value); }
    public Reset(): void { this.Resets++; }
}

function fakeShard(index: number, startSample: number, sampleCount: number, packetCount = Math.ceil(sampleCount / 960)): RecordingShardContents {
    return { ShardIndex: index, StartSample: startSample, SampleCount: sampleCount, PacketCount: packetCount, Packets: Array.from({ length: packetCount }, () => new Uint8Array([1])) };
}

describe('AssembleOpusRecordingPcm (real libopus)', () => {
    it('all shards present: PCM is exactly the captured length, carries audio, no gaps, Complete', () => {
        const result = AssembleOpusRecordingPcm(fixtureShards, EXPECTED, CAPTURED, CreateLibopusDecoder());
        expect(result.Pcm.length).toBe(CAPTURED);
        expect(result.Gaps).toEqual([]);
        expect(result.Complete).toBe(true);
        expect(allZero(result.Pcm, 0, CAPTURED)).toBe(false);
        expect(allZero(result.Pcm, CAPTURED - 960, CAPTURED)).toBe(false);
    });

    it('one shard missing: exactly its range is silent and listed with its index; audio resumes after it', () => {
        const shards = fixtureShards.filter(s => s.ShardIndex !== 1);
        const result = AssembleOpusRecordingPcm(shards, EXPECTED, CAPTURED, CreateLibopusDecoder());
        expect(result.Pcm.length).toBe(CAPTURED);
        expect(result.Gaps).toEqual([{ startSample: SHARD_SAMPLES, sampleCount: SHARD_SAMPLES, indexes: [1] }]);
        expect(result.Complete).toBe(false);
        expect(allZero(result.Pcm, SHARD_SAMPLES, 2 * SHARD_SAMPLES)).toBe(true);
        expect(allZero(result.Pcm, SHARD_SAMPLES - 960, SHARD_SAMPLES)).toBe(false);
        expect(allZero(result.Pcm, 2 * SHARD_SAMPLES, 2 * SHARD_SAMPLES + 960)).toBe(false);
    });

    it('a missing trailing shard is silence up to the captured length', () => {
        const shards = fixtureShards.filter(s => s.ShardIndex !== 3);
        const result = AssembleOpusRecordingPcm(shards, EXPECTED, CAPTURED, CreateLibopusDecoder());
        expect(result.Pcm.length).toBe(CAPTURED);
        expect(result.Gaps).toEqual([{ startSample: 3 * SHARD_SAMPLES, sampleCount: 24000, indexes: [3] }]);
        expect(allZero(result.Pcm, 3 * SHARD_SAMPLES, CAPTURED)).toBe(true);
    });

    it('expected unknown (no terminal): expected = highest index + 1, length = end of last shard, never Complete', () => {
        const result = AssembleOpusRecordingPcm(fixtureShards, null, null, CreateLibopusDecoder());
        expect(result.Pcm.length).toBe(CAPTURED);
        expect(result.Gaps).toEqual([]);
        expect(result.Complete).toBe(false);
    });
});

describe('AssembleOpusRecordingPcm (layout rules)', () => {
    it('trims decoded audio to SampleCount and zero-pads a shard whose packets carry less', () => {
        // Shard 0: 2 packets (1920 samples) but only 1000 counted. Shard 1: counts 1920 with 1 packet (960).
        const shards = [fakeShard(0, 0, 1000, 2), fakeShard(1, 1000, 1920, 2)];
        shards[1] = { ...shards[1], PacketCount: 1, Packets: [new Uint8Array([1])] };
        const result = AssembleOpusRecordingPcm(shards, 2, 2920, new ConstantDecoder());
        expect(result.Pcm.length).toBe(2920);
        expect(allZero(result.Pcm, 0, 1000)).toBe(false);
        expect(result.Pcm[999]).toBe(1000);
        expect(result.Pcm[1000 + 959]).toBe(1000);
        expect(allZero(result.Pcm, 1000 + 960, 2920)).toBe(true);
        expect(result.Complete).toBe(true);
    });

    it('a shard starting past the current position leaves a silent gap with no indexes and resets the decoder', () => {
        const decoder = new ConstantDecoder();
        const result = AssembleOpusRecordingPcm([fakeShard(0, 0, 960), fakeShard(1, 2000, 960)], 2, 2960, decoder);
        expect(result.Gaps).toEqual([{ startSample: 960, sampleCount: 1040, indexes: [] }]);
        expect(result.Complete).toBe(false);
        expect(decoder.Resets).toBe(1);
    });

    it('a run of missing indexes becomes one gap listing all of them', () => {
        const decoder = new ConstantDecoder();
        const result = AssembleOpusRecordingPcm([fakeShard(0, 0, 960), fakeShard(3, 3840, 960)], 4, 4800, decoder);
        expect(result.Gaps).toEqual([{ startSample: 960, sampleCount: 2880, indexes: [1, 2] }]);
        expect(decoder.Resets).toBe(1);
    });

    it('throws on a shard that starts before the end of the previous one', () => {
        expect(() => AssembleOpusRecordingPcm([fakeShard(0, 0, 960), fakeShard(1, 500, 960)], 2, 1460, new ConstantDecoder()))
            .toThrow(/overlap|before/i);
    });

    it('a captured count past the last shard leaves a trailing gap and is not Complete', () => {
        const result = AssembleOpusRecordingPcm([fakeShard(0, 0, 960)], 1, 2000, new ConstantDecoder());
        expect(result.Gaps).toEqual([{ startSample: 960, sampleCount: 1040, indexes: [] }]);
        expect(result.Complete).toBe(false);
    });

    it('refuses more shards or samples than the bounds allow', () => {
        expect(() => AssembleOpusRecordingPcm([], MAX_ASSEMBLY_SHARDS + 1, 0, new ConstantDecoder())).toThrow(/shards/i);
        expect(() => AssembleOpusRecordingPcm([], 1, MAX_ASSEMBLY_SAMPLES + 1, new ConstantDecoder())).toThrow(/samples/i);
    });
});

describe('ComputeRecordingPeaks / EncodePcm16Wav', () => {
    it('peaks are max-abs per bucket normalized by the global max; silence yields []', () => {
        expect(ComputeRecordingPeaks(new Int16Array(5000))).toEqual([]);
        const pcm = new Int16Array(1200);
        pcm[0] = 100; pcm[1] = -200; pcm[1199] = 50;
        const peaks = ComputeRecordingPeaks(pcm, 600);
        expect(peaks).toHaveLength(600);
        expect(peaks[0]).toBe(1);
        expect(peaks[599]).toBe(0.25);
        expect(ComputeRecordingPeaks(new Int16Array([5, 10]), 600)).toEqual([0.5, 1]);
    });

    it('writes a 44-byte mono PCM16 header at the given rate and little-endian samples', () => {
        const wav = EncodePcm16Wav(new Int16Array([1, -2, 32767]), 48000);
        expect(wav.length).toBe(44 + 6);
        expect(wav.toString('ascii', 0, 4)).toBe('RIFF');
        expect(wav.readUInt32LE(24)).toBe(48000);
        expect(wav.readUInt16LE(22)).toBe(1);
        expect(wav.readUInt32LE(40)).toBe(6);
        expect([...pcmFromWav(wav)]).toEqual([1, -2, 32767]);
    });
});

// ---------------------------------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------------------------------

interface SessionRow {
    AgentID: string;
    RecordingStatus: string | null;
    RecordingExpectedShards: number | null;
    RecordingCapturedSamples: number | null;
    RecordingFileID: string | null;
    RecordingAssemblyVersion: number;
}

/** In-memory ledger over the shared session row, with the procs' fencing semantics. */
class FakeLedger implements IRealtimeRecordingLedger {
    public readonly Shards = new Map<number, LedgerShard>();
    public readonly Finishes: FinishAssemblyInput[] = [];
    public readonly Deletes: number[] = [];
    public LoadError: Error | null = null;
    constructor(private readonly row: SessionRow) {}
    public Put(shard: RecordingShardContents, bytes?: Uint8Array): void {
        this.Shards.set(shard.ShardIndex, { Index: shard.ShardIndex, StartSample: shard.StartSample, SampleCount: shard.SampleCount, Data: bytes ?? EncodeRecordingShard(shard) });
    }
    public async RecordShard(): Promise<RecordShardResult> { throw new Error('not used'); }
    public async StampTerminal(): Promise<{ Outcome: 'Stamped' | 'Ignored'; RecordingStatus: string | null }> { throw new Error('not used'); }
    public async ClaimAssembly(): Promise<number | null> {
        if (this.row.RecordingStatus !== 'Pending' && this.row.RecordingStatus !== 'Partial') return null;
        this.row.RecordingStatus = 'Assembling';
        return ++this.row.RecordingAssemblyVersion;
    }
    public async FinishAssembly(input: FinishAssemblyInput): Promise<boolean> {
        this.Finishes.push(input);
        if (input.Version !== this.row.RecordingAssemblyVersion || this.row.RecordingStatus !== 'Assembling') return false;
        this.row.RecordingStatus = input.Status;
        this.row.RecordingFileID = input.FileID ?? this.row.RecordingFileID;
        return true;
    }
    public async LoadShards(): Promise<LedgerShard[]> {
        if (this.LoadError) throw this.LoadError;
        return [...this.Shards.values()].sort((a, b) => a.Index - b.Index);
    }
    public async CountShardsBelow(_: string, below: number): Promise<number> { return [...this.Shards.keys()].filter(i => i < below).length; }
    public async DeleteShardsBelow(_: string, below: number): Promise<number> {
        this.Deletes.push(below);
        let n = 0;
        for (const i of [...this.Shards.keys()]) if (i < below) { this.Shards.delete(i); n++; }
        return n;
    }
    public async PurgeClosedBefore(): Promise<number> { throw new Error('not used'); }
}

class FakeBucket {
    public readonly Objects = new Map<string, { bytes: Buffer; contentType: string }>();
    public OnPut: ((key: string) => void) | null = null;
    public async PutObject(key: string, bytes: Buffer, contentType: string): Promise<boolean> {
        this.OnPut?.(key);
        this.Objects.set(key, { bytes, contentType });
        return true;
    }
}

class FakeProvider {
    public readonly Links: { FileID: string; RecordID: string }[] = [];
    public readonly Files = new Map<string, { ProviderKey: string; ProviderID: string; ContentType: string }>();
    public AgentStorageProviderID: string | null = 'prov-1';
    constructor(private readonly row: SessionRow) {}
    public EntityByName(name: string): { ID: string } | undefined {
        return name === 'MJ: AI Agent Sessions' ? { ID: 'ent-sessions' } : undefined;
    }
    public async GetEntityObject(name: string): Promise<unknown> {
        const row = this.row;
        if (name === 'MJ: AI Agent Sessions') {
            const session: Partial<SessionRow> & { ID?: string; Load(id: string): Promise<boolean>; Save(): Promise<boolean> } = {
                async Load(id: string) { Object.assign(session, { ...row, ID: id }); return true; },
                async Save() { throw new Error('the session must never be saved through BaseEntity'); },
            };
            return session;
        }
        if (name === 'MJ: AI Agents') {
            const storage = this.AgentStorageProviderID;
            return { async Load() { return true; }, RecordingStorageProviderID: storage, AttachmentStorageProviderID: null };
        }
        if (name === 'MJ: Files') {
            const files = this.Files;
            const file = {
                ID: '', ProviderKey: null as string | null, ProviderID: '', ContentType: null as string | null,
                async Load(id: string) { const f = files.get(id); if (!f) return false; Object.assign(file, f, { ID: id }); return true; },
            };
            return file;
        }
        if (name === 'MJ: File Entity Record Links') {
            const links = this.Links;
            const link = { FileID: '', EntityID: '', RecordID: '', NewRecord() { /* fresh */ }, async Save() { links.push({ FileID: link.FileID, RecordID: link.RecordID }); return true; } };
            return link;
        }
        throw new Error(`unexpected entity ${name}`);
    }
}

let row: SessionRow;
let ledger: FakeLedger;
let provider: FakeProvider;
let bucket: FakeBucket;
let uploads: { content: Buffer; fileName: string; pathPrefix: string; mimeType: string }[];
let errorSpy: ReturnType<typeof vi.spyOn>;
let logSpy: ReturnType<typeof vi.spyOn>;

function messages(spy: ReturnType<typeof vi.spyOn>): string[] {
    return spy.mock.calls.map(c => c.map(String).join(' '));
}

beforeEach(() => {
    row = { AgentID: 'agent-1', RecordingStatus: 'Pending', RecordingExpectedShards: EXPECTED, RecordingCapturedSamples: CAPTURED, RecordingFileID: null, RecordingAssemblyVersion: 0 };
    ledger = new FakeLedger(row);
    provider = new FakeProvider(row);
    bucket = new FakeBucket();
    uploads = [];
    configMock.mockReset().mockResolvedValue(undefined);
    accountsMock.mockReset().mockImplementation((id: string) => (id === 'prov-1' ? [{ ID: 'acct-1' }] : []));
    getDriverMock.mockReset().mockResolvedValue(bucket);
    let n = 0;
    uploadFileMock.mockReset().mockImplementation(async (args: { content: Buffer; fileName: string; pathPrefix: string; mimeType: string }) => {
        uploads.push(args);
        const fileID = `file-${++n}`;
        const key = `${args.pathPrefix}/${args.fileName}`;
        bucket.Objects.set(key, { bytes: args.content, contentType: args.mimeType });
        provider.Files.set(fileID, { ProviderKey: key, ProviderID: 'prov-1', ContentType: args.mimeType });
        return { FileID: fileID, StoragePath: key };
    });
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
});

afterEach(() => {
    errorSpy.mockRestore();
    logSpy.mockRestore();
});

async function claimAndAssemble(forcePartial?: boolean) {
    const version = await ledger.ClaimAssembly();
    if (version === null) throw new Error('test setup: claim lost');
    const outcome = await AssembleRealtimeRecordingFromLedger({
        SessionID: SESSION, Version: version, Ledger: ledger, ContextUser: user,
        Provider: provider as unknown as IMetadataProvider, ForcePartial: forcePartial,
    });
    return { version, outcome };
}

function storedWav(): Buffer {
    const object = bucket.Objects.get(`${FOLDER}/recording.wav`);
    if (!object) throw new Error('no recording.wav');
    return object.bytes;
}

function storedPeaks(): number[] {
    const object = bucket.Objects.get(`${FOLDER}/peaks.json`);
    if (!object) throw new Error('no peaks.json');
    return JSON.parse(object.bytes.toString('utf8')) as number[];
}

describe('AssembleRealtimeRecordingFromLedger', () => {
    it('all shards: uploads recording.wav of exactly the captured length, peaks from that PCM, Complete, shard rows deleted', async () => {
        fixtureShards.forEach(s => ledger.Put(s));
        const { version, outcome } = await claimAndAssemble();

        expect(outcome).toBe('Complete');
        expect(uploads).toHaveLength(1);
        expect(uploads[0]).toMatchObject({ fileName: 'recording.wav', mimeType: 'audio/wav', pathPrefix: FOLDER });
        const pcm = pcmFromWav(storedWav());
        expect(pcm.length).toBe(CAPTURED);
        expect(storedPeaks()).toEqual(ComputeRecordingPeaks(pcm));
        expect(storedPeaks().length).toBe(600);
        expect(ledger.Finishes).toEqual([{ SessionID: SESSION, Version: version, Status: 'Complete', Gaps: [], FileID: 'file-1' }]);
        expect(row.RecordingFileID).toBe('file-1');
        expect(ledger.Deletes).toEqual([EXPECTED]);
        expect(ledger.Shards.size).toBe(0);
        expect(provider.Links).toEqual([{ FileID: 'file-1', RecordID: SESSION }]);
    });

    it('one shard missing with ForcePartial -> Partial with that range silent; the late shard then re-assembles over the same file', async () => {
        fixtureShards.filter(s => s.ShardIndex !== 2).forEach(s => ledger.Put(s));
        const first = await claimAndAssemble(true);

        expect(first.outcome).toBe('Partial');
        const gap: RecordingGap = { startSample: 2 * SHARD_SAMPLES, sampleCount: SHARD_SAMPLES, indexes: [2] };
        expect(ledger.Finishes[0]).toEqual({ SessionID: SESSION, Version: first.version, Status: 'Partial', Gaps: [gap], FileID: 'file-1' });
        const partialPcm = pcmFromWav(storedWav());
        expect(partialPcm.length).toBe(CAPTURED);
        expect(allZero(partialPcm, 2 * SHARD_SAMPLES, 3 * SHARD_SAMPLES)).toBe(true);
        expect(allZero(partialPcm, 2 * SHARD_SAMPLES - 960, 2 * SHARD_SAMPLES)).toBe(false);
        expect(allZero(partialPcm, 3 * SHARD_SAMPLES, 3 * SHARD_SAMPLES + 960)).toBe(false);
        expect(ledger.Deletes).toEqual([]);
        expect(ledger.Shards.size).toBe(3);

        // The missing shard arrives late (the record proc would set Pending); a new claim re-assembles.
        ledger.Put(fixtureShards[2]);
        row.RecordingStatus = 'Pending';
        const second = await claimAndAssemble();

        expect(second.outcome).toBe('Complete');
        expect(second.version).toBe(first.version + 1);
        expect(ledger.Finishes[1]).toEqual({ SessionID: SESSION, Version: second.version, Status: 'Complete', Gaps: [], FileID: 'file-1' });
        expect(uploads).toHaveLength(1); // overwrite, not a second upload
        const fullPcm = pcmFromWav(storedWav());
        expect(fullPcm.length).toBe(CAPTURED);
        expect(allZero(fullPcm, 2 * SHARD_SAMPLES, 3 * SHARD_SAMPLES)).toBe(false);
        expect(storedPeaks()).toEqual(ComputeRecordingPeaks(fullPcm));
        expect(row.RecordingFileID).toBe('file-1');
        expect(provider.Links).toHaveLength(1);
        expect(ledger.Deletes).toEqual([EXPECTED]);
    });

    it('a session pointing at a non-WAV (legacy) recording gets a new WAV upload instead of an overwrite', async () => {
        fixtureShards.forEach(s => ledger.Put(s));
        provider.Files.set('legacy-webm', { ProviderKey: `${FOLDER}/recording.webm`, ProviderID: 'prov-1', ContentType: 'audio/webm' });
        row.RecordingFileID = 'legacy-webm';
        const { outcome } = await claimAndAssemble();

        expect(outcome).toBe('Complete');
        expect(uploads).toHaveLength(1);
        expect(ledger.Finishes[0].FileID).toBe('file-1');
        expect(row.RecordingFileID).toBe('file-1');
        expect(provider.Links).toEqual([{ FileID: 'file-1', RecordID: SESSION }]);
    });

    it('incomplete without ForcePartial -> Deferred: the claim is handed back as Pending with no file', async () => {
        fixtureShards.filter(s => s.ShardIndex !== 1).forEach(s => ledger.Put(s));
        const { version, outcome } = await claimAndAssemble();

        expect(outcome).toBe('Deferred');
        expect(ledger.Finishes).toEqual([{ SessionID: SESSION, Version: version, Status: 'Pending', Gaps: [], FileID: null }]);
        expect(row.RecordingStatus).toBe('Pending');
        expect(uploads).toHaveLength(0);
        expect(bucket.Objects.size).toBe(0);
    });

    it('fence lost at finish -> Superseded, shards kept, the orphan upload is not linked and is logged', async () => {
        fixtureShards.forEach(s => ledger.Put(s));
        // A newer claim lands while the WAV is uploading (after the pre-write fence check).
        uploadFileMock.mockImplementationOnce(async (args: { content: Buffer; fileName: string; pathPrefix: string; mimeType: string }) => {
            uploads.push(args);
            row.RecordingAssemblyVersion++;
            return { FileID: 'file-orphan', StoragePath: `${args.pathPrefix}/${args.fileName}` };
        });
        const { outcome } = await claimAndAssemble();

        expect(outcome).toBe('Superseded');
        expect(ledger.Shards.size).toBe(EXPECTED);
        expect(ledger.Deletes).toEqual([]);
        expect(provider.Links).toHaveLength(0);
        expect(row.RecordingFileID).toBeNull();
        expect([...messages(logSpy), ...messages(errorSpy)].join('\n')).toContain('file-orphan');
    });

    it('a newer claim before the storage write -> Superseded without writing anything', async () => {
        fixtureShards.forEach(s => ledger.Put(s));
        const version = await ledger.ClaimAssembly();
        row.RecordingStatus = 'Pending';
        await ledger.ClaimAssembly(); // newer claim
        const outcome = await AssembleRealtimeRecordingFromLedger({
            SessionID: SESSION, Version: version as number, Ledger: ledger, ContextUser: user, Provider: provider as unknown as IMetadataProvider,
        });
        expect(outcome).toBe('Superseded');
        expect(uploads).toHaveLength(0);
        expect(bucket.Objects.size).toBe(0);
        expect(ledger.Finishes).toEqual([]);
    });

    it('a corrupt shard becomes a gap at its index and is logged with session and index', async () => {
        fixtureShards.forEach(s => ledger.Put(s));
        ledger.Put(fixtureShards[1], new Uint8Array([1, 2, 3, 4, 5]));
        const { outcome } = await claimAndAssemble(true);

        expect(outcome).toBe('Partial');
        expect(ledger.Finishes[0].Gaps).toEqual([{ startSample: SHARD_SAMPLES, sampleCount: SHARD_SAMPLES, indexes: [1] }]);
        expect(messages(errorSpy).some(m => m.includes(SESSION) && /shard 1\b/.test(m))).toBe(true);
    });

    it('a shard whose header disagrees with its ledger row is treated as missing', async () => {
        fixtureShards.forEach(s => ledger.Put(s));
        // Row 3 holds the bytes of shard 2 (header index 2).
        const mismatched = ledger.Shards.get(2) as LedgerShard;
        ledger.Shards.set(3, { Index: 3, StartSample: 3 * SHARD_SAMPLES, SampleCount: 24000, Data: mismatched.Data });
        const { outcome } = await claimAndAssemble(true);

        expect(outcome).toBe('Partial');
        expect(ledger.Finishes[0].Gaps).toEqual([{ startSample: 3 * SHARD_SAMPLES, sampleCount: 24000, indexes: [3] }]);
        expect(messages(errorSpy).some(m => m.includes(SESSION) && /shard 3\b/.test(m))).toBe(true);
    });

    it('no storage account for the agent -> Failed, finished as Failed, logged', async () => {
        fixtureShards.forEach(s => ledger.Put(s));
        provider.AgentStorageProviderID = null;
        const { version, outcome } = await claimAndAssemble();

        expect(outcome).toBe('Failed');
        expect(ledger.Finishes).toEqual([{ SessionID: SESSION, Version: version, Status: 'Failed', Gaps: [], FileID: null }]);
        expect(messages(errorSpy).some(m => m.includes(SESSION) && /storage/i.test(m))).toBe(true);
    });

    it('expected shards over the bound -> Failed without loading shards', async () => {
        row.RecordingExpectedShards = MAX_ASSEMBLY_SHARDS + 1;
        ledger.LoadError = new Error('must not load');
        const { outcome } = await claimAndAssemble(true);
        expect(outcome).toBe('Failed');
        expect(ledger.Finishes[0].Status).toBe('Failed');
        expect(messages(errorSpy).join('\n')).not.toContain('must not load');
    });

    it('never throws: a ledger read failure -> Failed after finishing as Failed', async () => {
        ledger.LoadError = new Error('db gone');
        const { outcome } = await claimAndAssemble();
        expect(outcome).toBe('Failed');
        expect(ledger.Finishes[0].Status).toBe('Failed');
        expect(messages(errorSpy).some(m => m.includes(SESSION) && m.includes('db gone'))).toBe(true);
    });
});
