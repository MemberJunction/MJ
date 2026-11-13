import 'reflect-metadata';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IMetadataProvider, RunViewParams, RunViewResult, UserInfo } from '@memberjunction/core';
import { MJArtifactVersionEntity, MJFileEntity } from '@memberjunction/core-entities';

const { resolveFileObject, createDownloadUrl } = vi.hoisted(() => ({
    resolveFileObject: vi.fn(),
    createDownloadUrl: vi.fn(async (key: string) => `https://signed.example/${key}`),
}));

vi.mock('type-graphql', () => {
    const noopDecorator = () => () => undefined;
    return {
        Resolver: noopDecorator,
        Query: noopDecorator,
        Arg: noopDecorator,
        Ctx: noopDecorator,
    };
});

vi.mock('../generic/ResolverBase.js', () => ({
    ResolverBase: class {
        protected GetUserFromPayload(payload?: { userRecord?: UserInfo }): UserInfo | undefined {
            return payload?.userRecord;
        }
    },
}));

vi.mock('@memberjunction/storage', () => ({
    FileStorageEngine: {
        Instance: {
            ResolveFileObject: resolveFileObject,
        },
    },
}));

import {
    ArtifactFileResolver,
    ARTIFACT_FILE_ACCESS_DENIED_MESSAGE,
} from '../resolvers/ArtifactFileResolver.js';
import type { AppContext } from '../types.js';

const ARTIFACT_OWNED = '11111111-1111-4111-8111-111111111111';
const ARTIFACT_COLLECTION_SHARED = '22222222-2222-4222-8222-222222222222';
const ARTIFACT_PRIVATE = '33333333-3333-4333-8333-333333333333';
const VERSION_OWNED = 'aaaa1111-1111-4111-8111-111111111111';
const VERSION_SHARED = 'aaaa2222-2222-4222-8222-222222222222';
const VERSION_PRIVATE = 'aaaa3333-3333-4333-8333-333333333333';
const COLLECTION_TEAM = 'cccc2222-2222-4222-8222-222222222222';
const FILE_ID = 'ffff1111-1111-4111-8111-111111111111';
const OWNER_USER_ID = '00000001-0000-4000-8000-000000000001';
const COLLEAGUE_USER_ID = '00000002-0000-4000-8000-000000000002';
const OUTSIDER_USER_ID = '00000003-0000-4000-8000-000000000003';

function createTestUser(id: string, name: string): UserInfo {
    const u = new UserInfo();
    u.ID = id;
    u.Name = name;
    u.Email = `${name.toLowerCase()}@example.com`;
    return u;
}

interface FakeVersionRow {
    ID: string;
    ArtifactID: string;
    ContentMode: MJArtifactVersionEntity['ContentMode'];
    FileID: string | null;
}

const VERSIONS: Record<string, FakeVersionRow> = {
    [VERSION_OWNED]: {
        ID: VERSION_OWNED,
        ArtifactID: ARTIFACT_OWNED,
        ContentMode: 'File',
        FileID: FILE_ID,
    },
    [VERSION_SHARED]: {
        ID: VERSION_SHARED,
        ArtifactID: ARTIFACT_COLLECTION_SHARED,
        ContentMode: 'File',
        FileID: FILE_ID,
    },
    [VERSION_PRIVATE]: {
        ID: VERSION_PRIVATE,
        ArtifactID: ARTIFACT_PRIVATE,
        ContentMode: 'File',
        FileID: FILE_ID,
    },
};

