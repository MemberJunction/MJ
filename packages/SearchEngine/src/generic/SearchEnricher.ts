/**
 * @fileoverview Enrichment logic for search results.
 *
 * Adds entity icons, record names, and tags to search results.
 * Skippable for preview mode where speed is more important than enrichment.
 *
 * @module @memberjunction/search-engine
 */

import {
    IMetadataProvider,
    LogError,
    Metadata,
    RunView,
    UserInfo,
    EntityRecordNameInput,
    CompositeKey
} from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import { KnowledgeHubMetadataEngine } from '@memberjunction/core-entities';
import { SearchResultItem } from './search.types';

/**
 * Enriches search results with entity icons, record names, and tags.
 * Also handles filtering of redundant Content Item results that originate
 * from entity-type content sources.
 */
export class SearchEnricher {
    /** Optional metadata provider; falls back to Metadata.Provider. */
    private _provider: IMetadataProvider | undefined;

    public set Provider(value: IMetadataProvider | undefined) {
        this._provider = value;
    }

    public get Provider(): IMetadataProvider {
        return this._provider ?? Metadata.Provider;
    }

    /**
     * Apply full enrichment to search results: entity icons, record names, and tags.
     *
     * @param results - The search results to enrich (mutated in place)
     * @param contextUser - The user performing the search
     */
    public async Enrich(results: SearchResultItem[], contextUser: UserInfo): Promise<void> {
        if (results.length === 0) return;

        const md = this.Provider;
        this.addEntityMetadata(results, md);
        await this.resolveRecordNames(results, md, contextUser);
    }

    /**
     * Enrich results with tags from both TaggedItems and ContentItemTags entities.
     *
     * @param results - The search results to enrich (mutated in place)
     * @param contextUser - The user performing the search
     */
    public async EnrichWithTags(results: SearchResultItem[], contextUser: UserInfo): Promise<void> {
        if (results.length === 0) return;

        try {
            const contentItemResults = results.filter(r => r.EntityName === 'MJ: Content Items');
            const generalResults = results.filter(r => r.EntityName !== 'MJ: Content Items');

            await Promise.all([
                this.loadTaggedItemTags(generalResults, contextUser),
                this.loadContentItemTags(contentItemResults, contextUser)
            ]);
        } catch (error) {
            LogError(`SearchEnricher: Error enriching results with tags: ${error}`);
            // Non-fatal - results still usable without tags
        }
    }

    /**
     * Filter results to only include those with at least one tag matching the specified list.
     * Uses case-insensitive comparison.
     */
    public FilterByTags(results: SearchResultItem[], requiredTags: string[]): SearchResultItem[] {
        const lowerTags = new Set(requiredTags.map(t => t.toLowerCase()));
        return results.filter(r =>
            r.Tags.some(t => lowerTags.has(t.toLowerCase()))
        );
    }

