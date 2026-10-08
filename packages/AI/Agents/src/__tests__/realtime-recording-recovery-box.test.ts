/**
 * Recording recovery on Box: the REAL `BoxFileStorage` driver with only its Box SDK client replaced by an
 * in-memory Box API. Box keeps no content type for an upload (the driver sends name and parent only) and
 * a Box File has no `content_type` field, so a legacy `seg-NNNN.pcm` shard reads back as
 * `application/octet-stream` and its rate must be inferred from its size.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Readable } from 'node:stream';

const { getDriverMock, uploadFileMock } = vi.hoisted(() => ({ getDriverMock: vi.fn(), uploadFileMock: vi.fn() }));

vi.mock('@memberjunction/storage', async () => {
    const actual = await vi.importActual<typeof import('@memberjunction/storage')>('@memberjunction/storage');
    return { ...actual, FileStorageEngine: { Instance: { GetDriver: getDriverMock, UploadFile: uploadFileMock } } };
});

import { BoxFileStorage } from '@memberjunction/storage';
import { RecoverRealtimeRecordingFromSegments, WriteRealtimeRecordingSegment } from '../realtime/realtime-recording-store';
import { IMetadataProvider, UserInfo } from '@memberjunction/core';

const SESSION = 'sess-box';
const FOLDER = `realtime-recordings/${SESSION}`;
const user = {} as UserInfo;

interface BoxItem { id: string; type: 'file' | 'folder'; name: string; parentId: string; bytes?: Buffer; created: string }
interface QueryOpts { queryParams?: { fields?: string[]; limit?: number; offset?: number } }

/** Box API semantics the driver depends on: items by id, name-unique per folder, no content_type on files. */
class FakeBoxClient {
    public readonly Items = new Map<string, BoxItem>([['0', { id: '0', type: 'folder', name: 'All Files', parentId: '', created: new Date().toISOString() }]]);
    public readonly UploadCalls: { attributeKeys: string[]; topLevelKeys: string[]; name: string }[] = [];
    private nextId = 100;
    private view(item: BoxItem, fields?: string[]): Record<string, unknown> {
        const full: Record<string, unknown> = {
            id: item.id, type: item.type, name: item.name, size: item.bytes?.length ?? 0, etag: '0', sequence_id: '0',
            created_at: item.created, modified_at: item.created,
        };
        if (!fields) return full;
        const out: Record<string, unknown> = { id: item.id, type: item.type };
        for (const f of fields) if (f in full) out[f] = full[f];   // 'content_type' is not a Box File field: never returned
        return out;
    }
    private notFound(id: string): Error { return new Error(`404 Not Found: item ${id}`); }
    private children(parentId: string): BoxItem[] { return [...this.Items.values()].filter((i) => i.parentId === parentId); }
    private add(type: 'file' | 'folder', name: string, parentId: string, bytes?: Buffer): BoxItem {
        if (this.children(parentId).some((i) => i.name === name)) throw Object.assign(new Error('409 item_name_in_use'), { responseInfo: { statusCode: 409, code: 'item_name_in_use' } });
        const item: BoxItem = { id: String(this.nextId++), type, name, parentId, bytes, created: new Date().toISOString() };
        this.Items.set(item.id, item);
        return item;
    }
    public folders = {
        getFolderItems: async (id: string, opts?: QueryOpts) => {
            const all = this.children(id);
            const offset = opts?.queryParams?.offset ?? 0;
            const limit = opts?.queryParams?.limit ?? 100;
            return { entries: all.slice(offset, offset + limit).map((i) => this.view(i, opts?.queryParams?.fields)), totalCount: all.length };
        },
        getFolderById: async (id: string, opts?: QueryOpts) => {
            const item = this.Items.get(id);
            if (!item || item.type !== 'folder') throw this.notFound(id);
            return this.view(item, opts?.queryParams?.fields);
        },
        createFolder: async (body: { name: string; parent: { id: string } }) => this.view(this.add('folder', body.name, body.parent.id)),
        deleteFolderById: async (id: string) => { this.Items.delete(id); },
    };
    public files = {
        getFileById: async (id: string, opts?: QueryOpts) => {
            const item = this.Items.get(id);
            if (!item || item.type !== 'file') throw this.notFound(id);
            return this.view(item, opts?.queryParams?.fields);
        },
        deleteFileById: async (id: string) => { if (!this.Items.delete(id)) throw this.notFound(id); },
    };
    public uploads = {
        uploadFile: async (body: { attributes: { name: string; parent: { id: string } }; file: Readable }) => {
            this.UploadCalls.push({ attributeKeys: Object.keys(body.attributes), topLevelKeys: Object.keys(body), name: body.attributes.name });
            const chunks: Buffer[] = [];
            for await (const c of body.file) chunks.push(Buffer.from(c as Buffer));
            return { entries: [this.view(this.add('file', body.attributes.name, body.attributes.parent.id, Buffer.concat(chunks)))] };
        },
        uploadFileVersion: async (id: string, body: { file: Readable }) => {
            const item = this.Items.get(id);
            if (!item) throw this.notFound(id);
            const chunks: Buffer[] = [];
            for await (const c of body.file) chunks.push(Buffer.from(c as Buffer));
            item.bytes = Buffer.concat(chunks);
            return { entries: [this.view(item)] };
        },
    };
    public downloads = {
        downloadFile: async (id: string) => {
            const item = this.Items.get(id);
            if (!item?.bytes) throw this.notFound(id);
            return Readable.from([item.bytes]);
        },
    };
    /** Names of the files under a folder path, resolved by name from the root. */
    public FileNames(path: string): string[] {
        let parent = '0';
        for (const seg of path.split('/')) {
            const f = this.children(parent).find((i) => i.type === 'folder' && i.name === seg);
            if (!f) return [];
            parent = f.id;
        }
        return this.children(parent).filter((i) => i.type === 'file').map((i) => i.name).sort();
    }
}

