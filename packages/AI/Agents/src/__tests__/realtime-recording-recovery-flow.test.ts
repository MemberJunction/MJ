/**
 * `RecoverRealtimeRecordingFromSegments` end to end against an in-memory delimited bucket, a mocked
 * `UploadFile`, and a fake provider backed by one shared session row. Also covers the rate in the shard
 * key, and that `StoreRealtimeRecording`'s default behaviour (the end-of-call caller) is unchanged.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { getDriverMock, uploadFileMock } = vi.hoisted(() => ({ getDriverMock: vi.fn(), uploadFileMock: vi.fn() }));

vi.mock('@memberjunction/storage', () => ({
    FileStorageEngine: { Instance: { GetDriver: getDriverMock, UploadFile: uploadFileMock } },
}));

import {
    RecoverRealtimeRecordingFromSegments, StoreRealtimeRecording, WriteRealtimeRecordingSegment, MAX_RECOVERY_SEGMENTS,
} from '../realtime/realtime-recording-store';
import { IMetadataProvider, UserInfo } from '@memberjunction/core';

const FOLDER = 'realtime-recordings/sess-1';
const user = {} as UserInfo;

/** In-memory bucket with S3-style delimiter listing, object bytes and content types. */
class FakeBucket {
    public readonly Objects = new Map<string, Buffer>();
    public readonly ContentTypes = new Map<string, string>();
    public readonly Reads: string[] = [];
    public FailReadOf: string | null = null;
    public Put(key: string, bytes: Buffer, contentType = 'audio/L16;rate=24000'): void {
        this.Objects.set(key, bytes);
        this.ContentTypes.set(key, contentType);
    }
    public async PutObject(key: string, bytes: Buffer, contentType: string): Promise<boolean> {
        this.Put(key, bytes, contentType);
        return true;
    }
    public async ListObjects(prefix: string): Promise<{ objects: { name: string }[]; prefixes: string[] }> {
        const objects: { name: string }[] = [];
        for (const key of this.Objects.keys()) {
            if (key.startsWith(prefix) && !key.slice(prefix.length).includes('/')) objects.push({ name: key });
        }
        return { objects, prefixes: [] };
    }
    public async GetObject(p: { fullPath: string }): Promise<Buffer> {
        this.Reads.push(p.fullPath);
        if (p.fullPath === this.FailReadOf) throw new Error('read exploded');
        const bytes = this.Objects.get(p.fullPath);
        if (!bytes) throw new Error(`no such object ${p.fullPath}`);
        return bytes;
    }
    public async GetObjectMetadata(p: { fullPath: string }): Promise<{ contentType: string | undefined }> {
        return { contentType: this.ContentTypes.get(p.fullPath) };
    }
    public async DeleteObject(key: string): Promise<boolean> {
        return this.Objects.delete(key);
    }
    public Keys(): string[] {
        return [...this.Objects.keys()].sort();
    }
}

interface SessionRow { RecordingFileID: string | null; RecordingMedia: string | null; RecordingStartedAt: Date | null }

/** Fake provider: every GetEntityObject returns a fresh object over one shared in-memory session row. */
class FakeProvider {
    public readonly Row: SessionRow = { RecordingFileID: null, RecordingMedia: null, RecordingStartedAt: null };
    public SessionSaveResult = true;
    public readonly Links: { FileID: string }[] = [];
    public EntityByName(name: string): { ID: string } | undefined {
        return name === 'MJ: AI Agent Sessions' ? { ID: 'ent-sessions' } : undefined;
    }
    public async GetEntityObject(name: string): Promise<unknown> {
        if (name === 'MJ: File Entity Record Links') {
            const links = this.Links;
            const link = { FileID: '', NewRecord() { /* fresh row */ }, async Save() { links.push({ FileID: link.FileID }); return true; } };
            return link;
        }
        const row = this.Row;
        const saveResult = (): boolean => this.SessionSaveResult;
        const session = {
            RecordingFileID: null as string | null, RecordingMedia: null as string | null, RecordingStartedAt: null as Date | null,
            LatestResult: { CompleteMessage: 'save refused' },
            async Load(): Promise<boolean> { session.RecordingFileID = row.RecordingFileID; return true; },
            async Save(): Promise<boolean> {
                if (!saveResult()) return false;
                row.RecordingFileID = session.RecordingFileID;
                row.RecordingMedia = session.RecordingMedia;
                row.RecordingStartedAt = session.RecordingStartedAt;
                return true;
            },
        };
        return session;
    }
}

interface UploadArgs { fileName: string; description?: string; content: Buffer; mimeType: string }

