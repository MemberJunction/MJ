import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DatabaseProviderBase, type UserInfo } from '@memberjunction/core';
import { RunActionParams, ActionParam } from '@memberjunction/actions-base';
import {
    ListAzureBackupBlobsAction,
    ParseAzureListBlobsXml
} from '../ListAzureBackupBlobsAction.js';

let mockCredentialConfigFn: ReturnType<typeof vi.fn>;
let mockGetCredentialByIdFn: ReturnType<typeof vi.fn>;
let mockGetCredentialFn: ReturnType<typeof vi.fn>;

vi.mock('@memberjunction/credentials', () => {
    const instance = {
        Config: (...args: unknown[]) => mockCredentialConfigFn(...args),
        getCredentialById: (...args: unknown[]) => mockGetCredentialByIdFn(...args),
        GetCredential: (...args: unknown[]) => mockGetCredentialFn(...args),
    };
    return {
        CredentialEngine: {
            Instance: instance,
        },
    };
});

let mockRunViewFn: ReturnType<typeof vi.fn>;

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        LogError: vi.fn(),
        LogStatus: vi.fn(),
        RunView: class {
            public static FromMetadataProvider() {
                return new this();
            }
            public RunView(...args: unknown[]) {
                return mockRunViewFn(...args);
            }
        },
    };
});

function makeUser(id = 'user-1'): UserInfo {
    return { ID: id, Name: 'Test Admin', Email: 'admin@example.com' } as unknown as UserInfo;
}

function makeParams(inputs: Record<string, string | number | boolean>): RunActionParams {
    const params = new RunActionParams();
    params.ContextUser = makeUser();
    params.Params = Object.entries(inputs).map(([Name, Value]) => {
        const p = new ActionParam();
        p.Name = Name;
        p.Type = 'Input';
        p.Value = Value;
        return p;
    });
    params.Filters = [];
    return params;
}

const SAMPLE_AZURE_XML = `<?xml version="1.0" encoding="utf-8"?>
<EnumerationResults ServiceEndpoint="https://myaccount.blob.core.windows.net/" ContainerName="sql-backups">
  <Blobs>
    <Blob>
      <Name>AdventureWorks_stripe1.bak</Name>
      <Properties>
        <Last-Modified>Mon, 26 Oct 2026 12:00:00 GMT</Last-Modified>
        <Content-Length>524288000</Content-Length>
      </Properties>
    </Blob>
    <Blob>
      <Name>AdventureWorks_stripe2.bak</Name>
      <Properties>
        <Last-Modified>Mon, 26 Oct 2026 12:05:00 GMT</Last-Modified>
        <Content-Length>524288000</Content-Length>
      </Properties>
    </Blob>
  </Blobs>
  <NextMarker />
</EnumerationResults>`;

const SAMPLE_PAGINATED_XML_PAGE1 = `<?xml version="1.0" encoding="utf-8"?>
<EnumerationResults ServiceEndpoint="https://myaccount.blob.core.windows.net/" ContainerName="sql-backups">
  <Blobs>
    <Blob>
      <Name>stripe_part1.bak</Name>
      <Properties>
        <Last-Modified>Mon, 26 Oct 2026 12:00:00 GMT</Last-Modified>
        <Content-Length>1000</Content-Length>
      </Properties>
    </Blob>
  </Blobs>
  <NextMarker>page2-token</NextMarker>
</EnumerationResults>`;

const SAMPLE_PAGINATED_XML_PAGE2 = `<?xml version="1.0" encoding="utf-8"?>
<EnumerationResults ServiceEndpoint="https://myaccount.blob.core.windows.net/" ContainerName="sql-backups">
  <Blobs>
    <Blob>
      <Name>stripe_part2.bak</Name>
      <Properties>
        <Last-Modified>Mon, 26 Oct 2026 12:05:00 GMT</Last-Modified>
        <Content-Length>2000</Content-Length>
      </Properties>
    </Blob>
  </Blobs>
  <NextMarker />
</EnumerationResults>`;

