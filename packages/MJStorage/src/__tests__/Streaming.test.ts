/**
 * Unit tests for the streaming capability added to FileStorageBase and the
 * streaming-capable drivers. These tests use in-memory mocks only — no network I/O.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Readable } from 'stream';
import {
  FileStorageBase,
  StorageProviderConfig,
  StorageListResult,
  CreatePreAuthUploadUrlPayload,
  StorageObjectMetadata,
  GetObjectParams,
  GetObjectMetadataParams,
  GetObjectStreamParams,
  ObjectStreamResult,
  FileSearchResultSet,
  FileSearchOptions,
  StreamingNotSupportedError,
  BuildHttpRangeHeader,
} from '../generic/FileStorageBase';

/**
 * Minimal concrete driver that does NOT override streaming — used to verify the
 * base-class defaults (SupportsStreaming === false, GetObjectStream throws).
 */
class NonStreamingDriver extends FileStorageBase {
  protected readonly providerName = 'NonStreamingProvider';

  public get IsConfigured(): boolean {
    return true;
  }

  public async CreatePreAuthUploadUrl(objectName: string): Promise<CreatePreAuthUploadUrlPayload> {
    return { UploadUrl: `https://test.url/${objectName}` };
  }
  public async CreatePreAuthDownloadUrl(objectName: string): Promise<string> {
    return `https://test.url/${objectName}`;
  }
  public async MoveObject(): Promise<boolean> {
    return true;
  }
  public async DeleteObject(): Promise<boolean> {
    return true;
  }
  public async ListObjects(): Promise<StorageListResult> {
    return { objects: [], prefixes: [] };
  }
  public async CreateDirectory(): Promise<boolean> {
    return true;
  }
  public async DeleteDirectory(): Promise<boolean> {
    return true;
  }
  public async GetObjectMetadata(_params: GetObjectMetadataParams): Promise<StorageObjectMetadata> {
    return {
      name: 'test.txt',
      path: '/',
      fullPath: '/test.txt',
      size: 0,
      contentType: 'text/plain',
      lastModified: new Date(),
      isDirectory: false,
    };
  }
  public async GetObject(_params: GetObjectParams): Promise<Buffer> {
    return Buffer.from('');
  }
  public async PutObject(): Promise<boolean> {
    return true;
  }
  public async CopyObject(): Promise<boolean> {
    return true;
  }
  public async ObjectExists(): Promise<boolean> {
    return false;
  }
  public async DirectoryExists(): Promise<boolean> {
    return false;
  }
  public async SearchFiles(_query: string, _options?: FileSearchOptions): Promise<FileSearchResultSet> {
    return { results: [], hasMore: false };
  }
}

/**
 * A streaming-capable driver backed entirely by an in-memory buffer. It mimics how a
 * real driver maps a `Range` into provider params and shapes the ObjectStreamResult,
 * without any SDK or network. It records the last params/range it saw so tests can
 * assert pass-through behavior (including the ProviderKey/objectId bypass).
 */
class InMemoryStreamingDriver extends FileStorageBase {
  protected readonly providerName = 'InMemoryStreamingProvider';

  private _data: Buffer;
  public LastParams: GetObjectStreamParams | null = null;
  public LastRangeHeader: string | null = null;
  public LastResolvedByObjectId = false;

  constructor(data: Buffer) {
    super();
    this._data = data;
  }

  public get IsConfigured(): boolean {
    return true;
  }

  public override get SupportsStreaming(): boolean {
    return true;
  }

  public override async GetObjectStream(params: GetObjectStreamParams): Promise<ObjectStreamResult> {
    this.LastParams = params;

    if (!params.objectId && !params.fullPath) {
      throw new Error('Either objectId or fullPath must be provided');
    }

    // Mirror the real drivers' ProviderKey/objectId bypass.
    this.LastResolvedByObjectId = !!params.objectId;

    const total = this._data.length;
    if (params.Range) {
      this.LastRangeHeader = BuildHttpRangeHeader(params.Range);
      const start = params.Range.Start;
      const end = params.Range.End != null ? params.Range.End : total - 1;
      const slice = this._data.subarray(start, end + 1);
      return {
        Stream: Readable.from(slice),
        ContentType: 'application/octet-stream',
        ContentLength: slice.length,
        ContentRange: { Start: start, End: end, Total: total },
      };
    }

    return {
      Stream: Readable.from(this._data),
      ContentType: 'application/octet-stream',
      ContentLength: total,
    };
  }

