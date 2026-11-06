import { FieldValueCollection, IMetadataProvider, LogError, RunView, UserInfo } from '@memberjunction/core';
import { MJContentItemTagEntity } from '@memberjunction/core-entities';
import { TagEngine } from './TagEngine';

/**
 * Promotes a content item's free-text tag into the governed taxonomy: resolves (or, under the
 * auto-grow rules, creates) the `MJ: Tags` row, links the keyword to it, and records a
 * `MJ: Tagged Items` row so the item is findable through the taxonomy.
 *
 * Shared by the content autotagger and the content pipeline's Tag stage, so both follow one set of
 * governance rules. Neither caller depends on the other.
 */
export class ContentItemTagBridge {
    constructor(private readonly provider: IMetadataProvider) {}

    /**
     * Bridge one saved content-item tag. Best-effort: a failure is logged and the content-item tag
     * stays as saved, because taxonomy bookkeeping is not worth failing the classification.
     *
     * @param parentTagName A parent the classifier suggested, used to nest a NEWLY-created tag.
     */
    public async Bridge(
        contentItemTag: MJContentItemTagEntity,
        parentTagName: string | null,
        contextUser: UserInfo,
    ): Promise<void> {
        try {
            await TagEngine.Instance.Config(false, contextUser);
            // Resolve the parent first so a newly-created child nests under it.
            const parentTag = parentTagName
                ? await TagEngine.Instance.ResolveTag(parentTagName, 0, 'auto-grow', null, 0.8, contextUser)
                : null;

            // A global search (rootID null) reuses a tag anywhere rather than duplicating it in the
            // parent's subtree; 0.8 is low enough to catch plurals and near-variants.
            const formalTag = await TagEngine.Instance.ResolveTag(
                contentItemTag.Tag,
                contentItemTag.Weight,
                'auto-grow',
                null,
                0.8,
                contextUser,
                parentTag ? { parentIDForNew: parentTag.ID } : undefined,
            );
            if (!formalTag) {
                return;
            }
            contentItemTag.TagID = formalTag.ID;
            if (!(await contentItemTag.Save())) {
                LogError(`[TaxonomyBridge] Could not link tag "${contentItemTag.Tag}": ${contentItemTag.LatestResult?.CompleteMessage ?? 'unknown error'}`);
            }
            await this.createTaggedItem(contentItemTag, formalTag.ID, contextUser);
        } catch (e) {
            LogError(`[TaxonomyBridge] Failed for tag "${contentItemTag.Tag}": ${e instanceof Error ? e.message : String(e)}`);
        }
    }

    /**
     * Link the formal tag to the record the content describes: the original entity row for an
     * Entity-sourced item, the content item itself otherwise.
     */
    private async createTaggedItem(contentItemTag: MJContentItemTagEntity, tagID: string, contextUser: UserInfo): Promise<void> {
        try {
            const target = await this.taggedRecordFor(contentItemTag.ItemID, contextUser);
            if (target) {
                await TagEngine.Instance.CreateTaggedItem(tagID, target.EntityID, target.RecordID, contentItemTag.Weight, contextUser);
            }
        } catch (e) {
            // Supplemental: the content-item tag is already saved.
            LogError(`[TaxonomyBridge] Failed to create TaggedItem for tag "${contentItemTag.Tag}": ${e instanceof Error ? e.message : String(e)}`);
        }
    }

    /** The entity and record a content item describes, or null when it cannot be determined. */
    private async taggedRecordFor(contentItemID: string, contextUser: UserInfo): Promise<{ EntityID: string; RecordID: string } | null> {
        const rv = RunView.FromMetadataProvider(this.provider);
        const item = await rv.RunView<{ ID: string; EntityRecordDocumentID: string | null }>(
            {
                EntityName: 'MJ: Content Items',
                ExtraFilter: FieldValueCollection.FromObject({ ID: contentItemID }).ToWhereClause(),
                ResultType: 'simple',
                Fields: ['ID', 'EntityRecordDocumentID'],
                MaxRows: 1,
                SkipTotalRowCount: true,
            },
            contextUser,
        );
        if (!item.Success || item.Results.length === 0) {
            return null;
        }
        const documentID = item.Results[0].EntityRecordDocumentID;
        if (!documentID) {
            const contentItems = this.provider.EntityByName('MJ: Content Items');
            return contentItems ? { EntityID: contentItems.ID, RecordID: contentItemID } : null;
        }
        const document = await rv.RunView<{ EntityID: string; RecordID: string }>(
            {
                EntityName: 'MJ: Entity Record Documents',
                ExtraFilter: FieldValueCollection.FromObject({ ID: documentID }).ToWhereClause(),
                ResultType: 'simple',
                Fields: ['EntityID', 'RecordID'],
                MaxRows: 1,
                SkipTotalRowCount: true,
                // A one-off lookup by ID; a cached RunView would read every column (DocumentText, VectorJSON).
                BypassCache: true,
            },
            contextUser,
        );
        return document.Success && document.Results.length > 0 ? document.Results[0] : null;
    }
}
