/**
 * Unit tests for storage routing of agent-produced MEDIA artifacts.
 *
 * WHY THIS EXISTS: media went inline no matter how storage was configured, while file outputs
 * beside them honoured the configured account. Both paths now share one storage-or-inline helper,
 * and the invariants pinned here are the ones that helper must keep: storage is used when it is
 * configured, and delivery NEVER fails because storage is unavailable — an unconfigured or failing
 * account degrades to inline.
 *
 * No DB, no network — FileStorageEngine is module-mocked and the uploader is stubbed.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { UserInfo, IMetadataProvider } from '@memberjunction/core';
import type { MediaOutput } from '@memberjunction/ai-core-plus';

let hasStorageAccounts = false;
let storageEngineConfigured = false;
let storageConfigShouldReject = false;

vi.mock('@memberjunction/storage', () => ({
    FileStorageEngine: {
        Instance: {
            get HasStorageAccounts() {
                return hasStorageAccounts;
            },
            Config: async () => {
                if (storageConfigShouldReject) {
                    throw new Error('RunViews connection timeout');
                }
                storageEngineConfigured = true;
            },
        },
    },
}));

vi.mock('@memberjunction/aiengine', () => ({
    AIEngine: {
        Instance: {
            GetModalityByName: (name: string) => ({ ID: `modality-${name.toLowerCase()}` }),
        },
    },
}));

import { AgentRunner } from '../AgentRunner';

type StorageProbe = {
    uploadToStorageIfConfigured(
        base64Data: string,
        fileName: string,
        mimeType: string,
        contextUser: UserInfo,
        resolvedStorageAccountId: string | undefined,
        provider: IMetadataProvider,
        logPrefix: string
    ): Promise<string | undefined>;
    uploadBase64ToStorage: (...args: unknown[]) => Promise<string>;
};

interface MockMediaEntity {
    ID: string;
    AgentRunID?: string;
    SourcePromptRunMediaID?: string;
    ModalityID?: string;
    MimeType?: string;
    FileID?: string;
    FileName?: string;
    FileSizeBytes?: number;
    InlineData?: string;
    Width?: number;
    Height?: number;
    DurationSeconds?: number;
    Label?: string;
    Metadata?: string;
    Description?: string;
    DisplayOrder?: number;
    Save: () => Promise<boolean>;
}

describe('AgentRunner — media artifact storage routing', () => {
    let runner: StorageProbe;
    let uploadCalls: unknown[][];

    const invoke = (accountId?: string) =>
        runner.uploadToStorageIfConfigured(
            'QUJD',
            'generated_image_1.png',
            'image/png',
            {} as UserInfo,
            accountId,
            {} as IMetadataProvider,
            'CreateMediaArtifacts'
        );

    beforeEach(() => {
        uploadCalls = [];
        hasStorageAccounts = false;
        storageEngineConfigured = false;
        storageConfigShouldReject = false;
        runner = Object.create(AgentRunner.prototype) as StorageProbe;
        runner.uploadBase64ToStorage = async (...args: unknown[]) => {
            uploadCalls.push(args);
            return 'file-id-1';
        };
    });

    it('stores inline when no storage account is configured', async () => {
        expect(await invoke()).toBeUndefined();
        expect(uploadCalls).toHaveLength(0);
    });

    // The regression: this returned undefined even with storage configured, so every generated
    // image landed as multi-MB base64 in a SQL column.
    it('uploads to storage when an account IS configured', async () => {
        hasStorageAccounts = true;
        expect(await invoke()).toBe('file-id-1');
        expect(uploadCalls).toHaveLength(1);
    });

    it('passes the resolved storage account through to the uploader', async () => {
        hasStorageAccounts = true;
        await invoke('account-xyz');
        expect(uploadCalls[0][4]).toBe('account-xyz');
    });

    // Media delivery must not fail because storage is unavailable — same contract as
    // processFileOutput, which catches the upload error and writes the bytes inline.
    it('falls back to inline when the upload throws, without propagating', async () => {
        hasStorageAccounts = true;
        runner.uploadBase64ToStorage = async () => {
            throw new Error('AuthorizationFailure');
        };
        await expect(invoke()).resolves.toBeUndefined();
    });

    // Regression: the first version of this fix read HasStorageAccounts without configuring the
    // engine. FileStorageEngine reports zero accounts until it loads, so a correctly configured
    // deployment logged "no storage accounts configured" and routed every image inline —
    // indistinguishable from having no storage at all. The mocks above hid it, because they
    // answer HasStorageAccounts whether or not Config ever ran.
    it('configures FileStorageEngine before reading HasStorageAccounts', async () => {
        const probe = runner as unknown as {
            CreateMediaArtifacts(id: string, media: unknown[], user: UserInfo, provider?: unknown, accountId?: string): Promise<void>;
            createArtifactWithVersion: (...a: unknown[]) => Promise<void>;
            getMimeTypeExtension: (m: string) => string;
        };
        probe.createArtifactWithVersion = async () => undefined;
        probe.getMimeTypeExtension = () => 'png';

        await probe.CreateMediaArtifacts(
            'detail-1',
            [{ modality: 'Image', mimeType: 'image/png', data: 'QUJD', label: 'img' }],
            {} as UserInfo
        );

        expect(storageEngineConfigured).toBe(true);
    });

    // The File branch delegates to createFileArtifact, whose default label is 'file'. Media must keep
    // its own label so a failed media artifact still reads "Cannot create artifact for media Image …",
    // not "for file …" — the diagnostics were that specific before the storage branch existed.
    it('keeps the media label through the File branch, so diagnostics stay specific', async () => {
        hasStorageAccounts = true;
        const captured: Array<{ label?: string; setVersionFields?: (v: Record<string, unknown>) => void }> = [];
        const probe = runner as unknown as {
            CreateMediaArtifacts(id: string, media: unknown[], user: UserInfo, provider?: unknown, accountId?: string): Promise<void>;
            createArtifactWithVersion: (opts: { label?: string; setVersionFields?: (v: Record<string, unknown>) => void }) => Promise<void>;
            getMimeTypeExtension: (m: string) => string;
        };
        probe.createArtifactWithVersion = async (opts) => { captured.push(opts); };
        probe.getMimeTypeExtension = () => 'png';
        await probe.CreateMediaArtifacts(
            'detail-1',
            [{ modality: 'Image', mimeType: 'image/png', data: 'QUJD', label: 'img' }],
            {} as UserInfo
        );
        expect(uploadCalls).toHaveLength(1); // it took the File branch
        expect(captured).toHaveLength(1);
        expect(captured[0].label).toBe('media Image');
        const version: Record<string, unknown> = {};
        captured[0].setVersionFields?.(version);
        expect(version.ContentMode).toBe('File');
        expect(version.FileID).toBe('file-id-1');
    });

    describe('SaveAgentRunMedia storage routing and CreateMediaArtifacts fileId reuse', () => {
        let savedEntities: MockMediaEntity[];
        let mockProvider: IMetadataProvider;
        let probe: {
            SaveAgentRunMedia(
                agentRunId: string,
                mediaOutputs: MediaOutput[] | undefined,
                contextUser: UserInfo,
                provider?: IMetadataProvider,
                resolvedStorageAccountId?: string
            ): Promise<string[]>;
            CreateMediaArtifacts(
                conversationDetailId: string,
                mediaOutputs: MediaOutput[],
                contextUser: UserInfo,
                provider?: IMetadataProvider,
                resolvedStorageAccountId?: string
            ): Promise<void>;
            createArtifactWithVersion: (opts: { label?: string; setVersionFields?: (v: Record<string, unknown>) => void }) => Promise<void>;
            getMimeTypeExtension: (m: string) => string;
        };

        beforeEach(() => {
            savedEntities = [];
            mockProvider = {
                GetEntityObject: async () => {
                    const entity: MockMediaEntity = {
                        ID: `run-media-${savedEntities.length + 1}`,
                        Save: async () => {
                            savedEntities.push(entity);
                            return true;
                        },
                    };
                    return entity;
                },
            } as unknown as IMetadataProvider;

            probe = runner as unknown as typeof probe;
            probe.getMimeTypeExtension = () => 'png';
        });

        it('when storage is configured: sets FileID, FileName, FileSizeBytes, leaves InlineData empty, and shares one upload with CreateMediaArtifacts', async () => {
            hasStorageAccounts = true;
            const capturedArtifacts: Array<{ label?: string; setVersionFields?: (v: Record<string, unknown>) => void }> = [];
            probe.createArtifactWithVersion = async (opts) => {
                capturedArtifacts.push(opts);
            };

            const mediaOutputs: MediaOutput[] = [
                { modality: 'Image', mimeType: 'image/png', data: 'QUJD', label: 'hero.png' },
            ];

            const savedIds = await probe.SaveAgentRunMedia(
                'run-1',
                mediaOutputs,
                {} as UserInfo,
                mockProvider,
                'storage-acct-1'
            );

            expect(storageEngineConfigured).toBe(true);
            expect(savedIds).toEqual(['run-media-1']);
            expect(savedEntities).toHaveLength(1);
            expect(savedEntities[0].FileID).toBe('file-id-1');
            expect(savedEntities[0].FileName).toBe('hero.png');
            expect(savedEntities[0].FileSizeBytes).toBe(3);
            expect(savedEntities[0].InlineData).toBeUndefined();
            expect(mediaOutputs[0].fileId).toBe('file-id-1');
            // data remains in memory so isMediaEmbeddedInPayload still works
            expect(mediaOutputs[0].data).toBe('QUJD');
            expect(uploadCalls).toHaveLength(1);
            expect(uploadCalls[0][4]).toBe('storage-acct-1');

            // CreateMediaArtifacts reuses mediaOutputs[0].fileId without a second upload
            await probe.CreateMediaArtifacts(
                'detail-1',
                mediaOutputs,
                {} as UserInfo,
                mockProvider,
                'storage-acct-1'
            );

            expect(uploadCalls).toHaveLength(1);
            expect(capturedArtifacts).toHaveLength(1);
            const version: Record<string, unknown> = {};
            capturedArtifacts[0].setVersionFields?.(version);
            expect(version.ContentMode).toBe('File');
            expect(version.FileID).toBe('file-id-1');
        });

        it('when no storage is configured: sets InlineData, leaves FileID unset, and performs no upload', async () => {
            hasStorageAccounts = false;
            const mediaOutputs: MediaOutput[] = [
                { modality: 'Image', mimeType: 'image/png', data: 'QUJD', label: 'hero.png' },
            ];

            const savedIds = await probe.SaveAgentRunMedia(
                'run-1',
                mediaOutputs,
                {} as UserInfo,
                mockProvider
            );

            expect(savedIds).toEqual(['run-media-1']);
            expect(uploadCalls).toHaveLength(0);
            expect(savedEntities[0].InlineData).toBe('QUJD');
            expect(savedEntities[0].FileID).toBeUndefined();
            expect(mediaOutputs[0].fileId).toBeUndefined();
        });

        it('when upload throws: falls back to InlineData without throwing', async () => {
            hasStorageAccounts = true;
            runner.uploadBase64ToStorage = async () => {
                throw new Error('StorageUnavailable');
            };
            const mediaOutputs: MediaOutput[] = [
                { modality: 'Image', mimeType: 'image/png', data: 'QUJD', label: 'hero.png' },
            ];

            await expect(
                probe.SaveAgentRunMedia('run-1', mediaOutputs, {} as UserInfo, mockProvider, 'storage-acct-1')
            ).resolves.toEqual(['run-media-1']);

            expect(savedEntities[0].InlineData).toBe('QUJD');
            expect(savedEntities[0].FileID).toBeUndefined();
            expect(mediaOutputs[0].fileId).toBeUndefined();
        });

        it('when FileStorageEngine.Instance.Config rejects: saves every media row inline without throwing', async () => {
            storageConfigShouldReject = true;
            hasStorageAccounts = false;
            const mediaOutputs: MediaOutput[] = [
                { modality: 'Image', mimeType: 'image/png', data: 'QUJD', label: 'first.png' },
                { modality: 'Image', mimeType: 'image/png', data: 'REVG', label: 'second.png' },
            ];

            await expect(
                probe.SaveAgentRunMedia('run-1', mediaOutputs, {} as UserInfo, mockProvider, 'storage-acct-1')
            ).resolves.toEqual(['run-media-1', 'run-media-2']);

            expect(uploadCalls).toHaveLength(0);
            expect(savedEntities).toHaveLength(2);
            expect(savedEntities[0].InlineData).toBe('QUJD');
            expect(savedEntities[0].FileID).toBeUndefined();
            expect(savedEntities[1].InlineData).toBe('REVG');
            expect(savedEntities[1].FileID).toBeUndefined();
        });

        it('for promptRunMediaId media: links SourcePromptRunMediaID and performs no upload or inline write', async () => {
            hasStorageAccounts = true;
            const mediaOutputs: MediaOutput[] = [
                {
                    modality: 'Image',
                    mimeType: 'image/png',
                    promptRunMediaId: 'prompt-media-99',
                    data: 'QUJD',
                },
            ];

            const savedIds = await probe.SaveAgentRunMedia(
                'run-1',
                mediaOutputs,
                {} as UserInfo,
                mockProvider,
                'storage-acct-1'
            );

            expect(savedIds).toEqual(['run-media-1']);
            expect(uploadCalls).toHaveLength(0);
            expect(savedEntities[0].SourcePromptRunMediaID).toBe('prompt-media-99');
            expect(savedEntities[0].FileID).toBeUndefined();
            expect(savedEntities[0].InlineData).toBeUndefined();
        });
    });
});

