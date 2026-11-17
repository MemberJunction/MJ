/**
 * @vitest-environment jsdom
 */
import '@angular/compiler';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { ChangeDetectorRef } from '@angular/core';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import {
    ArtifactMetadataEngine,
    QueryEngine,
    type MJArtifactVersionEntity,
} from '@memberjunction/core-entities';
import { DataArtifactViewerComponent } from '../lib/components/plugins/data-artifact-viewer.component';

function stubObj<T extends object>(fields: Partial<T>): T {
    return Object.assign(Object.create(null) as T, fields);
}

describe('DataArtifactViewerComponent versioning (N4)', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('creates a new immutable artifact version (and checks Save() result) instead of mutating saved version in place', async () => {
        const cdr = stubObj<ChangeDetectorRef>({ detectChanges: vi.fn() });
        const viewer = new DataArtifactViewerComponent(cdr);

        const existingSaveSpy = vi.fn(async () => false);
        const existingVersion = stubObj<MJArtifactVersionEntity>({
            ID: 'ver-1',
            ArtifactID: 'art-1',
            VersionNumber: 1,
            Name: 'Query Results',
            ContentMode: 'Text',
            MimeType: 'application/json',
            Content: '{"title":"Sales","metadata":{"sql":"SELECT 1"}}',
            Save: existingSaveSpy,
        });

        const createdSaveCalls: Array<{ Content?: string; VersionNumber?: number; Comments?: string }> = [];
        let saveShouldSucceed = true;
        const createdVersions: MJArtifactVersionEntity[] = [];

        const mockUser = stubObj<UserInfo>({ ID: 'user-1', Name: 'Analyst' });
        const mockProvider = stubObj<IMetadataProvider>({
            CurrentUser: mockUser,
            Refresh: vi.fn(async () => true),
            GetEntityObject: vi.fn(async <T>(entityName: string): Promise<T> => {
                if (entityName === 'MJ: Artifact Versions') {
                    const rec = stubObj<MJArtifactVersionEntity>({
                        ID: `ver-new-${createdVersions.length + 2}`,
                        NewRecord: vi.fn(() => true),
                        LatestResult: {
                            CompleteMessage: 'DB constraint error',
                            Message: 'DB constraint error',
                        } as MJArtifactVersionEntity['LatestResult'],
                        Save: vi.fn(async () => {
                            createdSaveCalls.push({
                                Content: rec.Content ?? undefined,
                                VersionNumber: rec.VersionNumber,
                                Comments: rec.Comments ?? undefined,
                            });
                            return saveShouldSucceed;
                        }),
                    });
                    createdVersions.push(rec);
                    return rec as T;
                }
                return {} as T;
            }) as IMetadataProvider['GetEntityObject'],
        });

        viewer.artifactVersion = existingVersion;
        viewer.Provider = mockProvider;
        viewer.spec = {
            title: 'Sales',
            metadata: { sql: 'SELECT 1' },
        };
        vi.spyOn(QueryEngine.prototype, 'Config').mockResolvedValue();
        vi.spyOn(ArtifactMetadataEngine.prototype, 'Config').mockResolvedValue();

        await viewer.OnQuerySaved({
            queryId: 'q-101',
            queryName: 'Monthly Sales',
        });

        expect(existingSaveSpy).not.toHaveBeenCalled();
        expect(createdSaveCalls).toHaveLength(1);
        expect(createdSaveCalls[0]?.VersionNumber).toBe(2);
        expect(createdSaveCalls[0]?.Content).toContain('"savedQueryId":"q-101"');
        expect(viewer.CurrentVersionNumber).toBe(2);

        // When Save() returns false, persistArtifactContent throws instead of silently advancing version
        saveShouldSucceed = false;
        const persistFn = Reflect.get(viewer, 'persistArtifactContent') as () => Promise<void>;
        await expect(persistFn.call(viewer)).rejects.toThrow('DB constraint error');
    });
});
