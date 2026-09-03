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

let hasStorageAccounts = false;
let storageEngineConfigured = false;

vi.mock('@memberjunction/storage', () => ({
    FileStorageEngine: {
        Instance: {
            get HasStorageAccounts() {
                return hasStorageAccounts;
            },
            Config: async () => {
                storageEngineConfigured = true;
            },
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
});