  // Remaining abstract members (unused by streaming tests).
  public async CreatePreAuthUploadUrl(objectName: string): Promise<CreatePreAuthUploadUrlPayload> {
    return { UploadUrl: `https://test.url/${objectName}` };
  }
  public async CreatePreAuthDownloadUrl(objectName: string): Promise<string> {
    return `https://test.url/${objectName}`;
  }
  public async MoveObject(): Promise<boolean> {
    return true;
  }
  public async DeleteObject(): Promise<boolean> {
    return true;
  }
  public async ListObjects(): Promise<StorageListResult> {
    return { objects: [], prefixes: [] };
  }
  public async CreateDirectory(): Promise<boolean> {
    return true;
  }
  public async DeleteDirectory(): Promise<boolean> {
    return true;
  }
  public async GetObjectMetadata(): Promise<StorageObjectMetadata> {
    return {
      name: 'test.bin',
      path: '/',
      fullPath: '/test.bin',
      size: this._data.length,
      contentType: 'application/octet-stream',
      lastModified: new Date(),
      isDirectory: false,
    };
  }
  public async GetObject(): Promise<Buffer> {
    return this._data;
  }
  public async PutObject(): Promise<boolean> {
    return true;
  }
  public async CopyObject(): Promise<boolean> {
    return true;
  }
  public async ObjectExists(): Promise<boolean> {
    return true;
  }
  public async DirectoryExists(): Promise<boolean> {
    return false;
  }
  public async SearchFiles(): Promise<FileSearchResultSet> {
    return { results: [], hasMore: false };
  }
}

/** Drains a Readable into a Buffer for assertions. */
async function readAll(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : (chunk as Buffer));
  }
  return Buffer.concat(chunks as unknown as Uint8Array[]);
}

describe('BuildHttpRangeHeader', () => {
  it('encodes a closed inclusive range', () => {
    expect(BuildHttpRangeHeader({ Start: 0, End: 1023 })).toBe('bytes=0-1023');
  });

  it('encodes an open-ended range (End omitted = to EOF)', () => {
    expect(BuildHttpRangeHeader({ Start: 500 })).toBe('bytes=500-');
  });
});

