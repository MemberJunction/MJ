/**
 * `AgentRunner.DownloadArtifactFileContent` reads a file-backed artifact's bytes for a file ID. The file ID comes
 * from an `MJ: Artifact Versions` row, so it is validated before it reaches SQL, and the object is resolved through
 * `FileStorageEngine.ResolveFileObject` — the storage-account gate plus the tracked-file rule — before any driver read.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { resolveFileObjectMock, getObjectMock, runViewMock } = vi.hoisted(() => ({
    resolveFileObjectMock: vi.fn(),
    getObjectMock: vi.fn(async () => Buffer.from('%PDF-1.7')),
    runViewMock: vi.fn(),
}));

vi.mock('@memberjunction/storage', () => ({
    FileStorageEngine: { Instance: { Config: async () => undefined, ResolveFileObject: resolveFileObjectMock } },
}));

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        LogError: vi.fn(),
        LogStatus: vi.fn(),
        RunView: class { static FromMetadataProvider() { return { RunView: runViewMock }; } RunView = runViewMock; },
    };
});

import { AgentRunner } from '../AgentRunner';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';

const FILE_ID = 'aaaaaaaa-0000-4000-8000-0000000000f1';
const caller = { ID: 'user-1', UserRoles: [] } as unknown as UserInfo;
const provider = {} as IMetadataProvider;
const fileRow = { ID: FILE_ID, Name: 'report.pdf', ContentType: 'application/pdf', ProviderID: 'prov-1', ProviderKey: 'reports/report.pdf' };

class Probe extends AgentRunner {
    public Download(fileId: string): Promise<Buffer | null> {
        return this.DownloadArtifactFileContent(fileId, caller);
    }
}

describe('AgentRunner.DownloadArtifactFileContent — the storage gate', () => {
    beforeEach(() => {
        resolveFileObjectMock.mockReset();
        getObjectMock.mockClear();
        runViewMock.mockReset();
        runViewMock.mockResolvedValue({ Success: true, Results: [fileRow] });
    });

    it('refuses a value that is not a file ID before any query', async () => {
        expect(await new Probe(provider).Download("x' OR 1=1 --")).toBeNull();
        expect(runViewMock).not.toHaveBeenCalled();
        expect(resolveFileObjectMock).not.toHaveBeenCalled();
    });

    it('resolves the object through the gate, as the caller, and reads the key it resolved', async () => {
        resolveFileObjectMock.mockResolvedValue({ Account: { ID: 'acct-1' }, Driver: { GetObject: getObjectMock }, ObjectKey: fileRow.ProviderKey });
        const content = await new Probe(provider).Download(FILE_ID);
        expect(resolveFileObjectMock).toHaveBeenCalledWith(fileRow, caller, 'Read', provider);
        expect(getObjectMock).toHaveBeenCalledWith({ fullPath: fileRow.ProviderKey });
        expect(content?.toString()).toBe('%PDF-1.7');
    });

    it('returns null and reads nothing when the gate refuses', async () => {
        resolveFileObjectMock.mockRejectedValue(new Error('You do not have access to this storage account or it does not exist.'));
        expect(await new Probe(provider).Download(FILE_ID)).toBeNull();
        expect(getObjectMock).not.toHaveBeenCalled();
    });

    it('returns null when the row cannot be read as the caller', async () => {
        runViewMock.mockResolvedValue({ Success: true, Results: [] });
        expect(await new Probe(provider).Download(FILE_ID)).toBeNull();
        expect(resolveFileObjectMock).not.toHaveBeenCalled();
    });
});