function createFakeProvider(): {
    provider: IMetadataProvider;
    fileLoadSpy: ReturnType<typeof vi.fn>;
} {
    const fileLoadSpy = vi.fn(async (_id: string) => true);

    const runView = vi.fn(async (params: RunViewParams): Promise<RunViewResult<Record<string, string | boolean | null>>> => {
        const filter = (params.ExtraFilter ?? '').toLowerCase();
        switch (params.EntityName) {
            case 'MJ: Artifacts': {
                if (filter.includes(ARTIFACT_OWNED.toLowerCase())) {
                    return {
                        Success: true,
                        Results: [{ ID: ARTIFACT_OWNED, UserID: OWNER_USER_ID, DelegateEntityID: null, DelegateRecordID: null }],
                        RowCount: 1,
                        TotalRowCount: 1,
                        ExecutionTime: 1,
                        ErrorMessage: '',
                        UserViewRunID: '',
                    };
                }
                if (filter.includes(ARTIFACT_COLLECTION_SHARED.toLowerCase())) {
                    return {
                        Success: true,
                        Results: [{ ID: ARTIFACT_COLLECTION_SHARED, UserID: OWNER_USER_ID, DelegateEntityID: null, DelegateRecordID: null }],
                        RowCount: 1,
                        TotalRowCount: 1,
                        ExecutionTime: 1,
                        ErrorMessage: '',
                        UserViewRunID: '',
                    };
                }
                if (filter.includes(ARTIFACT_PRIVATE.toLowerCase())) {
                    return {
                        Success: true,
                        Results: [{ ID: ARTIFACT_PRIVATE, UserID: OWNER_USER_ID, DelegateEntityID: null, DelegateRecordID: null }],
                        RowCount: 1,
                        TotalRowCount: 1,
                        ExecutionTime: 1,
                        ErrorMessage: '',
                        UserViewRunID: '',
                    };
                }
                return {
                    Success: true,
                    Results: [],
                    RowCount: 0,
                    TotalRowCount: 0,
                    ExecutionTime: 1,
                    ErrorMessage: '',
                    UserViewRunID: '',
                };
            }
            case 'MJ: Artifact Permissions':
                return {
                    Success: true,
                    Results: [],
                    RowCount: 0,
                    TotalRowCount: 0,
                    ExecutionTime: 1,
                    ErrorMessage: '',
                    UserViewRunID: '',
                };
            case 'MJ: Artifact Versions': {
                const matchingVersions = Object.values(VERSIONS)
                    .filter((v) => filter.includes(v.ArtifactID.toLowerCase()))
                    .map((v) => ({ ID: v.ID }));
                return {
                    Success: true,
                    Results: matchingVersions,
                    RowCount: matchingVersions.length,
                    TotalRowCount: matchingVersions.length,
                    ExecutionTime: 1,
                    ErrorMessage: '',
                    UserViewRunID: '',
                };
            }
            case 'MJ: Collection Artifacts': {
                if (
                    filter.includes(VERSION_SHARED.toLowerCase()) ||
                    filter.includes(ARTIFACT_COLLECTION_SHARED.toLowerCase())
                ) {
                    return {
                        Success: true,
                        Results: [{ CollectionID: COLLECTION_TEAM }],
                        RowCount: 1,
                        TotalRowCount: 1,
                        ExecutionTime: 1,
                        ErrorMessage: '',
                        UserViewRunID: '',
                    };
                }
                return {
                    Success: true,
                    Results: [],
                    RowCount: 0,
                    TotalRowCount: 0,
                    ExecutionTime: 1,
                    ErrorMessage: '',
                    UserViewRunID: '',
                };
            }
            case 'MJ: Collection Permissions': {
                if (filter.includes(COLLECTION_TEAM.toLowerCase()) && filter.includes(COLLEAGUE_USER_ID.toLowerCase())) {
                    return {
                        Success: true,
                        Results: [{ CanRead: true, CanEdit: false, CanDelete: false, CanShare: false }],
                        RowCount: 1,
                        TotalRowCount: 1,
                        ExecutionTime: 1,
                        ErrorMessage: '',
                        UserViewRunID: '',
                    };
                }
                return {
                    Success: true,
                    Results: [],
                    RowCount: 0,
                    TotalRowCount: 0,
                    ExecutionTime: 1,
                    ErrorMessage: '',
                    UserViewRunID: '',
                };
            }
            default:
                return {
                    Success: true,
                    Results: [],
                    RowCount: 0,
                    TotalRowCount: 0,
                    ExecutionTime: 1,
                    ErrorMessage: '',
                    UserViewRunID: '',
                };
        }
    });

    const getEntityObject = vi.fn(async (entityName: string) => {
        if (entityName === 'MJ: Artifact Versions') {
            const versionStub: Pick<MJArtifactVersionEntity, 'ID' | 'ArtifactID' | 'ContentMode' | 'FileID'> & {
                Load: (id: string) => Promise<boolean>;
            } = {
                ID: '',
                ArtifactID: '',
                ContentMode: 'Text',
                FileID: null,
                Load: async (id: string): Promise<boolean> => {
                    const found = VERSIONS[id];
                    if (!found) {
                        return false;
                    }
                    versionStub.ID = found.ID;
                    versionStub.ArtifactID = found.ArtifactID;
                    versionStub.ContentMode = found.ContentMode;
                    versionStub.FileID = found.FileID;
                    return true;
                },
            };
            return versionStub;
        }
        const fileStub: Pick<MJFileEntity, 'ID' | 'Name' | 'ProviderID' | 'ProviderKey'> & {
            Load: (id: string) => Promise<boolean>;
        } = {
            ID: FILE_ID,
            Name: 'report.pdf',
            ProviderID: 'prov-1',
            ProviderKey: 'artifacts/2026-11-09/report.pdf',
            Load: fileLoadSpy,
        };
        return fileStub;
    });

    const providerStub: Partial<IMetadataProvider> & {
        RunView: typeof runView;
        GetEntityObject: typeof getEntityObject;
    } = {
        Entities: [],
        RunView: runView,
        GetEntityObject: getEntityObject,
    };

    return {
        provider: providerStub as IMetadataProvider,
        fileLoadSpy,
    };
}