let bucket: FakeBucket;
let provider: FakeProvider;
let uploads: UploadArgs[];

function recoverInput() {
    return {
        SessionID: 'sess-1', StorageAccountID: 'acct-1', StartedAt: new Date('2026-08-16T00:00:00Z'),
        ContextUser: user, Provider: provider as unknown as IMetadataProvider,
    };
}

function seed(keys: Record<string, number>, contentType?: string): void {
    for (const [name, length] of Object.entries(keys)) {
        bucket.Put(`${FOLDER}/${name}`, Buffer.alloc(length, 7), contentType);
    }
}

beforeEach(() => {
    bucket = new FakeBucket();
    provider = new FakeProvider();
    uploads = [];
    getDriverMock.mockReset();
    getDriverMock.mockResolvedValue(bucket);
    uploadFileMock.mockReset();
    uploadFileMock.mockImplementation(async (args: UploadArgs) => {
        uploads.push(args);
        bucket.Put(`${FOLDER}/${args.fileName}`, args.content, args.mimeType);
        return { FileID: 'file-new' };
    });
});

describe('RecoverRealtimeRecordingFromSegments', () => {
    it('assembles shards (silence for the gap), uploads recording-recovered.wav, stamps, deletes only shards', async () => {
        seed({ 'seg-0000.r24000.pcm': 8, 'seg-0002.r24000.pcm': 8 });
        bucket.Put(`${FOLDER}/recording.wav`, Buffer.from('old'));
        bucket.Put(`${FOLDER}/peaks.json`, Buffer.from('[]'));
        bucket.Put('realtime-recordings/sess-12/seg-0000.r24000.pcm', Buffer.from('x'));

        const result = await RecoverRealtimeRecordingFromSegments(recoverInput());

        expect(result).toMatchObject({ Outcome: 'Recovered', FileID: 'file-new', SegmentCount: 2, MissingIndexes: [1], ErrorMessage: null });
        expect(uploads).toHaveLength(1);
        expect(uploads[0].fileName).toBe('recording-recovered.wav');
        expect(uploads[0].mimeType).toBe('audio/wav');
        expect(uploads[0].content.length).toBe(44 + 24);
        expect(uploads[0].content.readUInt32LE(24)).toBe(24000);
        expect(uploads[0].description).toContain('Recovered from 2 crash-recovery segment(s)');
        expect(uploads[0].description).toContain('missing segment(s) 1');
        expect(uploads[0].description).toContain('estimated silence');
        expect(provider.Row.RecordingFileID).toBe('file-new');
        expect(bucket.Keys()).toEqual([
            `${FOLDER}/peaks.json`, `${FOLDER}/recording-recovered.wav`, `${FOLDER}/recording.wav`,
            'realtime-recordings/sess-12/seg-0000.r24000.pcm',
        ]);
    });

    it('reads the rate from storage metadata for legacy shard names', async () => {
        seed({ 'seg-0000.pcm': 4, 'seg-0001.pcm': 4 }, 'Audio/L16; Rate=16000; channels=1');
        const result = await RecoverRealtimeRecordingFromSegments(recoverInput());
        expect(result.Outcome).toBe('Recovered');
        expect(uploads[0].content.readUInt32LE(24)).toBe(16000);
        expect(uploads[0].description).toMatch(/\.$/);
    });

    it('fails and keeps shards when shards disagree on the rate', async () => {
        seed({ 'seg-0000.r24000.pcm': 4, 'seg-0001.r48000.pcm': 4 });
        const result = await RecoverRealtimeRecordingFromSegments(recoverInput());
        expect(result.Outcome).toBe('Failed');
        expect(result.ErrorMessage).toMatch(/rate/i);
        expect(uploads).toHaveLength(0);
        expect(bucket.Keys()).toHaveLength(2);
    });

    it('fails when a legacy shard has no usable rate', async () => {
        seed({ 'seg-0000.pcm': 4 }, 'audio/L16');
        const result = await RecoverRealtimeRecordingFromSegments(recoverInput());
        expect(result.Outcome).toBe('Failed');
        expect(result.ErrorMessage).toContain('seg-0000.pcm');
        expect(uploads).toHaveLength(0);
    });

    it('fails when a shard is not pcm, naming its key', async () => {
        seed({ 'seg-0000.r24000.pcm': 4, 'seg-0001.webm': 4 });
        const result = await RecoverRealtimeRecordingFromSegments(recoverInput());
        expect(result.Outcome).toBe('Failed');
        expect(result.ErrorMessage).toContain('seg-0001.webm');
        expect(bucket.Reads).toHaveLength(0);
    });

    it('fails closed without reading anything when there are MAX_RECOVERY_SEGMENTS shards', async () => {
        for (let i = 0; i < MAX_RECOVERY_SEGMENTS; i++) {
            bucket.Put(`${FOLDER}/seg-${String(i).padStart(4, '0')}.r24000.pcm`, Buffer.alloc(2));
        }
        const result = await RecoverRealtimeRecordingFromSegments(recoverInput());
        expect(result.Outcome).toBe('Failed');
        expect(bucket.Reads).toHaveLength(0);
        expect(uploads).toHaveLength(0);
    });

    it('fails closed when a single shard index is at or above the cap', async () => {
        seed({ 'seg-0240.r24000.pcm': 4 });
        const result = await RecoverRealtimeRecordingFromSegments(recoverInput());
        expect(result.Outcome).toBe('Failed');
        expect(bucket.Reads).toHaveLength(0);
    });

    it('returns NoSegments when the folder has no shards', async () => {
        bucket.Put(`${FOLDER}/recording.wav`, Buffer.from('x'));
        const result = await RecoverRealtimeRecordingFromSegments(recoverInput());
        expect(result).toMatchObject({ Outcome: 'NoSegments', FileID: null, SegmentCount: 0, ErrorMessage: null });
    });

    it('returns Failed (never throws) and keeps shards when a read throws', async () => {
        seed({ 'seg-0000.r24000.pcm': 4, 'seg-0001.r24000.pcm': 4 });
        bucket.FailReadOf = `${FOLDER}/seg-0001.r24000.pcm`;
        const result = await RecoverRealtimeRecordingFromSegments(recoverInput());
        expect(result.Outcome).toBe('Failed');
        expect(result.ErrorMessage).toContain('read exploded');
        expect(bucket.Keys()).toHaveLength(2);
    });

    it('is Superseded when the session got a recording before the stamp; keeps its id and the shards', async () => {
        seed({ 'seg-0000.r24000.pcm': 4 });
        uploadFileMock.mockImplementationOnce(async (args: UploadArgs) => {
            uploads.push({ ...args });
            provider.Row.RecordingFileID = 'file-late';
            return { FileID: 'file-new' };
        });
        const result = await RecoverRealtimeRecordingFromSegments(recoverInput());
        expect(result.Outcome).toBe('Superseded');
        expect(provider.Row.RecordingFileID).toBe('file-late');
        expect(provider.Links).toHaveLength(0);
        expect(bucket.Keys()).toEqual([`${FOLDER}/seg-0000.r24000.pcm`]);
    });

    it('fails and keeps shards when the stamp does not stick', async () => {
        seed({ 'seg-0000.r24000.pcm': 4 });
        provider.SessionSaveResult = false;
        const result = await RecoverRealtimeRecordingFromSegments(recoverInput());
        expect(result.Outcome).toBe('Failed');
        expect(bucket.Keys()).toEqual([`${FOLDER}/recording-recovered.wav`, `${FOLDER}/seg-0000.r24000.pcm`]);
    });
});