    /**
     * Handles Content Item results by promoting entity-sourced content items to their
     * underlying entity records (Option B), or excluding redundant entity-sourced items,
     * while preserving genuine external unstructured content items (PDFs, URLs, Markdown files).
     *
     * When a content item originated from an Entity content source (or links to an
     * Entity Record Document):
     * 1. If its underlying entity record can be resolved, it is promoted to that target
     *    entity (EntityName, RecordID), carrying its score and snippet forward.
     * 2. If it cannot be resolved, it is excluded to avoid surfacing detached internal items.
     *
     * Genuine external content items (ContentSourceType !== 'Entity') remain as 'MJ: Content Items'.
     *
     * @param results - All search results
     * @param contextUser - The user performing the search
     * @returns Processed results with entity-sourced content items promoted or excluded
     */
    public async ExcludeEntitySourcedContentItems(
        results: SearchResultItem[],
        contextUser: UserInfo
    ): Promise<SearchResultItem[]> {
        const contentItemResults = results.filter(r => r.EntityName === 'MJ: Content Items');
        if (contentItemResults.length === 0) return results;

        try {
            await KnowledgeHubMetadataEngine.Instance.Config(false, contextUser);
        } catch {
            // Non-fatal if KnowledgeHubMetadataEngine fails to load
        }
        const engine = KnowledgeHubMetadataEngine.Instance;

        const entitySourceType = engine.ContentSourceTypes?.find(st => st.Name === 'Entity');
        const entitySourceIDs = new Set(
            (engine.ContentSources ?? [])
                .filter(cs => entitySourceType && UUIDsEqual(cs.ContentSourceTypeID, entitySourceType.ID))
                .map(cs => cs.ID.toLowerCase())
        );

        // Map of ContentItemID -> { EntityName: string; RecordID: string }
        const resolvedEntityRecords = new Map<string, { EntityName: string; RecordID: string }>();
        const unpromotableItemIDs = new Set<string>();

        // Step 1: Check if RawMetadata on vector results already specifies Entity and RecordID,
        // or identifies an entity source
        const itemsNeedingDbLookup: string[] = [];

        for (const r of contentItemResults) {
            let handled = false;
            if (r.RawMetadata) {
                try {
                    const meta = JSON.parse(r.RawMetadata) as Record<string, string>;
                    if (meta.Entity && meta.RecordID) {
                        resolvedEntityRecords.set(r.RecordID.toLowerCase(), {
                            EntityName: meta.Entity,
                            RecordID: meta.RecordID
                        });
                        handled = true;
                    } else if (meta.ContentSourceID && entitySourceIDs.has(meta.ContentSourceID.toLowerCase())) {
                        itemsNeedingDbLookup.push(r.RecordID);
                        handled = true;
                    }
                } catch {
                    // Ignore parse errors
                }
            }
            if (!handled && r.RecordID) {
                itemsNeedingDbLookup.push(r.RecordID);
            }
        }

        // Step 2: For items needing DB lookup, check MJ: Content Items and MJ: Entity Record Documents
        if (itemsNeedingDbLookup.length > 0) {
            try {
                const uniqueIDs = Array.from(new Set(itemsNeedingDbLookup)).map(id => `'${id.replace(/'/g, "''")}'`);
                const rv = new RunView();
                const contentItemsRes = await rv.RunView<{ ID: string; ContentSourceID: string; EntityRecordDocumentID: string | null }>({
                    EntityName: 'MJ: Content Items',
                    Fields: ['ID', 'ContentSourceID', 'EntityRecordDocumentID'],
                    ExtraFilter: `ID IN (${uniqueIDs.join(',')})`,
                    ResultType: 'simple'
                }, contextUser);

                if (contentItemsRes.Success && contentItemsRes.Results) {
                    const erdLookups: Array<{ itemID: string; erdID: string }> = [];
                    for (const ci of contentItemsRes.Results) {
                        const isEntitySource = ci.ContentSourceID && entitySourceIDs.has(ci.ContentSourceID.toLowerCase());
                        if (ci.EntityRecordDocumentID) {
                            erdLookups.push({ itemID: ci.ID.toLowerCase(), erdID: ci.EntityRecordDocumentID });
                        } else if (isEntitySource) {
                            unpromotableItemIDs.add(ci.ID.toLowerCase());
                        }
                    }

                    if (erdLookups.length > 0) {
                        const erdIDList = Array.from(new Set(erdLookups.map(l => `'${l.erdID.replace(/'/g, "''")}'`)));
                        const erdRes = await rv.RunView<{ ID: string; Entity: string; RecordID: string }>({
                            EntityName: 'MJ: Entity Record Documents',
                            Fields: ['ID', 'Entity', 'RecordID'],
                            ExtraFilter: `ID IN (${erdIDList.join(',')})`,
                            ResultType: 'simple'
                        }, contextUser);

                        if (erdRes.Success && erdRes.Results) {
                            const erdMap = new Map<string, { Entity: string; RecordID: string }>();
                            for (const erd of erdRes.Results) {
                                if (erd.Entity && erd.RecordID) {
                                    erdMap.set(erd.ID.toLowerCase(), { Entity: erd.Entity, RecordID: erd.RecordID });
                                }
                            }

                            for (const lookup of erdLookups) {
                                const target = erdMap.get(lookup.erdID.toLowerCase());
                                if (target) {
                                    resolvedEntityRecords.set(lookup.itemID, {
                                        EntityName: target.Entity,
                                        RecordID: target.RecordID
                                    });
                                } else {
                                    unpromotableItemIDs.add(lookup.itemID);
                                }
                            }
                        }
                    }
                }
            } catch (error) {
                LogError(`SearchEnricher: Failed to resolve entity-sourced content items: ${error}`);
            }
        }

        // Step 3: Promote resolved entity records, drop unpromotable entity-sourced items,
        // and preserve external unstructured content items
        const output: SearchResultItem[] = [];
        for (const r of results) {
            if (r.EntityName !== 'MJ: Content Items') {
                output.push(r);
                continue;
            }

            const recIdLower = r.RecordID.toLowerCase();
            const promotion = resolvedEntityRecords.get(recIdLower);
            if (promotion) {
                const entityInfo = this.Provider.EntityByName(promotion.EntityName);
                const entityDisplayName = entityInfo?.DisplayName || promotion.EntityName;
                output.push({
                    ...r,
                    ID: promotion.RecordID,
                    EntityName: promotion.EntityName,
                    EntityDisplayName: entityDisplayName,
                    RecordID: promotion.RecordID,
                    ResultType: 'entity-record',
                    Title: `${entityDisplayName} Record`,
                    EntityIcon: entityInfo?.Icon ?? undefined
                });
            } else if (unpromotableItemIDs.has(recIdLower)) {
                continue;
            } else {
                output.push(r);
            }
        }

        return output;
    }

