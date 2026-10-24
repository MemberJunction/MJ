/**
 * @fileoverview {@link ContentPipelineDeleteMarker} — marking what depends on a deleted item (its
 * chunks, and the items it expanded into) so each goes through the Delete stage itself.
 *
 * @module @memberjunction/content-pipeline
 */

import { CompositeKey, IMetadataProvider, LogError, RunView, UserInfo } from '@memberjunction/core';
import { MJContentItemChunkEntity, MJContentItemEntity } from '@memberjunction/core-entities';

import { PipelineEntityName } from './EntityFieldMap.js';
import { WhereEqual } from './Filters.js';

/** Marks a deleted item's dependents pending. */
export class ContentPipelineDeleteMarker {
    constructor(
        private readonly provider: IMetadataProvider,
        private readonly contextUser?: UserInfo,
    ) {}

    /**
     * Mark an item's chunks and child items for deletion.
     *
     * @returns How many records were marked.
     */
    public async MarkDependentsOf(contentItemID: string, contextUser?: UserInfo): Promise<number> {
        const user = contextUser ?? this.contextUser;
        if (!user) {
            throw new Error('ContentPipelineDeleteMarker: a context user is required');
        }
        const rv = RunView.FromMetadataProvider(this.provider);
        const [chunks, children] = await rv.RunViews(
            [
                {
                    EntityName: 'MJ: Content Item Chunks',
                    ExtraFilter: `${WhereEqual({ ContentItemID: contentItemID })} AND (DeleteStatus IS NULL OR DeleteStatus <> 'Deleted')`,
                },
                {
                    EntityName: 'MJ: Content Items',
                    ExtraFilter: `${WhereEqual({ ParentID: contentItemID })} AND (DeleteStatus IS NULL OR DeleteStatus <> 'Deleted')`,
                },
            ],
            user,
        );

        if (!chunks.Success || !children.Success) {
            // Thrown, not swallowed: the item's own delete must not complete with dependents unmarked.
            throw new Error(`Loading the dependents of '${contentItemID}' failed: ${chunks.ErrorMessage || children.ErrorMessage}`);
        }
        const marked = await this.mark('MJ: Content Item Chunks', chunks.Results as { ID: string }[], user);
        return marked + (await this.mark('MJ: Content Items', children.Results as { ID: string }[], user));
    }

    /** Mark one record for deletion; the Delete stage then owns its outside-system cleanup. */
    public async MarkForDeletion(entityName: PipelineEntityName, recordID: string, contextUser?: UserInfo): Promise<boolean> {
        const user = contextUser ?? this.contextUser;
        if (!user) {
            throw new Error('ContentPipelineDeleteMarker: a context user is required');
        }
        return (await this.mark(entityName, [{ ID: recordID }], user)) === 1;
    }

    /** Set `DeleteStatus = 'Pending'` on each row. */
    private async mark(entityName: PipelineEntityName, rows: readonly { ID: string }[], contextUser: UserInfo): Promise<number> {
        let marked = 0;
        for (const row of rows) {
            try {
                const entityObject = await this.provider.GetEntityObject<MJContentItemEntity | MJContentItemChunkEntity>(entityName, contextUser);
                if (!(await entityObject.InnerLoad(CompositeKey.FromID(row.ID)))) { // first-pk-ok: MJ core content entity, single-column ID
                    continue;
                }
                entityObject.DeleteStatus = 'Pending';
                if (await entityObject.Save()) {
                    marked++;
                } else {
                    LogError(`ContentPipelineDeleteMarker: could not mark ${entityName} '${row.ID}': ${entityObject.LatestResult?.CompleteMessage ?? 'unknown error'}`);
                }
            } catch (error) {
                // One unmarkable dependent must not stop the rest; the next Delete run picks it up.
                LogError(
                    `ContentPipelineDeleteMarker: could not mark ${entityName} '${row.ID}': ` +
                        `${error instanceof Error ? error.message : String(error)}`,
                );
            }
        }
        return marked;
    }
}