interface SessionRow { RecordingFileID: string | null }
class FakeProvider {
    public readonly Row: SessionRow = { RecordingFileID: null };
    public readonly Links: string[] = [];
    public EntityByName(name: string): { ID: string } | undefined { return name === 'MJ: AI Agent Sessions' ? { ID: 'ent-sessions' } : undefined; }
    public async GetEntityObject(name: string): Promise<unknown> {
        if (name === 'MJ: File Entity Record Links') {
            const links = this.Links;
            const link = { FileID: '', NewRecord() { /* fresh */ }, async Save() { links.push(link.FileID); return true; } };
            return link;
        }
        const row = this.Row;
        const s = {
            RecordingFileID: null as string | null, RecordingMedia: null as string | null, RecordingStartedAt: null as Date | null,
            LatestResult: { CompleteMessage: '' },
            async Load() { s.RecordingFileID = row.RecordingFileID; return true; },
            async Save() { row.RecordingFileID = s.RecordingFileID; return true; },
        };
        return s;
    }
}

let box: FakeBoxClient;
let driver: BoxFileStorage;
let provider: FakeProvider;

/** 15 s of 16 kHz mono PCM16, the size a real 15 s legacy shard has. */
const SHARD_16K = (fill: number): Buffer => Buffer.alloc(16000 * 2 * 15, fill);

beforeEach(() => {
    process.env.STORAGE_BOX_ACCESS_TOKEN = 'fake-dev-token';
    driver = new BoxFileStorage();
    box = new FakeBoxClient();
    (driver as unknown as { _client: FakeBoxClient })._client = box;
    provider = new FakeProvider();
    getDriverMock.mockReset();
    getDriverMock.mockResolvedValue(driver);
    uploadFileMock.mockReset();
    uploadFileMock.mockImplementation(async (args: { fileName: string; content: Buffer; mimeType: string }) => {
        const ok = await driver.PutObject(`${FOLDER}/${args.fileName}`, args.content, args.mimeType);
        return ok ? { FileID: 'file-box-1' } : { FileID: null, ErrorMessage: 'put failed' };
    });
});

function recoverInput() {
    return { SessionID: SESSION, StorageAccountID: 'acct-box', StartedAt: new Date('2026-10-01T00:00:00Z'), ContextUser: user, Provider: provider as unknown as IMetadataProvider };
}

describe('RecoverRealtimeRecordingFromSegments on Box', () => {
    it('recovers legacy shards (seg-NNNN.pcm), whose content type Box does not keep, by inferring the rate from their size', async () => {
        for (const [i, bytes] of [[0, SHARD_16K(1)], [1, SHARD_16K(2)], [2, Buffer.alloc(32_000, 3)]] as const) {
            expect(await driver.PutObject(`${FOLDER}/seg-000${i}.pcm`, bytes, 'audio/L16;rate=16000')).toBe(true);
        }
        expect((await driver.GetObjectMetadata({ fullPath: `${FOLDER}/seg-0000.pcm` })).contentType).toBe('application/octet-stream');

        const result = await RecoverRealtimeRecordingFromSegments(recoverInput());

        expect(result.Outcome).toBe('Recovered');
        const after = box.FileNames(FOLDER);
        expect(after.filter((n) => n.startsWith('seg-'))).toEqual([]);
        const wavName = after.find((n) => n.startsWith('recording-recovered-'));
        expect(wavName).toBeDefined();
        const wav = await driver.GetObject({ fullPath: `${FOLDER}/${wavName}` });
        expect(wav.readUInt32LE(24)).toBe(16000);
        expect(wav.readUInt32LE(40)).toBe(2 * 16000 * 2 * 15 + 32_000);
    });

    it('recovers shards written with the rate in the key', async () => {
        for (const i of [0, 1, 2]) {
            expect(await WriteRealtimeRecordingSegment({ SessionID: SESSION, SegmentIndex: i, Audio: SHARD_16K(i + 1), MimeType: 'audio/L16;rate=16000', StorageAccountID: 'acct-box', ContextUser: user })).toBe(true);
        }
        expect(box.FileNames(FOLDER)).toEqual(['seg-0000.r16000.pcm', 'seg-0001.r16000.pcm', 'seg-0002.r16000.pcm']);

        const result = await RecoverRealtimeRecordingFromSegments(recoverInput());

        expect(result.Outcome).toBe('Recovered');
        expect(provider.Row.RecordingFileID).toBe('file-box-1');
        expect(box.FileNames(FOLDER).filter((n) => n.startsWith('seg-'))).toEqual([]);
    });
});
