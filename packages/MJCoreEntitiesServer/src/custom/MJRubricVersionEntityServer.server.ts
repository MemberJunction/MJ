import { BaseEntity } from '@memberjunction/core';
import { MJRubricVersionEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import type { RubricVersionSnapshot } from '@memberjunction/rubrics-base';
import { cloneVersionNodes, publishRubricVersion, type PublishResult } from './rubrics/versionPublish.js';

/**
 * Draft, publish, and hash a rubric version.
 *
 * `publish` refuses a tree with duplicate keys, a missing or cyclic parent, a
 * criterion without a scale, or a gate without a minimum, and refuses a draft
 * identical to its base. It writes the bump, version numbers, change details,
 * ContentHash, and ScoringHash from RubricVersionDiff. It does not write a
 * second copy of the scoring math.
 */
@RegisterClass(BaseEntity, 'MJ: Rubric Versions')
export class MJRubricVersionEntityServer extends MJRubricVersionEntity {
    /**
     * Deep-clones criteria onto a new draft. Keys are kept. Ids and parent ids
     * are new. The caller sets Status to Draft and BasedOnVersionID to the source.
     */
    public cloneNodes(source: RubricVersionSnapshot['nodes']): RubricVersionSnapshot['nodes'] {
        return cloneVersionNodes(source);
    }

    /**
     * Computes the publish result and copies it onto this version. Refuses the
     * cases documented on the class. The caller saves inside its transaction.
     */
    public async publish(
        base: RubricVersionSnapshot | null,
        draft: RubricVersionSnapshot,
        requestedBump?: 'Major' | 'Minor' | 'Patch' | null,
    ): Promise<PublishResult> {
        const result = await publishRubricVersion(base, draft, requestedBump);
        this.Status = 'Published';
        this.MajorVersion = result.majorVersion;
        this.MinorVersion = result.minorVersion;
        this.PatchVersion = result.patchVersion;
        this.ComputedBump = result.computedBump;
        this.AppliedBump = result.appliedBump;
        this.ContentHash = result.contentHash;
        this.ScoringHash = result.scoringHash;
        this.ChangeDetails = JSON.stringify(result.changeDetails);
        return result;
    }
}
