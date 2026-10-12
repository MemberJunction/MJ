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
    IOpusPacketDecoder, RecordingGap, MAX_ASSEMBLY_SHARDS, MAX_ASSEMBLY_SAMPLES, FillGapsFromPreviousRecording, ParseCanonicalRecordingWav,
} from '../realtime/realtime-recording-opus-assembly';
import { FinishAssemblyInput, IRealtimeRecordingLedger, LedgerShard, LedgerShardMetadata, RecordShardResult } from '../realtime/realtime-recording-ledger';

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
/** Six full 1 s shards of one continuous stream: a call that went on after a first terminal at 4 shards. */
let continuedShards: RecordingShardContents[];
const CONTINUED_COUNT = 6;

beforeAll(() => {
    const continued = encodeTone(CONTINUED_COUNT * SHARD_SAMPLES);
    const per = SHARD_SAMPLES / RECORDING_FRAME_SAMPLES;
    continuedShards = Array.from({ length: CONTINUED_COUNT }, (_, index) => {
        const packets = continued.slice(index * per, (index + 1) * per);
        return { ShardIndex: index, StartSample: index * SHARD_SAMPLES, SampleCount: SHARD_SAMPLES, PacketCount: packets.length, Packets: packets };
    });
});

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

    it('a decode failure silences its whole shard, lists it as a gap, resets, and reports the packet', () => {
        const decoder = new ConstantDecoder();
        const decode = decoder.Decode.bind(decoder);
        decoder.Decode = () => { if (decoder.Decoded === 3) { decoder.Decoded++; throw new Error('Opus(InvalidPacket)'); } return decode(); };
        // Shard 1 is packets 2..3 (0-based decode calls 2 and 3); its second packet throws.
        const result = AssembleOpusRecordingPcm([fakeShard(0, 0, 1920), fakeShard(1, 1920, 1920), fakeShard(2, 3840, 960)], 3, 4800, decoder);
        expect(result.Gaps).toEqual([{ startSample: 1920, sampleCount: 1920, indexes: [1] }]);
        expect(result.DecodeFailures).toEqual([{ ShardIndex: 1, PacketIndex: 1, Message: 'Opus(InvalidPacket)' }]);
        expect(allZero(result.Pcm, 1920, 3840)).toBe(true);
        expect(result.Pcm[3840]).toBe(1000);
        expect(decoder.Resets).toBe(1);
        expect(result.Complete).toBe(false);
    });

    it('returns the WAV with the PCM in its data section (one buffer)', () => {
        const result = AssembleOpusRecordingPcm([fakeShard(0, 0, 960)], 1, 960, new ConstantDecoder(-5));
        expect(result.Wav.equals(EncodePcm16Wav(result.Pcm, 48000))).toBe(true);
        expect(result.Pcm.buffer).toBe(result.Wav.buffer);
        expect(result.Wav.readInt16LE(44)).toBe(-5);
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
    RecordingGaps: string | null;
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
        this.row.RecordingGaps = Array.isArray(input.Gaps) ? JSON.stringify(input.Gaps) : input.Gaps;
        return true;
    }
    public async LoadShards(): Promise<LedgerShard[]> {
        this.FullLoads++;
        if (this.LoadError) throw this.LoadError;
        return [...this.Shards.values()].sort((a, b) => a.Index - b.Index);
    }
    public FullLoads = 0;
    public async LoadShardMetadata(): Promise<LedgerShardMetadata[]> {
        return [...this.Shards.values()].sort((a, b) => a.Index - b.Index).map(({ Index, StartSample, SampleCount }) => ({ Index, StartSample, SampleCount }));
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
    public async GetObject(p: { fullPath: string }): Promise<Buffer> {
        const object = this.Objects.get(p.fullPath);
        if (!object) throw new Error(`no such object ${p.fullPath}`);
        return object.bytes;
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
    row = { AgentID: 'agent-1', RecordingStatus: 'Pending', RecordingExpectedShards: EXPECTED, RecordingCapturedSamples: CAPTURED, RecordingFileID: null, RecordingAssemblyVersion: 0, RecordingGaps: null };
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

        // The missing shard arrives late. Its index is below expected, so the record proc leaves the
        // session Partial; the re-assembly happens because spClaim accepts Partial.
        ledger.Put(fixtureShards[2]);
        expect(row.RecordingStatus).toBe('Partial');
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

    it('never overwrites a WAV that is not this session\'s own recording.wav (RecordingFileID pointing elsewhere)', async () => {
        fixtureShards.forEach(s => ledger.Put(s));
        const foreignKey = 'realtime-recordings/11111111-2222-4333-8444-555555555555/recording.wav';
        bucket.Objects.set(foreignKey, { bytes: Buffer.from('other session'), contentType: 'audio/wav' });
        provider.Files.set('foreign-wav', { ProviderKey: foreignKey, ProviderID: 'prov-1', ContentType: 'audio/wav' });
        row.RecordingFileID = 'foreign-wav';
        const { outcome } = await claimAndAssemble();

        expect(outcome).toBe('Complete');
        expect(bucket.Objects.get(foreignKey)?.bytes.toString()).toBe('other session');
        expect(uploads).toHaveLength(1);
        expect(row.RecordingFileID).toBe('file-1');
    });

    it('re-assembly overwrites its own recording.wav even when the driver keeps a leading slash on the key', async () => {
        fixtureShards.forEach(s => ledger.Put(s));
        provider.Files.set('own-wav', { ProviderKey: `/${FOLDER}/recording.wav`, ProviderID: 'prov-1', ContentType: 'audio/wav' });
        row.RecordingFileID = 'own-wav';
        const { outcome } = await claimAndAssemble();

        expect(outcome).toBe('Complete');
        expect(uploads).toHaveLength(0);
        expect(bucket.Objects.has(`/${FOLDER}/recording.wav`)).toBe(true);
        expect(ledger.Finishes[0].FileID).toBe('own-wav');
        expect(provider.Links).toHaveLength(0);
    });

    it('more stored shard rows than the bound -> Failed without loading them', async () => {
        ledger.CountShardsBelow = async () => MAX_ASSEMBLY_SHARDS + 1;
        ledger.LoadError = new Error('must not load');
        const { outcome } = await claimAndAssemble(true);
        expect(outcome).toBe('Failed');
        expect(messages(errorSpy).join('\n')).toContain(`${MAX_ASSEMBLY_SHARDS + 1} shards`);
        expect(messages(errorSpy).join('\n')).not.toContain('must not load');
    });

    it('incomplete without ForcePartial -> Deferred from row positions alone: no shard bytes loaded, no file', async () => {
        fixtureShards.filter(s => s.ShardIndex !== 1).forEach(s => ledger.Put(s));
        const { version, outcome } = await claimAndAssemble();

        expect(outcome).toBe('Deferred');
        expect(ledger.FullLoads).toBe(0);
        expect(ledger.Finishes).toEqual([{ SessionID: SESSION, Version: version, Status: 'Pending', Gaps: null, FileID: null }]);
        expect(row.RecordingStatus).toBe('Pending');
        expect(uploads).toHaveLength(0);
        expect(bucket.Objects.size).toBe(0);
    });

    it.each([
        ['the last row ends before captured', () => { row.RecordingCapturedSamples = CAPTURED + 960; }],
        ['no terminal yet', () => { row.RecordingExpectedShards = null; row.RecordingCapturedSamples = null; }],
        ['a row does not start where the previous ended', () => {
            const s = ledger.Shards.get(2) as LedgerShard;
            ledger.Shards.set(2, { ...s, StartSample: s.StartSample + 960 });
        }],
    ])('un-forced: Deferred before loading when %s', async (_label, arrange) => {
        fixtureShards.forEach(s => ledger.Put(s));
        arrange();
        const { outcome } = await claimAndAssemble();
        expect(outcome).toBe('Deferred');
        expect(ledger.FullLoads).toBe(0);
    });

    it('a Deferred hand-back keeps the gaps stored for the existing Partial recording', async () => {
        const stored = JSON.stringify([{ startSample: SHARD_SAMPLES, sampleCount: SHARD_SAMPLES, indexes: [1] }]);
        row.RecordingStatus = 'Partial';
        row.RecordingGaps = stored;
        row.RecordingFileID = 'file-0';
        provider.Files.set('file-0', { ProviderKey: `${FOLDER}/recording.wav`, ProviderID: 'prov-1', ContentType: 'audio/wav' });
        bucket.Objects.set(`${FOLDER}/recording.wav`, { bytes: EncodePcm16Wav(new Int16Array(CAPTURED), 48000), contentType: 'audio/wav' });
        fixtureShards.filter(s => s.ShardIndex !== 1).forEach(s => ledger.Put(s));
        const { outcome } = await claimAndAssemble();

        expect(outcome).toBe('Deferred');
        expect(ledger.Finishes[0].Gaps).toBe(stored);
        expect(row.RecordingGaps).toBe(stored);
        expect(row.RecordingFileID).toBe('file-0');
    });

    it('a complete-looking ledger with a corrupt shard, un-forced, is decoded and then Deferred', async () => {
        fixtureShards.forEach(s => ledger.Put(s));
        ledger.Put(fixtureShards[1], new Uint8Array([1, 2, 3]));
        const { outcome } = await claimAndAssemble();
        expect(outcome).toBe('Deferred');
        expect(ledger.FullLoads).toBe(1);
        expect(uploads).toHaveLength(0);
    });

    it('a shard with an undecodable packet is silenced whole, listed as a gap, logged; the rest decodes', async () => {
        const bad = fixtureShards[1];
        const packets = bad.Packets.map((p, i) => (i === 10 ? new Uint8Array([0xff]) : p));
        fixtureShards.forEach(s => ledger.Put(s));
        ledger.Put({ ...bad, Packets: packets });
        const { outcome } = await claimAndAssemble(true);

        expect(outcome).toBe('Partial');
        expect(ledger.Finishes[0].Gaps).toEqual([{ startSample: SHARD_SAMPLES, sampleCount: SHARD_SAMPLES, indexes: [1] }]);
        const pcm = pcmFromWav(storedWav());
        expect(pcm.length).toBe(CAPTURED);
        expect(allZero(pcm, SHARD_SAMPLES, 2 * SHARD_SAMPLES)).toBe(true);
        expect(allZero(pcm, 2 * SHARD_SAMPLES, 2 * SHARD_SAMPLES + 960)).toBe(false);
        expect(messages(errorSpy).some(m => m.includes(SESSION) && /shard 1 packet 10\b/.test(m))).toBe(true);
    });

    it('shards running past the terminal\'s captured count are kept and the overrun is logged', async () => {
        fixtureShards.forEach(s => ledger.Put(s));
        row.RecordingCapturedSamples = CAPTURED - 1000;
        const { outcome } = await claimAndAssemble(true);

        expect(outcome).toBe('Partial');
        expect(pcmFromWav(storedWav()).length).toBe(CAPTURED);
        expect(messages(logSpy).some(m => m.includes(SESSION) && m.includes('shards 3') && m.includes('1000 samples past'))).toBe(true);
    });

    it('a transient storage error -> Retry: logged, no finish call, the claim stays Assembling', async () => {
        fixtureShards.forEach(s => ledger.Put(s));
        uploadFileMock.mockRejectedValueOnce(new Error('storage timeout'));
        const { outcome } = await claimAndAssemble();

        expect(outcome).toBe('Retry');
        expect(ledger.Finishes).toEqual([]);
        expect(row.RecordingStatus).toBe('Assembling');
        expect(ledger.Shards.size).toBe(EXPECTED);
        expect(messages(errorSpy).some(m => m.includes(SESSION) && m.includes('storage timeout'))).toBe(true);
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

    it('never throws: a ledger read failure is transient -> Retry with the claim left Assembling', async () => {
        fixtureShards.forEach(s => ledger.Put(s));
        ledger.LoadError = new Error('db gone');
        const { version, outcome } = await claimAndAssemble();
        expect(outcome).toBe('Retry');
        expect(ledger.Finishes).toEqual([]);
        expect(row.RecordingStatus).toBe('Assembling');
        expect(row.RecordingAssemblyVersion).toBe(version);
        expect(messages(errorSpy).some(m => m.includes(SESSION) && m.includes(`version ${version}`) && m.includes('db gone'))).toBe(true);
    });
});

describe('FillGapsFromPreviousRecording / ParseCanonicalRecordingWav', () => {
    it('copies a gap from the previous recording, keeps its old gaps inside, and leaves the part beyond it a gap', () => {
        // New timeline: shard 0 missing [0, 1920), shard 1 present [1920, 2880), shard 2 missing [2880, 4800).
        const assembled = AssembleOpusRecordingPcm([fakeShard(1, 1920, 960)], 3, 4800, new ConstantDecoder(7));
        expect(assembled.Gaps).toHaveLength(2);
        const previous = { Pcm: new Int16Array(3840).fill(3), Gaps: [{ startSample: 960, sampleCount: 480, indexes: [9] }] };
        previous.Pcm.fill(0, 960, 1440);

        const filled = FillGapsFromPreviousRecording(assembled, previous);
        expect(filled.Gaps).toEqual([
            { startSample: 960, sampleCount: 480, indexes: [9] },
            { startSample: 3840, sampleCount: 960, indexes: [2] },
        ]);
        expect(filled.Pcm[0]).toBe(3);
        expect(filled.Pcm[1920]).toBe(7);
        expect(filled.Pcm[3000]).toBe(3);
        expect(allZero(filled.Pcm, 3840, 4800)).toBe(true);
        expect(filled.Complete).toBe(false);
        expect([...pcmFromWav(filled.Wav)]).toEqual([...filled.Pcm]);
    });

    it('is Complete when the previous recording covers every gap and had none of its own', () => {
        const assembled = AssembleOpusRecordingPcm([fakeShard(1, 960, 960)], 2, 1920, new ConstantDecoder());
        const filled = FillGapsFromPreviousRecording(assembled, { Pcm: new Int16Array(960).fill(4), Gaps: [] });
        expect(filled.Gaps).toEqual([]);
        expect(filled.Complete).toBe(true);
    });

    it('accepts only the canonical 48 kHz mono PCM16 layout', () => {
        const samples = new Int16Array([1, -2, 3]);
        expect([...(ParseCanonicalRecordingWav(EncodePcm16Wav(samples, 48000)) ?? [])]).toEqual([1, -2, 3]);
        expect(ParseCanonicalRecordingWav(EncodePcm16Wav(samples, 24000))).toBeNull();
        const truncated = EncodePcm16Wav(samples, 48000).subarray(0, 48);
        expect(ParseCanonicalRecordingWav(truncated)).toBeNull();
        expect(ParseCanonicalRecordingWav(Buffer.from('not a wav at all, definitely not one, nope!!'))).toBeNull();
    });
});

describe('AssembleRealtimeRecordingFromLedger after a Complete recording is re-opened', () => {
    const S = SHARD_SAMPLES;

    /** First terminal at 4 shards: Complete, which deletes the rows. Returns the first WAV. */
    async function completeFirstFour(): Promise<Buffer> {
        row.RecordingExpectedShards = 4;
        row.RecordingCapturedSamples = 4 * S;
        continuedShards.slice(0, 4).forEach(s => ledger.Put(s));
        const { outcome } = await claimAndAssemble();
        expect(outcome).toBe('Complete');
        expect(ledger.Shards.size).toBe(0);
        return Buffer.from(storedWav());
    }

    /** The call went on: shards 4 and 5 arrive and a strictly higher terminal re-opens the session. */
    function continueCall(): void {
        continuedShards.slice(4).forEach(s => ledger.Put(s));
        row.RecordingExpectedShards = CONTINUED_COUNT;
        row.RecordingCapturedSamples = CONTINUED_COUNT * S;
        row.RecordingStatus = 'Pending';
    }

    it('reproduces the first recording for the deleted range plus the new audio: Complete, no gaps, same file', async () => {
        const first = pcmFromWav(await completeFirstFour());
        continueCall();
        const { outcome } = await claimAndAssemble();

        expect(outcome).toBe('Complete');
        expect(ledger.Finishes[1]).toMatchObject({ Status: 'Complete', Gaps: [], FileID: 'file-1' });
        expect(uploads).toHaveLength(1);
        const second = pcmFromWav(storedWav());
        expect(second.length).toBe(CONTINUED_COUNT * S);
        expect([...second.subarray(0, 4 * S)]).toEqual([...first]);
        expect(allZero(second, 4 * S, 4 * S + 960)).toBe(false);
        expect(allZero(second, CONTINUED_COUNT * S - 960, CONTINUED_COUNT * S)).toBe(false);
        expect(ledger.Deletes).toEqual([4, CONTINUED_COUNT]);
    });

    it('carries the previous Partial gaps inside the reused range into the new gap list', async () => {
        row.RecordingExpectedShards = 4;
        row.RecordingCapturedSamples = 4 * S;
        [0, 2, 3].forEach(i => ledger.Put(continuedShards[i]));
        expect((await claimAndAssemble(true)).outcome).toBe('Partial');
        const first = pcmFromWav(Buffer.from(storedWav()));
        // The rows behind that Partial are gone (as after a Complete), so only the WAV holds their audio.
        ledger.Shards.clear();
        continueCall();
        const { outcome } = await claimAndAssemble(true);

        expect(outcome).toBe('Partial');
        expect(ledger.Finishes[1].Gaps).toEqual([{ startSample: S, sampleCount: S, indexes: [1] }]);
        const second = pcmFromWav(storedWav());
        expect([...second.subarray(0, 4 * S)]).toEqual([...first]);
        expect(allZero(second, S, 2 * S)).toBe(true);
    });

    it('does not reuse an existing file that is not a canonical recording WAV: logged, ranges silent and listed', async () => {
        await completeFirstFour();
        const key = `${FOLDER}/recording.wav`;
        bucket.Objects.set(key, { bytes: EncodePcm16Wav(new Int16Array(4 * S).fill(9), 24000), contentType: 'audio/wav' });
        continueCall();
        const { outcome } = await claimAndAssemble(true);

        expect(outcome).toBe('Partial');
        expect(ledger.Finishes[1].Gaps).toEqual([{ startSample: 0, sampleCount: 4 * S, indexes: [0, 1, 2, 3] }]);
        expect(allZero(pcmFromWav(storedWav()), 0, 4 * S)).toBe(true);
        expect(messages(errorSpy).some(m => m.includes(SESSION) && m.includes('not a canonical'))).toBe(true);
    });

    it('un-forced with an unusable previous recording: Deferred, nothing written', async () => {
        await completeFirstFour();
        bucket.Objects.set(`${FOLDER}/recording.wav`, { bytes: Buffer.from('garbage'), contentType: 'audio/wav' });
        continueCall();
        const { outcome } = await claimAndAssemble();
        expect(outcome).toBe('Deferred');
        expect(bucket.Objects.get(`${FOLDER}/recording.wav`)?.bytes.toString()).toBe('garbage');
    });
});