    // ────────────────────────────────────────────────────────────────
    // Private helpers
    // ────────────────────────────────────────────────────────────────

    /**
     * Add entity icons and display names for results that don't already have them.
     */
    private addEntityMetadata(results: SearchResultItem[], md: IMetadataProvider): void {
        for (const result of results) {
            const entity = md.EntityByName(result.EntityName);
            if (entity) {
                if (!result.EntityIcon && entity.Icon) {
                    result.EntityIcon = entity.Icon;
                }
                if (!result.EntityDisplayName) {
                    result.EntityDisplayName = entity.DisplayName || entity.Name;
                }
            } else if (!result.EntityDisplayName) {
                result.EntityDisplayName = result.EntityName;
            }
        }
    }

    /**
     * Resolve record names for results that don't already have them.
     * Vector results from enriched metadata should already have names;
     * this handles FTS, tag, and entity results.
     */
    private async resolveRecordNames(
        results: SearchResultItem[],
        md: IMetadataProvider,
        contextUser: UserInfo
    ): Promise<void> {
        const needsName = results.filter(r =>
            !r.RecordName ||
            r.RecordName === `${r.EntityName} Record` ||
            (r.EntityDisplayName && r.RecordName === `${r.EntityDisplayName} Record`) ||
            r.Title === `${r.EntityName} Record` ||
            (r.EntityDisplayName && r.Title === `${r.EntityDisplayName} Record`)
        );
        if (needsName.length === 0) return;

        try {
            const indexedInputs = this.buildNameInputs(needsName, results, md);
            if (indexedInputs.length === 0) return;

            const names = await md.GetEntityRecordNames(
                indexedInputs.map(ir => ir.Input),
                contextUser
            );

            for (let i = 0; i < names.length; i++) {
                const resultIndex = indexedInputs[i].ResultIndex;
                if (names[i].RecordName) {
                    results[resultIndex].RecordName = names[i].RecordName;
                    results[resultIndex].Title = names[i].RecordName;
                } else {
                    // Fallback if record name could not be resolved from DB: ensure Title doesn't use the raw schema-qualified name
                    const entityDisplayName = results[resultIndex].EntityDisplayName || results[resultIndex].EntityName;
                    if (results[resultIndex].Title === `${results[resultIndex].EntityName} Record`) {
                        results[resultIndex].Title = `${entityDisplayName} Record`;
                    }
                }
            }
        } catch (error) {
            LogError(`SearchEnricher: Error resolving record names: ${error}`);
            // Non-fatal - results still usable without names
        }
    }

