import { describe, it, expect, afterEach, vi } from 'vitest';
import type { RunViewParams, UserInfo } from '@memberjunction/core';
import { CreateFakeProvider } from '@memberjunction/ng-test-utils';
import { ArtifactPermissionService } from '../lib/services/artifact-permission.service';
import { RunViewComponentArtifactSource } from '../lib/components/realtime/interactive-component/run-view-component-artifact-source';
import { ComponentArtifactError } from '../lib/components/realtime/interactive-component/interactive-component-types';

/**
 * The realtime component channel mounts a loaded version with no question to the user, so the
 * source loads only versions that the signed-in user wrote.
 */

const USER = { ID: 'D0000000-0000-0000-0000-000000000001', Name: 'Viewer' } as unknown as UserInfo;
const OTHER_USER_ID = 'D0000000-0000-0000-0000-000000000002';
const ARTIFACT_ID = 'D0000000-0000-0000-0000-0000000000A1';
const VERSION_ID = 'D0000000-0000-0000-0000-0000000000B1';

type VersionRow = { ID: string; ArtifactID: string; VersionNumber: number; Name: string; UserID: string; Content: string };
type ArtifactRow = { ID: string; Name: string; Type: string };

function makeSource(versionAuthorId: string): RunViewComponentArtifactSource {
    const provider = CreateFakeProvider<VersionRow | ArtifactRow>({
        currentUser: USER,
        runViewResults: (params: RunViewParams): Array<VersionRow | ArtifactRow> => {
            if (params.EntityName === 'MJ: Artifact Versions') {
                return [{
                    ID: VERSION_ID,
                    ArtifactID: ARTIFACT_ID,
                    VersionNumber: 1,
                    Name: 'Shared Widget',
                    UserID: versionAuthorId,
                    Content: JSON.stringify({ name: 'SharedWidget', code: 'function SharedWidget() { return null; }' }),
                }];
            }
            if (params.EntityName === 'MJ: Artifacts') {
                return [{ ID: ARTIFACT_ID, Name: 'Shared Widget', Type: 'Component' }];
            }
            return [];
        },
    });
    return new RunViewComponentArtifactSource(provider, USER);
}

describe('RunViewComponentArtifactSource', () => {
    afterEach(() => vi.restoreAllMocks());

    it('refuses a version that a different user wrote', async () => {
        vi.spyOn(ArtifactPermissionService.prototype, 'CheckPermission').mockResolvedValue(true);
        const source = makeSource(OTHER_USER_ID);

        await expect(source.LoadVersion(VERSION_ID)).rejects.toBeInstanceOf(ComponentArtifactError);
        await expect(source.LoadLatest(ARTIFACT_ID)).rejects.toBeInstanceOf(ComponentArtifactError);
    });
});
