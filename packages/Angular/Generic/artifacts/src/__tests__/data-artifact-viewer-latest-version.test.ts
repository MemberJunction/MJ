// The node preset has no Angular linker; the JIT compiler lets partially compiled Angular libraries load.
import '@angular/compiler';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ChangeDetectorRef } from '@angular/core';
import { ArtifactMetadataEngine, type MJArtifactVersionEntity } from '@memberjunction/core-entities';
import { DataArtifactViewerComponent } from '../lib/components/plugins/data-artifact-viewer.component';

/**
 * The data viewer's "latest version" drives its saved-query toolbar. The artifact-wide version
 * cache can hold versions from other branches of a conversation; when the viewer panel hands the
 * plugin the version numbers visible in its scope, the latest version is the greatest of those.
 */

type SyncSeam = { initQuerySyncState: () => Promise<void> };

const ARTIFACT_ID = 'a1';

function cachedVersions(numbers: number[]): MJArtifactVersionEntity[] {
    return [...numbers]
        .sort((a, b) => b - a)
        .map((n) => ({ ID: `ver-${n}`, ArtifactID: ARTIFACT_ID, VersionNumber: n, Content: '{}' }) as unknown as MJArtifactVersionEntity);
}

function viewerAt(versionNumber: number, visible: number[] | null): DataArtifactViewerComponent {
    const cdr = { detectChanges: () => undefined, markForCheck: () => undefined } as unknown as ChangeDetectorRef;
    const viewer = new DataArtifactViewerComponent(cdr);
    viewer.artifactVersion = { ID: `ver-${versionNumber}`, ArtifactID: ARTIFACT_ID, VersionNumber: versionNumber, Content: '{}' } as unknown as MJArtifactVersionEntity;
    viewer.VisibleVersionNumbers = visible;
    viewer.spec = {};
    return viewer;
}

describe('DataArtifactViewerComponent latest version', () => {
    beforeEach(() => {
        const engine = ArtifactMetadataEngine.Instance;
        const versions = cachedVersions([1, 2, 4, 5]);
        vi.spyOn(engine, 'Config').mockResolvedValue(undefined);
        vi.spyOn(engine, 'LoadVersionsForArtifact').mockResolvedValue(versions);
        vi.spyOn(engine, 'GetCachedVersionsForArtifact').mockReturnValue(versions);
    });

    it('is the greatest visible version when the viewer passes visible version numbers', async () => {
        const viewer = viewerAt(4, [1, 2, 4]);
        await (viewer as unknown as SyncSeam).initQuerySyncState();
        expect(viewer.LatestVersionNumber).toBe(4);
        expect(viewer.IsLatestVersion).toBe(true);
        expect(viewer.QuerySyncState).toBe('no-query-latest');
    });

    it('is the artifact-wide latest version without visible version numbers', async () => {
        const viewer = viewerAt(4, null);
        await (viewer as unknown as SyncSeam).initQuerySyncState();
        expect(viewer.LatestVersionNumber).toBe(5);
        expect(viewer.IsLatestVersion).toBe(false);
        expect(viewer.QuerySyncState).toBe('no-query-older');
    });

    it('is the artifact-wide latest version when the visible list is empty', async () => {
        const viewer = viewerAt(4, []);
        await (viewer as unknown as SyncSeam).initQuerySyncState();
        expect(viewer.LatestVersionNumber).toBe(5);
    });
});