describe('ListAzureBackupBlobsAction', () => {
    let action: ListAzureBackupBlobsAction;

    beforeEach(() => {
        action = new ListAzureBackupBlobsAction();
        action.CustomDatabaseProvider = Object.create(DatabaseProviderBase.prototype) as DatabaseProviderBase;
        mockRunViewFn = vi.fn().mockImplementation((p: { ExtraFilter: string }) =>
            Promise.resolve({ Success: true, Results: p.ExtraFilter.includes('cred-readable') ? [{ ID: 'cred-readable' }] : [] }));
        mockCredentialConfigFn = vi.fn().mockResolvedValue(undefined);
        mockGetCredentialByIdFn = vi.fn();
        mockGetCredentialFn = vi.fn();
    });

    describe('XML Parsing (ParseAzureListBlobsXml)', () => {
        it('parses Azure List Blobs XML into structured blob array', () => {
            const containerUrl = 'https://myaccount.blob.core.windows.net/sql-backups';
            const { blobs, nextMarker } = ParseAzureListBlobsXml(SAMPLE_AZURE_XML, containerUrl);

            expect(blobs).toHaveLength(2);
            expect(blobs[0]).toEqual({
                Name: 'AdventureWorks_stripe1.bak',
                Url: 'https://myaccount.blob.core.windows.net/sql-backups/AdventureWorks_stripe1.bak',
                SizeBytes: 524288000,
                LastModified: '2026-10-26T12:00:00.000Z',
            });
            expect(blobs[1].Name).toBe('AdventureWorks_stripe2.bak');
            expect(nextMarker).toBeUndefined();
        });

        it('extracts NextMarker when pagination is present', () => {
            const containerUrl = 'https://myaccount.blob.core.windows.net/sql-backups';
            const { blobs, nextMarker } = ParseAzureListBlobsXml(SAMPLE_PAGINATED_XML_PAGE1, containerUrl);

            expect(blobs).toHaveLength(1);
            expect(nextMarker).toBe('page2-token');
        });
    });

    describe('Parameter Validation', () => {
        it('returns MISSING_PARAMETER when ContainerUrl is absent', async () => {
            const params = makeParams({});
            const result = await action['InternalRunAction'](params);

            expect(result.Success).toBe(false);
            expect(result.ResultCode).toBe('MISSING_PARAMETER');
            expect(result.Message).toContain('ContainerUrl');
        });

        it('returns INVALID_PARAMETER when ContainerUrl is not a URL', async () => {
            const params = makeParams({ ContainerUrl: 'not-a-valid-url' });
            const result = await action['InternalRunAction'](params);

            expect(result.Success).toBe(false);
            expect(result.ResultCode).toBe('INVALID_PARAMETER');
        });
    });

    describe('Azure Storage API Fetch & Pagination', () => {
        it('calls fetch with correct URL, SAS token, and parses blobs successfully', async () => {
            const fetchMock = vi.fn().mockResolvedValue({
                ok: true,
                text: async () => SAMPLE_AZURE_XML,
            });
            vi.stubGlobal('fetch', fetchMock);

            const params = makeParams({
                ContainerUrl: 'https://myaccount.blob.core.windows.net/sql-backups',
                SasToken: '?sp=rl&sig=secretKey123',
                Prefix: 'AdventureWorks',
            });

            const result = await action['InternalRunAction'](params);

            expect(result.Success).toBe(true);
            expect(result.ResultCode).toBe('SUCCESS');
            expect(fetchMock).toHaveBeenCalledTimes(1);

            const calledUrl = fetchMock.mock.calls[0][0] as string;
            expect(calledUrl).toContain('restype=container&comp=list');
            expect(calledUrl).toContain('prefix=AdventureWorks');
            expect(calledUrl).toContain('sp=rl&sig=secretKey123');

            const blobsParam = result.Params?.find(p => p.Name === 'Blobs');
            expect(blobsParam).toBeDefined();
            const parsedBlobs = JSON.parse(String(blobsParam?.Value));
            expect(parsedBlobs).toHaveLength(2);
            expect(parsedBlobs[0].Name).toBe('AdventureWorks_stripe1.bak');

            vi.unstubAllGlobals();
        });

        it('fails with the credential error, not an Azure error, when a supplied StorageCredentialID cannot be resolved', async () => {
            const fetchMock = vi.fn();
            vi.stubGlobal('fetch', fetchMock);
            mockCredentialConfigFn.mockResolvedValue(undefined);
            mockGetCredentialByIdFn.mockReturnValue(undefined);

            const params = makeParams({
                ContainerUrl: 'https://myaccount.blob.core.windows.net/sql-backups',
                StorageCredentialID: 'cred-does-not-exist',
            });

            const result = await action['InternalRunAction'](params);

            expect(result.Success).toBe(false);
            expect(result.ResultCode).toBe('LIST_BLOBS_FAILED');
            expect(result.Message).toContain("Credential with ID 'cred-does-not-exist' was not found");
            expect(fetchMock).not.toHaveBeenCalled();

            vi.unstubAllGlobals();
        });

        it('lists anonymously when no token or credential was supplied at all', async () => {
            const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => SAMPLE_AZURE_XML });
            vi.stubGlobal('fetch', fetchMock);

            const params = makeParams({ ContainerUrl: 'https://myaccount.blob.core.windows.net/sql-backups' });

            const result = await action['InternalRunAction'](params);

            expect(result.Success).toBe(true);
            const calledUrl = fetchMock.mock.calls[0][0] as string;
            expect(calledUrl).toBe('https://myaccount.blob.core.windows.net/sql-backups?restype=container&comp=list');

            vi.unstubAllGlobals();
        });

        it('follows NextMarker pagination to aggregate all pages', async () => {
            const fetchMock = vi.fn()
                .mockResolvedValueOnce({
                    ok: true,
                    text: async () => SAMPLE_PAGINATED_XML_PAGE1,
                })
                .mockResolvedValueOnce({
                    ok: true,
                    text: async () => SAMPLE_PAGINATED_XML_PAGE2,
                });
            vi.stubGlobal('fetch', fetchMock);

            const params = makeParams({
                ContainerUrl: 'https://myaccount.blob.core.windows.net/sql-backups',
            });

            const result = await action['InternalRunAction'](params);

            expect(result.Success).toBe(true);
            expect(fetchMock).toHaveBeenCalledTimes(2);

            const secondCallUrl = fetchMock.mock.calls[1][0] as string;
            expect(secondCallUrl).toContain('marker=page2-token');

            const blobCountParam = result.Params?.find(p => p.Name === 'BlobCount');
            expect(blobCountParam?.Value).toBe(2);

            vi.unstubAllGlobals();
        });

        it('returns LIST_BLOBS_FAILED on HTTP error response', async () => {
            const fetchMock = vi.fn().mockResolvedValue({
                ok: false,
                status: 403,
                statusText: 'Server failed to authenticate the request',
                text: async () => '<Error><Code>AuthenticationFailed</Code></Error>',
            });
            vi.stubGlobal('fetch', fetchMock);

            const params = makeParams({
                ContainerUrl: 'https://myaccount.blob.core.windows.net/sql-backups',
            });

            const result = await action['InternalRunAction'](params);

            expect(result.Success).toBe(false);
            expect(result.ResultCode).toBe('LIST_BLOBS_FAILED');
            expect(result.Message).toContain('403');
            // The upstream body is never reflected to the caller.
            expect(result.Message).not.toContain('AuthenticationFailed');

            vi.unstubAllGlobals();
        });
    });

    describe('Direct-call guards', () => {
        it.each([
            ['an attacker host', 'https://attacker.example/c'],
            ['an internal address', 'http://10.0.0.5:8080/admin'],
            ['a metadata endpoint', 'http://169.254.169.254/latest'],
            ['a lookalike host', 'https://acct.blob.core.windows.net.attacker.example/c'],
            ['a blob rather than a container', 'https://myaccount.blob.core.windows.net/sql-backups/x.bak'],
        ])('refuses %s with INVALID_PARAMETER and never fetches it', async (_label, containerUrl) => {
            const fetchMock = vi.fn();
            vi.stubGlobal('fetch', fetchMock);

            const result = await action['InternalRunAction'](makeParams({ ContainerUrl: containerUrl, SasToken: 'sig=x' }));

            expect(result.ResultCode).toBe('INVALID_PARAMETER');
            expect(fetchMock).not.toHaveBeenCalled();
            expect(mockGetCredentialFn).not.toHaveBeenCalled();
            vi.unstubAllGlobals();
        });

        it('accepts a container URL with a trailing slash', async () => {
            const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => SAMPLE_AZURE_XML });
            vi.stubGlobal('fetch', fetchMock);

            const result = await action['InternalRunAction'](makeParams({ ContainerUrl: 'https://myaccount.blob.core.windows.net/sql-backups/' }));

            expect(result.Success).toBe(true);
            vi.unstubAllGlobals();
        });

        it('refuses a StorageCredentialID the caller cannot read and never decrypts it', async () => {
            const fetchMock = vi.fn();
            vi.stubGlobal('fetch', fetchMock);
            mockGetCredentialByIdFn.mockReturnValue({ ID: 'cred-hidden', Name: 'Vendor API Key' });
            mockGetCredentialFn.mockResolvedValue({ values: { Secret: 'top-secret' } });

            const result = await action['InternalRunAction'](makeParams({
                ContainerUrl: 'https://myaccount.blob.core.windows.net/sql-backups',
                StorageCredentialID: 'cred-hidden',
            }));

            expect(result.Success).toBe(false);
            expect(mockGetCredentialFn).not.toHaveBeenCalled();
            expect(fetchMock).not.toHaveBeenCalled();
            vi.unstubAllGlobals();
        });

        it('uses a StorageCredentialID the caller can read', async () => {
            const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => SAMPLE_AZURE_XML });
            vi.stubGlobal('fetch', fetchMock);
            mockGetCredentialByIdFn.mockReturnValue({ ID: 'cred-readable', Name: 'Backup SAS' });
            mockGetCredentialFn.mockResolvedValue({ values: { SasToken: 'sp=r&sig=ok' } });

            const result = await action['InternalRunAction'](makeParams({
                ContainerUrl: 'https://myaccount.blob.core.windows.net/sql-backups',
                StorageCredentialID: 'cred-readable',
            }));

            expect(result.Success).toBe(true);
            expect(fetchMock.mock.calls[0][0]).toContain('sp=r&sig=ok');
            const check = mockRunViewFn.mock.calls[0];
            expect(check[0]).toMatchObject({ EntityName: 'MJ: Credentials', ResultType: 'simple', Fields: ['ID'], ExtraFilter: "ID='cred-readable'" });
            expect((check[1] as UserInfo).ID).toBe('user-1');
            vi.unstubAllGlobals();
        });
    });
});