describe('rate in the shard key', () => {
    it('names a PCM shard with its rate', async () => {
        await WriteRealtimeRecordingSegment({
            SessionID: 'sess-1', SegmentIndex: 3, Audio: Buffer.from('a'), MimeType: 'audio/L16;rate=48000',
            StorageAccountID: 'acct-1', ContextUser: user,
        });
        expect(bucket.Keys()).toEqual([`${FOLDER}/seg-0003.r48000.pcm`]);
    });

    it('keeps the unkeyed name when the MIME has no rate', async () => {
        await WriteRealtimeRecordingSegment({
            SessionID: 'sess-1', SegmentIndex: 3, Audio: Buffer.from('a'), MimeType: 'audio/L16',
            StorageAccountID: 'acct-1', ContextUser: user,
        });
        expect(bucket.Keys()).toEqual([`${FOLDER}/seg-0003.pcm`]);
    });
});

describe('StoreRealtimeRecording default behaviour', () => {
    it('keeps recording.<ext>, Superseded false, and stamps unconditionally', async () => {
        provider.Row.RecordingFileID = 'file-existing';
        const result = await StoreRealtimeRecording({
            Audio: Buffer.from('audio'), MimeType: 'audio/wav', Media: 'Audio', StartedAt: new Date(),
            StorageAccountID: 'acct-1', SessionID: 'sess-1', ContextUser: user, Provider: provider as unknown as IMetadataProvider,
        });
        expect(result).toEqual({ FileID: 'file-new', ErrorMessage: null, Superseded: false });
        expect(uploads[0].fileName).toBe('recording.wav');
        expect(provider.Row.RecordingFileID).toBe('file-new');
    });
});