describe('FileStorageBase streaming defaults (non-streaming driver)', () => {
  let driver: NonStreamingDriver;

  beforeEach(() => {
    driver = new NonStreamingDriver();
  });

  it('SupportsStreaming defaults to false', () => {
    expect(driver.SupportsStreaming).toBe(false);
  });

  it('GetObjectStream throws StreamingNotSupportedError by default', () => {
    // The base default throws synchronously so an unguarded caller fails fast.
    expect(() => driver.GetObjectStream({ fullPath: 'media/x.mp4' })).toThrow(StreamingNotSupportedError);
  });

  it('StreamingNotSupportedError names the provider', () => {
    try {
      driver.GetObjectStream({ fullPath: 'media/x.mp4' });
      throw new Error('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(StreamingNotSupportedError);
      expect((e as StreamingNotSupportedError).message).toContain('NonStreamingProvider');
      expect((e as StreamingNotSupportedError).name).toBe('StreamingNotSupportedError');
    }
  });
});

describe('FileStorageBase streaming (streaming-capable driver)', () => {
  const payload = Buffer.from('0123456789ABCDEF', 'utf8'); // 16 bytes
  let driver: InMemoryStreamingDriver;

  beforeEach(() => {
    driver = new InMemoryStreamingDriver(payload);
  });

  it('reports SupportsStreaming === true', () => {
    expect(driver.SupportsStreaming).toBe(true);
  });

  it('streams the full object when no Range is supplied', async () => {
    const result = await driver.GetObjectStream({ fullPath: '/test.bin' });

    expect(result.ContentLength).toBe(16);
    expect(result.ContentType).toBe('application/octet-stream');
    expect(result.ContentRange).toBeUndefined();
    const bytes = await readAll(result.Stream);
    expect(bytes.toString('utf8')).toBe('0123456789ABCDEF');
  });

  it('honors a closed inclusive Range and computes ContentRange math', async () => {
    const result = await driver.GetObjectStream({ fullPath: '/test.bin', Range: { Start: 4, End: 9 } });

    // Range header passed through as inclusive bytes
    expect(driver.LastRangeHeader).toBe('bytes=4-9');

    // ContentRange math: inclusive [4,9] of a 16-byte object
    expect(result.ContentRange).toEqual({ Start: 4, End: 9, Total: 16 });
    // 6 bytes returned (9 - 4 + 1)
    expect(result.ContentLength).toBe(6);

    const bytes = await readAll(result.Stream);
    expect(bytes.toString('utf8')).toBe('456789');
  });

  it('honors an open-ended Range (End omitted = to EOF)', async () => {
    const result = await driver.GetObjectStream({ fullPath: '/test.bin', Range: { Start: 10 } });

    expect(driver.LastRangeHeader).toBe('bytes=10-');
    expect(result.ContentRange).toEqual({ Start: 10, End: 15, Total: 16 });
    expect(result.ContentLength).toBe(6);

    const bytes = await readAll(result.Stream);
    expect(bytes.toString('utf8')).toBe('ABCDEF');
  });

  it('honors the objectId (ProviderKey) bypass path', async () => {
    await driver.GetObjectStream({ objectId: 'provider-key-123', Range: { Start: 0, End: 3 } });

    expect(driver.LastResolvedByObjectId).toBe(true);
    expect(driver.LastParams?.objectId).toBe('provider-key-123');
    expect(driver.LastParams?.fullPath).toBeUndefined();
  });

  it('throws when neither objectId nor fullPath is provided', async () => {
    await expect(driver.GetObjectStream({})).rejects.toThrow('Either objectId or fullPath must be provided');
  });
});

describe('AWSFileStorage streaming (mocked S3 client)', () => {
  beforeEach(() => {
    // The AWS driver constructor reads required env vars. Provide dummy values so it can
    // construct; no real AWS calls are made (the S3 client is replaced with a mock below).
    process.env.STORAGE_AWS_REGION = 'us-east-1';
    process.env.STORAGE_AWS_BUCKET_NAME = 'unit-test-bucket';
    process.env.STORAGE_AWS_ACCESS_KEY_ID = 'AKIA_TEST';
    process.env.STORAGE_AWS_SECRET_ACCESS_KEY = 'secret_test';
  });

  it('passes the Range header through and shapes ObjectStreamResult including ContentRange', async () => {
    // Import lazily so the module-level RegisterClass side effects run once.
    const { AWSFileStorage } = await import('../drivers/AWSFileStorage');

    const driver = new AWSFileStorage();
    expect(driver.SupportsStreaming).toBe(true);

    const sliceBytes = Buffer.from('456789', 'utf8');
    const sentCommands: Array<{ Range?: string; Key?: string; Bucket?: string }> = [];

    // Mock the underlying S3 client's send() to capture the command input and return a
    // ranged response with a Node Readable body.
    const mockClient = {
      send: vi.fn(async (command: { input: { Range?: string; Key?: string; Bucket?: string } }) => {
        sentCommands.push(command.input);
        return {
          Body: Readable.from(sliceBytes),
          ContentType: 'application/octet-stream',
          ContentLength: 6,
          ContentRange: 'bytes 4-9/16',
        };
      }),
    };

    // Inject the mock client + bucket via the private fields (test-only access).
    const internal = driver as unknown as { _client: typeof mockClient; _bucket: string };
    internal._client = mockClient;
    internal._bucket = 'unit-test-bucket';

    const result = await driver.GetObjectStream({ objectId: 'media/clip.mp4', Range: { Start: 4, End: 9 } });

    // Range header was passed to the S3 GetObjectCommand
    expect(sentCommands).toHaveLength(1);
    expect(sentCommands[0].Range).toBe('bytes=4-9');
    expect(sentCommands[0].Bucket).toBe('unit-test-bucket');

    // Result shape, including parsed ContentRange math
    expect(result.ContentType).toBe('application/octet-stream');
    expect(result.ContentLength).toBe(6);
    expect(result.ContentRange).toEqual({ Start: 4, End: 9, Total: 16 });

    const bytes = await readAll(result.Stream);
    expect(bytes.toString('utf8')).toBe('456789');
  });
});

describe('GoogleFileStorage streaming (mocked GCS client)', () => {
  beforeEach(() => {
    // The GCS driver constructor reads required env vars. Provide dummy values so it can construct.
    process.env.STORAGE_GOOGLE_KEY_JSON = JSON.stringify({ type: 'service_account', client_email: 'x@y.iam', private_key: 'k' });
    process.env.STORAGE_GOOGLE_BUCKET_NAME = 'unit-test-bucket';
  });

  it('passes start/end to createReadStream and shapes ObjectStreamResult including ContentRange', async () => {
    const { GoogleFileStorage } = await import('../drivers/GoogleFileStorage');

    const driver = new GoogleFileStorage();
    expect(driver.SupportsStreaming).toBe(true);

    const sliceBytes = Buffer.from('456789', 'utf8');
    let lastReadStreamOptions: { start?: number; end?: number } | undefined;
    let lastFileKey: string | undefined;

    // Mock bucket().file(key) → { createReadStream, getMetadata }
    const mockClient = {
      bucket: (_name: string) => ({
        file: (key: string) => {
          lastFileKey = key;
          return {
            createReadStream: (opts?: { start?: number; end?: number }) => {
              lastReadStreamOptions = opts;
              return Readable.from(sliceBytes);
            },
            // GetObjectMetadata path → file.getMetadata() returns [metadata]
            getMetadata: async () => [{ size: '16', contentType: 'application/octet-stream', updated: new Date().toISOString(), etag: 'e' }],
          };
        },
      }),
    };

    const internal = driver as unknown as { _client: typeof mockClient; _bucket: string };
    internal._client = mockClient;
    internal._bucket = 'unit-test-bucket';

    const result = await driver.GetObjectStream({ objectId: 'media/clip.mp4', Range: { Start: 4, End: 9 } });

    // Inclusive range mapped to GCS start/end (which are inclusive)
    expect(lastReadStreamOptions).toEqual({ start: 4, end: 9 });
    expect(lastFileKey).toBe('media/clip.mp4');

    expect(result.ContentType).toBe('application/octet-stream');
    expect(result.ContentLength).toBe(6);
    expect(result.ContentRange).toEqual({ Start: 4, End: 9, Total: 16 });

    const bytes = await readAll(result.Stream);
    expect(bytes.toString('utf8')).toBe('456789');
  });

  it('streams the full object (no Range) with ContentLength = total and no ContentRange', async () => {
    const { GoogleFileStorage } = await import('../drivers/GoogleFileStorage');
    const driver = new GoogleFileStorage();

    const fullBytes = Buffer.from('0123456789ABCDEF', 'utf8'); // 16 bytes
    let lastReadStreamOptions: { start?: number; end?: number } | undefined = { start: -1 };

    const mockClient = {
      bucket: () => ({
        file: () => ({
          createReadStream: (opts?: { start?: number; end?: number }) => {
            lastReadStreamOptions = opts;
            return Readable.from(fullBytes);
          },
          getMetadata: async () => [{ size: '16', contentType: 'application/octet-stream', updated: new Date().toISOString(), etag: 'e' }],
        }),
      }),
    };
    (driver as unknown as { _client: typeof mockClient; _bucket: string })._client = mockClient;
    (driver as unknown as { _bucket: string })._bucket = 'unit-test-bucket';

    const result = await driver.GetObjectStream({ fullPath: 'media/clip.mp4' });

    expect(lastReadStreamOptions).toBeUndefined(); // no Range → no start/end options
    expect(result.ContentLength).toBe(16);
    expect(result.ContentRange).toBeUndefined();
    const bytes = await readAll(result.Stream);
    expect(bytes.toString('utf8')).toBe('0123456789ABCDEF');
  });
});

describe('GoogleDriveFileStorage streaming (mocked Drive client)', () => {
  it('passes the Range header to files.get media and shapes ObjectStreamResult including ContentRange', async () => {
    const { GoogleDriveFileStorage } = await import('../drivers/GoogleDriveFileStorage');

    const driver = new GoogleDriveFileStorage();
    expect(driver.SupportsStreaming).toBe(true);

    const sliceBytes = Buffer.from('456789', 'utf8');
    const getCalls: Array<{ params: { fileId?: string; alt?: string; fields?: string }; opts?: { responseType?: string; headers?: { Range?: string } } }> = [];

    // Mock _drive.files.get — three call shapes:
    //  1. { fileId, fields: 'mimeType' } → mimeType lookup (objectId fast path)
    //  2. { fileId, fields: '...size...' } → GetObjectMetadata
    //  3. { fileId, alt: 'media' } with responseType 'stream' → the ranged media stream
    const mockDrive = {
      files: {
        get: async (
          params: { fileId?: string; alt?: string; fields?: string },
          opts?: { responseType?: string; headers?: { Range?: string } },
        ) => {
          getCalls.push({ params, opts });
          if (params.alt === 'media') {
            return { data: Readable.from(sliceBytes) };
          }
          if (params.fields === 'mimeType') {
            return { data: { mimeType: 'video/mp4' } };
          }
          // GetObjectMetadata fields request
          return {
            data: { id: 'file-123', name: 'clip.mp4', mimeType: 'video/mp4', size: '16', modifiedTime: new Date().toISOString() },
          };
        },
      },
    };

    (driver as unknown as { _drive: typeof mockDrive })._drive = mockDrive;

    const result = await driver.GetObjectStream({ objectId: 'file-123', Range: { Start: 4, End: 9 } });

    // The media call carried the Range header as inclusive bytes
    const mediaCall = getCalls.find((c) => c.params.alt === 'media');
    expect(mediaCall).toBeDefined();
    expect(mediaCall?.opts?.responseType).toBe('stream');
    expect(mediaCall?.opts?.headers?.Range).toBe('bytes=4-9');

    expect(result.ContentType).toBe('video/mp4');
    expect(result.ContentLength).toBe(6);
    expect(result.ContentRange).toEqual({ Start: 4, End: 9, Total: 16 });

    const bytes = await readAll(result.Stream);
    expect(bytes.toString('utf8')).toBe('456789');
  });

  it('throws for Google Workspace files (no Range semantics — must export)', async () => {
    const { GoogleDriveFileStorage } = await import('../drivers/GoogleDriveFileStorage');
    const driver = new GoogleDriveFileStorage();

    const mockDrive = {
      files: {
        get: async (params: { fileId?: string; fields?: string }) => {
          if (params.fields === 'mimeType') {
            return { data: { mimeType: 'application/vnd.google-apps.document' } };
          }
          return { data: {} };
        },
      },
    };
    (driver as unknown as { _drive: typeof mockDrive })._drive = mockDrive;

    await expect(driver.GetObjectStream({ objectId: 'doc-1', Range: { Start: 0, End: 3 } })).rejects.toThrow('Failed to stream object');
  });
});

describe('SharePointFileStorage streaming (mocked Graph client + fetch)', () => {
  it('passes the Range header to the downloadUrl fetch and shapes ObjectStreamResult', async () => {
    const { SharePointFileStorage } = await import('../drivers/SharePointFileStorage');

    const driver = new SharePointFileStorage();
    expect(driver.SupportsStreaming).toBe(true);

    const sliceBytes = Buffer.from('456789', 'utf8');
    let fetchedUrl: string | undefined;
    let fetchedRange: string | undefined;

    // Mock _client.api(path).get() → driveItem with a downloadUrl + size
    const mockClient = {
      api: (_path: string) => ({
        get: async () => ({
          '@microsoft.graph.downloadUrl': 'https://sp.example/download/clip.mp4',
          size: 16,
          name: 'clip.mp4',
          file: { mimeType: 'video/mp4' },
        }),
      }),
    };
    (driver as unknown as { _client: typeof mockClient; _driveId: string })._client = mockClient;
    (driver as unknown as { _driveId: string })._driveId = 'drive-1';

    // Mock global fetch to capture the Range header and return a 206 with a web stream body.
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string, init?: { headers?: { Range?: string } }) => {
      fetchedUrl = url;
      fetchedRange = init?.headers?.Range;
      return {
        ok: true,
        status: 206,
        headers: new Headers({ 'content-type': 'video/mp4', 'content-length': '6', 'content-range': 'bytes 4-9/16' }),
        body: Readable.toWeb(Readable.from(sliceBytes)),
      };
    }) as unknown as typeof fetch;

    try {
      const result = await driver.GetObjectStream({ objectId: 'item-1', Range: { Start: 4, End: 9 } });

      expect(fetchedUrl).toBe('https://sp.example/download/clip.mp4');
      expect(fetchedRange).toBe('bytes=4-9');

      expect(result.ContentType).toBe('video/mp4');
      expect(result.ContentLength).toBe(6);
      expect(result.ContentRange).toEqual({ Start: 4, End: 9, Total: 16 });

      const bytes = await readAll(result.Stream);
      expect(bytes.toString('utf8')).toBe('456789');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('honors the objectId bypass and computes ContentRange from item size when server omits it', async () => {
    const { SharePointFileStorage } = await import('../drivers/SharePointFileStorage');
    const driver = new SharePointFileStorage();

    let apiPath: string | undefined;
    const mockClient = {
      api: (path: string) => {
        apiPath = path;
        return {
          get: async () => ({ '@microsoft.graph.downloadUrl': 'https://sp.example/d', size: 16, name: 'clip.mp4' }),
        };
      },
    };
    (driver as unknown as { _client: typeof mockClient; _driveId: string })._client = mockClient;
    (driver as unknown as { _driveId: string })._driveId = 'drive-1';

    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => ({
      ok: true,
      status: 206,
      headers: new Headers({ 'content-type': 'application/octet-stream' }), // no content-range / content-length
      body: Readable.toWeb(Readable.from(Buffer.from('0123', 'utf8'))),
    })) as unknown as typeof fetch;

    try {
      const result = await driver.GetObjectStream({ objectId: 'item-xyz', Range: { Start: 0, End: 3 } });
      // objectId bypass hits the /items/<id> endpoint directly
      expect(apiPath).toContain('/items/item-xyz');
      // ContentRange computed from item size (16) since the server didn't echo one
      expect(result.ContentRange).toEqual({ Start: 0, End: 3, Total: 16 });
      expect(result.ContentLength).toBe(4);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe('DropboxFileStorage streaming (mocked Dropbox client + fetch)', () => {
  it('passes the Range header to the temporary-link fetch and shapes ObjectStreamResult', async () => {
    const { DropboxFileStorage } = await import('../drivers/DropboxFileStorage');

    const driver = new DropboxFileStorage();
    expect(driver.SupportsStreaming).toBe(true);

    const sliceBytes = Buffer.from('456789', 'utf8');
    let linkPath: string | undefined;
    let fetchedUrl: string | undefined;
    let fetchedRange: string | undefined;

    const mockClient = {
      filesGetTemporaryLink: async (arg: { path: string }) => {
        linkPath = arg.path;
        return { result: { link: 'https://dl.dropboxusercontent.com/clip.mp4', metadata: { size: 16, name: 'clip.mp4' } } };
      },
    };
    (driver as unknown as { _client: typeof mockClient })._client = mockClient;

    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string, init?: { headers?: { Range?: string } }) => {
      fetchedUrl = url;
      fetchedRange = init?.headers?.Range;
      return {
        ok: true,
        status: 206,
        headers: new Headers({ 'content-type': 'video/mp4', 'content-length': '6', 'content-range': 'bytes 4-9/16' }),
        body: Readable.toWeb(Readable.from(sliceBytes)),
      };
    }) as unknown as typeof fetch;

    try {
      // objectId bypass: Dropbox IDs are prefixed with "id:"
      const result = await driver.GetObjectStream({ objectId: 'a4ayc_80', Range: { Start: 4, End: 9 } });

      expect(linkPath).toBe('id:a4ayc_80');
      expect(fetchedUrl).toBe('https://dl.dropboxusercontent.com/clip.mp4');
      expect(fetchedRange).toBe('bytes=4-9');

      expect(result.ContentType).toBe('video/mp4');
      expect(result.ContentLength).toBe(6);
      expect(result.ContentRange).toEqual({ Start: 4, End: 9, Total: 16 });

      const bytes = await readAll(result.Stream);
      expect(bytes.toString('utf8')).toBe('456789');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('throws when neither objectId nor fullPath is provided', async () => {
    const { DropboxFileStorage } = await import('../drivers/DropboxFileStorage');
    const driver = new DropboxFileStorage();
    await expect(driver.GetObjectStream({})).rejects.toThrow('Failed to stream object');
  });
});
