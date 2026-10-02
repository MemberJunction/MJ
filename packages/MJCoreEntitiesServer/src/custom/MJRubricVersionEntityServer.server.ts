import { BaseEntity, type EntitySaveOptions, type ValidationResult } from '@memberjunction/core';
import { MJRubricVersionEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import type { RubricVersionSnapshot } from '@memberjunction/rubrics-base';
import { FROZEN_VERSION_FIELDS, PushFailure, VersionStatusError } from './rubrics/statusRules.js';
import { CloneVersionNodes, LoadDraftForPublish, PublishRubricVersion, type PublishResult } from './rubrics/versionPublish.js';

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
    public CloneNodes(source: RubricVersionSnapshot['nodes']): RubricVersionSnapshot['nodes'] {
        return CloneVersionNodes(source);
    }

    /**
     * Computes the publish result and copies it onto this version. Refuses the
     * cases documented on the class. The caller saves inside its transaction.
     */
    public async Publish(
        base: RubricVersionSnapshot | null,
        draft: RubricVersionSnapshot,
        requestedBump?: 'Major' | 'Minor' | 'Patch' | null,
    ): Promise<PublishResult> {
        const result = await PublishRubricVersion(base, draft, requestedBump);
        this.Status = 'Published';
        this.MajorVersion = result.majorVersion;
        this.MinorVersion = result.minorVersion;
        this.PatchVersion = result.patchVersion;
        this.ComputedBump = result.computedBump;
        this.AppliedBump = result.appliedBump;
        this.ContentHash = result.contentHash;
        this.ScoringHash = result.scoringHash;
        this.ChangeDetails = JSON.stringify(result.changeDetails);
        this.PublishedAt = result.publishedAt;
        return result;
    }

    /**
     * A new version is Draft. Draft becomes Published only through Publish.
     * A frozen version moves only between Published and Retired, and none of
     * the columns the immutability trigger freezes may change on that move.
     */
    public override async ValidateAsync(): Promise<ValidationResult> {
        const result = await super.ValidateAsync();
        const status = this.GetFieldByName('Status');
        const previous = this.IsSaved === false ? null : String(status?.OldValue ?? this.Status);
        const statusError = VersionStatusError(this.IsSaved === false, previous, this.Status);
        if (statusError) PushFailure(result, 'Status', statusError, this.Status);
        if (this.IsSaved !== false && previous && previous !== 'Draft') {
            for (const name of FROZEN_VERSION_FIELDS) {
                const field = this.GetFieldByName(name);
                if (field?.Dirty) {
                    PushFailure(result, name, 'A published rubric version is immutable. Create a new draft version to change it; only its Status may move between Published and Retired.', field.Value);
                    break;
                }
            }
        }
        return result;
    }

    /**
     * When Status moves Draft → Published, loads the draft tree and its base
     * version and calls {@link publish}. Setting Status and saving is enough.
     * Refuses the cases documented on the class. Writes PublishedAt with the
     * status, which the published-version check constraint requires, and stamps
     * PublishedByUserID from the current user. Retiring stamps RetiredAt.
     */
    public override async Save(options?: EntitySaveOptions): Promise<boolean> {
        const status = this.GetFieldByName('Status');
        if (status?.Dirty && status.OldValue === 'Draft' && this.Status === 'Published') {
            const provider = this.ProviderToUse as { RunView?: (params: { EntityName: string; ExtraFilter: string }, user?: unknown) => Promise<{ Success: boolean; Results?: unknown[] }> };
            if (!provider?.RunView) throw new Error('Publishing a rubric version requires a provider that can load the draft tree.');
            const run = (entityName: string, filter: string) => provider.RunView!({ EntityName: entityName, ExtraFilter: filter }, this.ContextCurrentUser);
            const loaded = await LoadDraftForPublish(run, this.ID, this.RubricID, this.BasedOnVersionID);
            const requested = (this as { RequestedBump?: 'Major' | 'Minor' | 'Patch' | null }).RequestedBump ?? null;
            await this.Publish(loaded.base, loaded.draft, requested);
            const userId = (this.ContextCurrentUser as { ID?: string } | null)?.ID;
            if (userId && !this.PublishedByUserID) this.PublishedByUserID = userId;
        }
        if (status?.Dirty && this.Status === 'Retired' && !this.RetiredAt) {
            this.RetiredAt = new Date();
        }
        return super.Save(options);
    }
}
