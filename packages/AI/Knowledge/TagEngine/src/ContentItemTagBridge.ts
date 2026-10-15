import { FieldValueCollection, IMetadataProvider, LogError, RunView, UserInfo } from '@memberjunction/core';
import { MJContentItemTagEntity, MJTaggedItemEntity } from '@memberjunction/core-entities';
import { TagEngine } from './TagEngine';

/**
 * Promotes a content item's free-text tag into the governed taxonomy.
 *
 * A `MJ: Content Item Tags` row is a keyword a classifier returned. This turns it into a real
 * `MJ: Tags` row — reusing an existing tag wherever one is close enough, creating one under the
 * auto-grow rules otherwise — links the keyword to it, and records a `MJ: Tagged Items` row so the
 * item is findable through the taxonomy.
 *
 * It lives here rather than in either caller because both the content autotagger and the content
 * pipeline's Tag stage need exactly this, and two copies would be two sets of governance rules —
 * the outcome governance exists to prevent. Neither caller depends on the other.
 */
export class ContentItemTagBridge {
    constructor(private readonly provider: IMetadataProvider) {}

    /**
     * Bridge one saved content-item tag. Best-effort by contract: a failure is logged and the
     * content-item tag stays as it was saved, because losing taxonomy bookkeeping is not worth
     * failing the classification that produced it.
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
            // The parent is resolved first and its ID kept, so a newly-created child nests under it
            // rather than landing flat at the root.
            let parentTagID: string | null = null;
            if (parentTagName) {
                const parentTag = await TagEngine.Instance.ResolveTag(parentTagName, 0, 'auto-grow', null, 0.8, contextUser);
                parentTagID = parentTag?.ID ?? null;
            }

            // A global search (rootID null) reuses an existing tag anywhere in the taxonomy rather
            // than spawning a duplicate of a root-level tag inside the parent's subtree.
            // parentIDForNew only applies to a freshly-created tag, which then passes through the
            // auto-grow governance rules.
            const formalTag = await TagEngine.Instance.ResolveTag(
                contentItemTag.Tag,
                contentItemTag.Weight,
                'auto-grow',
                null,
                0.8, // low enough to catch plurals and near-variants
                contextUser,
                parentTagID ? { parentIDForNew: parentTagID } : undefined,
            );
            if (!formalTag) {
                return;
            }
            contentItemTag.TagID = formalTag.ID;
            await contentItemTag.Save();
            await this.createTaggedItem(contentItemTag, formalTag.ID, contextUser);
        } catch (e) {
            LogError(`[TaxonomyBridge] Failed for tag "${contentItemTag.Tag}": ${e instanceof Error ? e.message : String(e)}`);
        }
    }

    /**
     * Link the formal tag to the record the content actually describes: the original entity row for
     * an Entity-sourced item, the content item itself otherwise.
     */
    private async createTaggedItem(contentItemTag: MJContentItemTagEntity, tagID: string, contextUser: UserInfo): Promise<void> {
        try {
            const rv = RunView.FromMetadataProvider(this.provider);
            const item = await rv.RunView<{ ID: string; EntityRecordDocumentID: string | null }>(
                {
                    EntityName: 'MJ: Content Items',
                    ExtraFilter: FieldValueCollection.FromObject({ ID: contentItemTag.ItemID }).ToWhereClause(),
                    ResultType: 'simple',
                    Fields: ['ID', 'EntityRecordDocumentID'],
                    MaxRows: 1,
                },
                contextUser,
            );
            if (!item.Success || item.Results.length === 0) {
                return;
            }

            let entityID: string;
            let recordID: string;
            const documentID = item.Results[0].EntityRecordDocumentID;
            if (documentID) {
                const document = await rv.RunView<{ EntityID: string; RecordID: string }>(
                    {
                        EntityName: 'MJ: Entity Record Documents',
                        ExtraFilter: FieldValueCollection.FromObject({ ID: documentID }).ToWhereClause(),
                        ResultType: 'simple',
                        Fields: ['EntityID', 'RecordID'],
                        MaxRows: 1,
                    },
                    contextUser,
                );
                if (!document.Success || document.Results.length === 0) {
                    return;
                }
                entityID = document.Results[0].EntityID;
                recordID = document.Results[0].RecordID;
            } else {
                const contentItems = this.provider.EntityByName('MJ: Content Items');
                if (!contentItems) {
                    return;
                }
                entityID = contentItems.ID;
                recordID = contentItemTag.ItemID;
            }

            const existing = await rv.RunView<{ ID: string }>(
                {
                    EntityName: 'MJ: Tagged Items',
                    ExtraFilter: FieldValueCollection.FromObject({
                        TagID: tagID,
                        EntityID: entityID,
                        RecordID: recordID,
                    }).ToWhereClause(),
                    ResultType: 'simple',
                    Fields: ['ID'],
                    MaxRows: 1,
                },
                contextUser,
            );
            if (existing.Success && existing.Results.length > 0) {
                return;
            }

            const taggedItem = await this.provider.GetEntityObject<MJTaggedItemEntity>('MJ: Tagged Items', contextUser);
            taggedItem.NewRecord();
            taggedItem.TagID = tagID;
            taggedItem.EntityID = entityID;
            taggedItem.RecordID = recordID;
            taggedItem.Weight = contentItemTag.Weight;
            await taggedItem.Save();
        } catch (e) {
            // Supplemental: the content-item tag is already saved.
            LogError(
                `[TaxonomyBridge] Failed to create TaggedItem for tag "${contentItemTag.Tag}": ${e instanceof Error ? e.message : String(e)}`,
            );
        }
    }
}
