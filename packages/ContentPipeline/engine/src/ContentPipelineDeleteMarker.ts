/**
 * @fileoverview {@link ContentPipelineDeleteMarker} — marking what depends on a deleted item.
 *
 * Deleting an item means deleting everything it produced: the chunks holding its text, and any
 * items it expanded into — a zip's members, a CSV's rows. Those are marked rather than removed
 * here, so each goes through the Delete stage itself and the removal stays idempotent and
 * retryable. Marking recurses naturally: a marked child item marks its own dependents when its turn
 * comes.
 *
 * @module @memberjunction/content-pipeline
 */

import { BaseEntity, CompositeKey, IMetadataProvider, LogError, RunView, UserInfo } from '@memberjunction/core';

import { PipelineEntityName } from './EntityFieldMap';

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
                    ExtraFilter: `ContentItemID='${contentItemID}' AND (DeleteStatus IS NULL OR DeleteStatus <> 'Deleted')`,
                },
                {
                    EntityName: 'MJ: Content Items',
                    ExtraFilter: `ParentID='${contentItemID}' AND (DeleteStatus IS NULL OR DeleteStatus <> 'Deleted')`,
                },
            ],
            user,
        );

        let marked = 0;
        marked += await this.mark('MJ: Content Item Chunks', chunks.Results as { ID: string }[], user);
        marked += await this.mark('MJ: Content Items', children.Results as { ID: string }[], user);
        return marked;
    }

    /**
     * Mark one record for deletion.
     *
     * Marking rather than removing is deliberate: the Delete stage owns the outside-system cleanup,
     * and routing every removal through it keeps that cleanup in one place and makes it retryable.
     */
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
                const entityObject = await this.provider.GetEntityObject<BaseEntity>(entityName, contextUser);
                if (!(await entityObject.InnerLoad(CompositeKey.FromID(row.ID)))) { // first-pk-ok: MJ core content entity, single-column ID
                    continue;
                }
                entityObject.Set('DeleteStatus', 'Pending');
                if (await entityObject.Save()) {
                    marked++;
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
