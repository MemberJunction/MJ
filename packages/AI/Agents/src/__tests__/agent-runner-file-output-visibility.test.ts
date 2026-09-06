/**
 * A FileOutput's `visibility` reaches the artifact MJ creates for it. Same instance-stubbing recipe as
 * agent-runner-media-storage.test.ts: `createArtifactWithVersion` is replaced on a bare AgentRunner so
 * the routing in `processFileOutput` runs for real and its call is captured.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { UserInfo, IMetadataProvider } from '@memberjunction/core';
import type { FileOutputRef } from '@memberjunction/ai-core-plus';

let hasStorageAccounts = false;
vi.mock('@memberjunction/storage', () => ({
    FileStorageEngine: {
        Instance: {
            get HasStorageAccounts() { return hasStorageAccounts; },
            Config: async () => undefined,
        },
    },
}));

import { AgentRunner } from '../AgentRunner';

interface Captured { visibility?: string; label?: string; setVersionFields?: (v: Record<string, unknown>) => void }
interface Probe {
    processFileOutput(fo: FileOutputRef, conversationDetailId: string, contextUser: UserInfo, resolvedStorageAccountId: string | undefined, provider: IMetadataProvider, acceptUnregisteredFiles: boolean): Promise<unknown>;
    createArtifactWithVersion: (opts: Captured) => Promise<void>;
    uploadBase64ToStorage: (...args: unknown[]) => Promise<string>;
}

describe('AgentRunner — FileOutput.visibility → artifact Visibility', () => {
    let probe: Probe;
    let captured: Captured[];
    const run = (fo: FileOutputRef) => probe.processFileOutput(fo, 'detail-1', {} as UserInfo, undefined, {} as IMetadataProvider, true);

    beforeEach(() => {
        captured = [];
        hasStorageAccounts = false;
        probe = Object.create(AgentRunner.prototype) as Probe;
        probe.createArtifactWithVersion = async (opts) => { captured.push(opts); };
        probe.uploadBase64ToStorage = async () => 'file-id-1';
    });

    it('a file-backed output carries its visibility', async () => {
        await run({ fileName: 'exam.csv', mimeType: 'text/csv', fileId: 'f-1', visibility: 'System Only' });
        expect(captured).toHaveLength(1);
        expect(captured[0].visibility).toBe('System Only');
        expect(captured[0].label).toBe('file');
    });

    it('an inline output carries its visibility, whether it stays inline or is uploaded', async () => {
        await run({ fileName: 'exam.csv', mimeType: 'text/csv', fileData: 'QUJD', visibility: 'System Only' });
        hasStorageAccounts = true;
        await run({ fileName: 'exam.pdf', mimeType: 'application/pdf', fileData: 'QUJD', visibility: 'System Only' });
        expect(captured.map((c) => c.visibility)).toEqual(['System Only', 'System Only']);
        expect(captured.map((c) => c.label)).toEqual(['inline file', 'file']);
    });

    it('an output that says nothing leaves visibility undefined for createArtifactWithVersion to default to Always', async () => {
        await run({ fileName: 'report.pdf', mimeType: 'application/pdf', fileId: 'f-2' });
        expect(captured[0].visibility).toBeUndefined();
    });
});