function createContext(provider: IMetadataProvider, user?: UserInfo): AppContext {
    const partial: Partial<AppContext> = {
        providers: [{ provider: provider as AppContext['providers'][number]['provider'], type: 'Read-Write' }],
        userPayload: {
            email: user?.Email ?? '',
            sessionId: 'sess-1',
            userRecord: user,
        },
    };
    return partial as AppContext;
}

describe('ArtifactFileResolver — enforces both ArtifactPermissionEngine and FileStorageEngine gates', () => {
    const resolver = new ArtifactFileResolver();
    const owner = createTestUser(OWNER_USER_ID, 'Owner');
    const colleague = createTestUser(COLLEAGUE_USER_ID, 'Colleague');
    const outsider = createTestUser(OUTSIDER_USER_ID, 'Outsider');

    beforeEach(() => {
        vi.clearAllMocks();
        resolveFileObject.mockResolvedValue({
            Account: { ID: 'acct-1' },
            Driver: { CreatePreAuthDownloadUrl: createDownloadUrl },
            ObjectKey: 'artifacts/2026-11-09/report.pdf',
        });
    });

    it('refuses unauthenticated requests before touching any entity', async () => {
        const { provider, fileLoadSpy } = createFakeProvider();
        await expect(resolver.ArtifactFileDownloadUrl(VERSION_OWNED, createContext(provider))).rejects.toThrow('Unauthorized');
        expect(fileLoadSpy).not.toHaveBeenCalled();
        expect(resolveFileObject).not.toHaveBeenCalled();
    });

    it('refuses a caller without CanRead on the artifact before loading MJ: Files or calling ResolveFileObject', async () => {
        const { provider, fileLoadSpy } = createFakeProvider();
        await expect(
            resolver.ArtifactFileDownloadUrl(VERSION_PRIVATE, createContext(provider, outsider)),
        ).rejects.toThrow(ARTIFACT_FILE_ACCESS_DENIED_MESSAGE);
        expect(fileLoadSpy).not.toHaveBeenCalled();
        expect(resolveFileObject).not.toHaveBeenCalled();
        expect(createDownloadUrl).not.toHaveBeenCalled();
    });

    it('allows the artifact owner and passes through FileStorageEngine.ResolveFileObject', async () => {
        const { provider } = createFakeProvider();
        const url = await resolver.ArtifactFileDownloadUrl(VERSION_OWNED, createContext(provider, owner));
        expect(url).toBe('https://signed.example/artifacts/2026-11-09/report.pdf');
        expect(resolveFileObject).toHaveBeenCalledTimes(1);
    });

    it('allows a user granted CanRead via Collection Permissions and passes through FileStorageEngine.ResolveFileObject', async () => {
        const { provider } = createFakeProvider();
        const url = await resolver.ArtifactFileDownloadUrl(VERSION_SHARED, createContext(provider, colleague));
        expect(url).toBe('https://signed.example/artifacts/2026-11-09/report.pdf');
        expect(resolveFileObject).toHaveBeenCalledTimes(1);
    });

    it('still propagates storage-gate refusals even when the caller has CanRead on the artifact', async () => {
        const { provider } = createFakeProvider();
        resolveFileObject.mockRejectedValueOnce(new Error('You do not have access to this storage account or it does not exist.'));
        await expect(
            resolver.ArtifactFileDownloadUrl(VERSION_OWNED, createContext(provider, owner)),
        ).rejects.toThrow('You do not have access to this storage account or it does not exist.');
        expect(createDownloadUrl).not.toHaveBeenCalled();
    });
});
