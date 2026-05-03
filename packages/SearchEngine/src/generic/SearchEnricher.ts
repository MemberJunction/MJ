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
        this.addEntityIcons(results, md);
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
     * Remove Content Item results that originated from Entity-type content sources.
     * These are redundant because the underlying entity records are already
     * vectorized and searchable directly.
     *
     * @param results - All search results
     * @param contextUser - The user performing the search
     * @returns Filtered results without redundant Content Item entries
     */
    public async ExcludeEntitySourcedContentItems(
        results: SearchResultItem[],
        contextUser: UserInfo
    ): Promise<SearchResultItem[]> {
        const contentItemResults = results.filter(r => r.EntityName === 'MJ: Content Items');
        if (contentItemResults.length === 0) return results;

        await KnowledgeHubMetadataEngine.Instance.Config(false, contextUser);
        const engine = KnowledgeHubMetadataEngine.Instance;

        const entitySourceType = engine.ContentSourceTypes.find(st => st.Name === 'Entity');
        if (!entitySourceType) return results;

        const entitySourceIDs = new Set(
            engine.ContentSources
                .filter(cs => UUIDsEqual(cs.ContentSourceTypeID, entitySourceType.ID))
                .map(cs => cs.ID.toLowerCase())
        );
        if (entitySourceIDs.size === 0) return results;

        return results.filter(r => {
            if (r.EntityName !== 'MJ: Content Items') return true;
            if (!r.RawMetadata) return true;
            try {
                const meta = JSON.parse(r.RawMetadata) as Record<string, string>;
                const sourceID = meta.ContentSourceID;
                if (!sourceID) return true;
                return !entitySourceIDs.has(sourceID.toLowerCase());
            } catch {
                return true;
            }
        });
    }

    // ────────────────────────────────────────────────────────────────
    // Private helpers
    // ────────────────────────────────────────────────────────────────

    /**
     * Add entity icons for results that don't already have them from vector metadata.
     */
    private addEntityIcons(results: SearchResultItem[], md: IMetadataProvider): void {
        for (const result of results) {
            if (!result.EntityIcon) {
                const entity = md.EntityByName(result.EntityName);
                if (entity?.Icon) {
                    result.EntityIcon = entity.Icon;
                }
            }
        }
    }

    /**
     * Resolve record names for results that don't already have them.
     * Vector results from enriched metadata should already have names;
     * this handles FTS and entity results.
     */
    private async resolveRecordNames(
        results: SearchResultItem[],
        md: IMetadataProvider,
        contextUser: UserInfo
    ): Promise<void> {
        const needsName = results.filter(r =>
            !r.RecordName || r.RecordName === `${r.EntityName} Record`
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
                if (names[i].RecordName) {
                    const resultIndex = indexedInputs[i].ResultIndex;
                    results[resultIndex].RecordName = names[i].RecordName;
                    results[resultIndex].Title = names[i].RecordName;
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