    /**
     * Build EntityRecordNameInput entries for batch name resolution.
     */
    private buildNameInputs(
        needsName: SearchResultItem[],
        allResults: SearchResultItem[],
        md: IMetadataProvider
    ): { ResultIndex: number; Input: EntityRecordNameInput }[] {
        const indexed: { ResultIndex: number; Input: EntityRecordNameInput }[] = [];

        for (const r of needsName) {
            const resultIndex = allResults.indexOf(r);
            const entity = md.EntityByName(r.EntityName);
            if (!entity) continue;

            const key = new CompositeKey();
            key.LoadFromURLSegment(entity, r.RecordID);

            const input = new EntityRecordNameInput();
            input.EntityName = r.EntityName;
            input.CompositeKey = key;
            indexed.push({ ResultIndex: resultIndex, Input: input });
        }

        return indexed;
    }

    /**
     * Load tags from the TaggedItems entity for non-Content-Item results.
     */
    private async loadTaggedItemTags(
        results: SearchResultItem[],
        contextUser: UserInfo
    ): Promise<void> {
        if (results.length === 0) return;

        const md = this.Provider;
        const entityIdMap = new Map<string, string>();
        for (const r of results) {
            if (!entityIdMap.has(r.EntityName)) {
                const entityInfo = md.EntityByName(r.EntityName);
                if (entityInfo) {
                    entityIdMap.set(r.EntityName, entityInfo.ID);
                }
            }
        }
        if (entityIdMap.size === 0) return;

        const conditions: string[] = [];
        for (const r of results) {
            const entityID = entityIdMap.get(r.EntityName);
            if (!entityID) continue;
            conditions.push(`(EntityID='${entityID}' AND RecordID='${r.RecordID}')`);
        }
        if (conditions.length === 0) return;

        const rv = new RunView();
        const tagResult = await rv.RunView<{ EntityID: string; RecordID: string; Tag: string }>({
            EntityName: 'MJ: Tagged Items',
            ExtraFilter: conditions.join(' OR '),
            Fields: ['EntityID', 'RecordID', 'Tag'],
            ResultType: 'simple'
        }, contextUser);

        if (!tagResult.Success) return;

        const tagMap = new Map<string, string[]>();
        for (const ti of tagResult.Results) {
            const key = `${ti.EntityID}::${ti.RecordID}`;
            const tags = tagMap.get(key) ?? [];
            tags.push(ti.Tag);
            tagMap.set(key, tags);
        }

        for (const r of results) {
            const entityID = entityIdMap.get(r.EntityName);
            if (!entityID) continue;
            const key = `${entityID}::${r.RecordID}`;
            r.Tags = tagMap.get(key) ?? [];
        }
    }

    /**
     * Load tags from the ContentItemTag entity for Content Item results.
     */
    private async loadContentItemTags(
        results: SearchResultItem[],
        contextUser: UserInfo
    ): Promise<void> {
        if (results.length === 0) return;

        const recordIDs = results.map(r => `'${r.RecordID}'`);
        const rv = new RunView();
        const tagResult = await rv.RunView<{ ItemID: string; Tag: string }>({
            EntityName: 'MJ: Content Item Tags',
            ExtraFilter: `ItemID IN (${recordIDs.join(',')})`,
            Fields: ['ItemID', 'Tag'],
            ResultType: 'simple'
        }, contextUser);

        if (!tagResult.Success) return;

        const tagMap = new Map<string, string[]>();
        for (const ti of tagResult.Results) {
            const tags = tagMap.get(ti.ItemID) ?? [];
            tags.push(ti.Tag);
            tagMap.set(ti.ItemID, tags);
        }

        for (const r of results) {
            r.Tags = tagMap.get(r.RecordID) ?? tagMap.get(r.RecordID.toLowerCase()) ?? [];
        }
    }
}
