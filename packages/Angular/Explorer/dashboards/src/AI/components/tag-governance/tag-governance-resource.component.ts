/**
 * Tag Governance — unified Knowledge Hub Classify dashboard.
 *
 * Single dashboard with a left-nav (per the in-dashboard navigation convention;
 * top nav belongs to the MJExplorer shell, not internal dashboard sections).
 *
 *   • Taxonomy   — tree on the left, governance + scope + synonyms detail form on the right.
 *   • Suggestions — Option C table + drawer for the human-in-the-loop review queue.
 *   • Tag Health  — three summary cards (merge / low-usage / wide-node) + threshold tuning + run history.
 *
 * All write actions route through the TagGovernanceResolver GraphQL mutations
 * (PromoteTagSuggestion / RejectTagSuggestion / RebuildTagEmbeddings / RunTagHealth)
 * so the server runs the full TagGovernanceEngine logic — re-pointing
 * ContentItemTag rows on merge, snapshotting parent scope on create-new, etc.
 */

import { Component, ChangeDetectorRef, AfterViewInit, OnDestroy, inject } from '@angular/core';
import { RunView } from '@memberjunction/core';
import { RegisterClass, NormalizeUUID, UUIDsEqual } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import {
    MJTagSuggestionEntity,
    MJTagEntity,
    MJTagScopeEntity,
    MJTagSynonymEntity,
    MJTagAuditLogEntity,
    ResourceData
} from '@memberjunction/core-entities';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { GraphQLAIClient, GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';

type Section = 'taxonomy' | 'suggestions' | 'health';

interface TagTreeNodeView {
    Tag: MJTagEntity;
    Children: TagTreeNodeView[];
    Expanded: boolean;
    DirectChildCount: number;
    ItemCount: number;
}

interface SuggestionRow {
    ID: string;
    ProposedName: string;
    Reason: string;
    BestMatchTagID: string | null;
    BestMatchName: string | null;
    BestMatchPath: string | null;
    BestMatchScore: number | null;
    SourceContentSourceID: string | null;
    SourceContentItemID: string | null;
    SourceText: string | null;
    CreatedAt: Date;
    Status: string;
    selected: boolean;
    dispositionInProgress: 'create-new' | 'merge' | 'reject' | null;
}

interface SynonymRow {
    ID: string;
    Synonym: string;
    Source: string;
    CreatedAt: Date;
}

interface ScopeRow {
    ID: string;
    ScopeEntityID: string;
    ScopeRecordID: string;
    /** Resolved display name when known, else the raw RecordID */
    DisplayName: string;
    EntityName: string;
    /** Date added (from __mj_CreatedAt) for "added 2 weeks ago" copy */
    CreatedAt: Date | null;
}

interface ScopeOption {
    EntityID: string;
    EntityName: string;
    RecordID: string;
    DisplayName: string;
    Subtext?: string;
    Disabled?: boolean;
    DisabledReason?: string;
}

interface HealthRunHistoryRow {
    When: Date;
    Trigger: string;
    TagsScanned: number;
    Merge: number;
    LowUsage: number;
    WideNode: number;
    DurationMs: number;
}

interface MergeCandidatePreview { ProposedName: string; BestMatchName: string; Score: number }
interface LowUsagePreview { Name: string; Usage: number }
interface WideNodePreview { Name: string; ChildCount: number; Threshold: number }

@RegisterClass(BaseResourceComponent, 'TagGovernance')
@Component({
    selector: 'mj-tag-governance',
    templateUrl: './tag-governance-resource.component.html',
    styleUrls: ['./tag-governance-resource.component.css'],
    standalone: false,
})
export class TagGovernanceResourceComponent extends BaseResourceComponent implements AfterViewInit, OnDestroy {
    private readonly cdr = inject(ChangeDetectorRef);
    public readonly notify = MJNotificationService.Instance;

    public ActiveSection: Section = 'taxonomy';

    // ------ Loading / global -------------------------------------------------
    public IsLoading = true;
    public ErrorMessage: string | null = null;

    // ------ Cached data ------------------------------------------------------
    public TagsByID = new Map<string, MJTagEntity>();
    public TagsByParentID = new Map<string | null, MJTagEntity[]>();
    public AllScopes: MJTagScopeEntity[] = [];
    public ScopesByTagID = new Map<string, MJTagScopeEntity[]>();
    public AllSynonyms: MJTagSynonymEntity[] = [];
    public SynonymsByTagID = new Map<string, MJTagSynonymEntity[]>();
    public TaggedItemCountsByTagID = new Map<string, number>();
    public AuditLogsByTagID = new Map<string, MJTagAuditLogEntity[]>();

    // Pretty entity-name resolution for scope rows
    public EntityNameByID = new Map<string, string>();
    public RecordDisplayName = new Map<string, string>(); // key = `${entityID}|${recordID}`

    // ------ Taxonomy section -------------------------------------------------
    public Tree: TagTreeNodeView[] = [];
    public TreeFilter = '';
    public SelectedTag: MJTagEntity | null = null;
    public SelectedTagSavingField: Record<string, boolean> = {};
    public SelectedTagSynonyms: SynonymRow[] = [];
    public SelectedTagScopes: ScopeRow[] = [];
    public NewSynonymName = '';
    public NewSynonymSource: 'Manual' | 'Imported' | 'Merged' | 'LLM' = 'Manual';

    // Scope dialog (dual-pane)
    public ScopeDialogOpen = false;
    public ScopeDialogEntities: Array<{ ID: string; Name: string }> = [];
    public ScopeDialogActiveEntityID: string | null = null;
    public ScopeDialogAvailable: ScopeOption[] = [];
    public ScopeDialogInScope: ScopeOption[] = [];
    public ScopeDialogAvailSelected = new Set<string>();
    public ScopeDialogInScopeSelected = new Set<string>();
    public ScopeDialogSearchAvail = '';
    public ScopeDialogSearchInScope = '';
    public ScopeDialogSaving = false;

    // ------ Suggestions section ----------------------------------------------
    public SuggestionRows: SuggestionRow[] = [];
    public SuggestionRowsFiltered: SuggestionRow[] = [];
    public SuggestionFilterReason = '';
    public SuggestionFilterMinScore: number | null = null;
    public SuggestionSearch = '';
    public SuggestionSelected: SuggestionRow | null = null;
    public SuggestionSelectedAffectedItems: Array<{ Title: string; Source: string; CreatedAt: Date }> = [];
    public SuggestionSelectedAffectedCount = 0;
    public BulkInProgress = false;
    public ReasonOptions = [
        'BelowThreshold', 'ConstrainedMode', 'AmbiguousMatch', 'ParentFrozen', 'AutoGrowDisabled',
        'MaxChildrenExceeded', 'MaxDepthExceeded', 'BelowMinWeight', 'RequiresReview',
        'MaxItemTagsExceeded', 'MergeCandidate', 'LowUsage', 'WideNode',
    ];

    // ------ Health section ---------------------------------------------------
    public HealthThresholds = {
        minCoOccurrence: 10,
        minNameSimilarity: 0.5,
        minEmbeddingSimilarity: 0.85,
        maxUsage: 3,
        maxImplicitChildren: 25,
    };
    public HealthRunning = false;
    public LastHealthSummary: {
        mergeCount: number; lowUsageCount: number; wideNodeCount: number; durationMs: number; runAt: Date | null;
    } = { mergeCount: 0, lowUsageCount: 0, wideNodeCount: 0, durationMs: 0, runAt: null };

    public MergeCandidates: MergeCandidatePreview[] = [];
    public LowUsageCandidates: LowUsagePreview[] = [];
    public WideNodeCandidates: WideNodePreview[] = [];
    public HealthRunHistory: HealthRunHistoryRow[] = [];
    public TotalTagsScanned = 0;
    public RebuildEmbeddingsRunning = false;

    public async GetResourceDisplayName(_data: ResourceData): Promise<string> {
        return 'Tag Governance';
    }
    public async GetResourceIconClass(_data: ResourceData): Promise<string> {
        return 'fa-solid fa-sitemap';
    }

    public async ngAfterViewInit(): Promise<void> {
        await this.loadAll();
        this.NotifyLoadComplete();

        const params = this.GetQueryParams();
        if (params['section'] === 'taxonomy' || params['section'] === 'suggestions' || params['section'] === 'health') {
            this.ActiveSection = params['section'];
        }
        if (params['suggestionId']) {
            const row = this.SuggestionRows.find(s => UUIDsEqual(s.ID, params['suggestionId']));
            if (row) this.SelectSuggestion(row);
        }
        if (params['tagId']) {
            const tag = this.TagsByID.get(params['tagId']);
            if (tag) await this.SelectTag(tag);
        }

        this.publishAgentContext();
        this.publishAgentTools();
    }

    protected override OnQueryParamsChanged(params: Record<string, string>, _source: 'popstate' | 'deeplink'): void {
        if (params['section'] && params['section'] !== this.ActiveSection) {
            this.ActiveSection = params['section'] as Section;
            this.cdr.detectChanges();
        }
    }

    public override ngOnDestroy(): void {
        super.ngOnDestroy?.();
    }

    // =========================================================================
    // Data loading
    // =========================================================================

    public async loadAll(): Promise<void> {
        this.IsLoading = true;
        this.ErrorMessage = null;
        this.cdr.detectChanges();

        try {
            const rv = RunView.FromMetadataProvider(this.ProviderToUse);
            const [tagsRes, scopesRes, synsRes, sugsRes, taggedItemsRes, citRes] = await rv.RunViews([
                { EntityName: 'MJ: Tags', OrderBy: 'ParentID, Name', ResultType: 'entity_object' },
                { EntityName: 'MJ: Tag Scopes', ResultType: 'entity_object' },
                { EntityName: 'MJ: Tag Synonyms', ResultType: 'entity_object' },
                { EntityName: 'MJ: Tag Suggestions', ExtraFilter: `Status='Pending'`, OrderBy: '__mj_CreatedAt DESC', ResultType: 'simple', MaxRows: 1000 },
                { EntityName: 'MJ: Tagged Items', Fields: ['TagID'], ResultType: 'simple' },
                { EntityName: 'MJ: Content Item Tags', ExtraFilter: `TagID IS NOT NULL`, Fields: ['TagID'], ResultType: 'simple' },
            ], this.ProviderToUse?.CurrentUser);

            if (!tagsRes.Success) throw new Error(`Tags: ${tagsRes.ErrorMessage}`);

            // Build tag indexes
            this.TagsByID.clear();
            this.TagsByParentID.clear();
            for (const tag of tagsRes.Results as MJTagEntity[]) {
                this.TagsByID.set(tag.ID, tag);
                const parentKey = tag.ParentID ?? null;
                const list = this.TagsByParentID.get(parentKey) ?? [];
                list.push(tag);
                this.TagsByParentID.set(parentKey, list);
            }

            // Scope index
            this.AllScopes = scopesRes.Success ? (scopesRes.Results as MJTagScopeEntity[]) : [];
            this.ScopesByTagID.clear();
            for (const sc of this.AllScopes) {
                const list = this.ScopesByTagID.get(sc.TagID) ?? [];
                list.push(sc);
                this.ScopesByTagID.set(sc.TagID, list);
            }

            // Synonym index
            this.AllSynonyms = synsRes.Success ? (synsRes.Results as MJTagSynonymEntity[]) : [];
            this.SynonymsByTagID.clear();
            for (const syn of this.AllSynonyms) {
                const list = this.SynonymsByTagID.get(syn.TagID) ?? [];
                list.push(syn);
                this.SynonymsByTagID.set(syn.TagID, list);
            }

            // Tagged-item counts (combined: TaggedItem + ContentItemTag)
            this.TaggedItemCountsByTagID.clear();
            const bumpCount = (id: string | null | undefined) => {
                if (!id) return;
                const k = NormalizeUUID(id);
                this.TaggedItemCountsByTagID.set(k, (this.TaggedItemCountsByTagID.get(k) ?? 0) + 1);
            };
            if (taggedItemsRes.Success) for (const r of taggedItemsRes.Results as Array<{ TagID: string }>) bumpCount(r.TagID);
            if (citRes.Success) for (const r of citRes.Results as Array<{ TagID: string }>) bumpCount(r.TagID);

            // Resolve scope entity names + record display names so the chips look human
            await this.resolveScopeEntityNames();
            await this.resolveScopeRecordDisplayNames();

            // Suggestions
            await this.loadSuggestionRows(sugsRes);
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            this.ErrorMessage = msg;
            this.notify.CreateSimpleNotification(`Failed to load tag governance data: ${msg}`, 'error', 6000);
        } finally {
            this.IsLoading = false;
            this.rebuildTree();
            this.computeHealthCandidates();
            this.cdr.detectChanges();
        }
    }

    private async resolveScopeEntityNames(): Promise<void> {
        const entityIDs = new Set(this.AllScopes.map(s => s.ScopeEntityID));
        if (entityIDs.size === 0) return;
        const md = this.ProviderToUse;
        for (const id of entityIDs) {
            // Provider entity list is the cheapest source.
            const ent = (md as unknown as { Entities?: Array<{ ID: string; Name: string }> }).Entities?.find?.(e => UUIDsEqual(e.ID, id));
            if (ent) this.EntityNameByID.set(id, ent.Name);
        }
    }

    /**
     * For each unique (EntityID, RecordID) referenced by a TagScope row, look up
     * a sensible display name. Strategy: query each entity once for the full set
     * of records it owns, choosing the entity's NameField (or first string field)
     * as the human label. Falls back to the raw RecordID when no name field exists.
     */
    private async resolveScopeRecordDisplayNames(): Promise<void> {
        const byEntity = new Map<string, Set<string>>();
        for (const s of this.AllScopes) {
            const set = byEntity.get(s.ScopeEntityID) ?? new Set<string>();
            set.add(s.ScopeRecordID);
            byEntity.set(s.ScopeEntityID, set);
        }
        if (byEntity.size === 0) return;

        const md = this.ProviderToUse;
        const entitiesMeta = (md as unknown as { Entities?: Array<{ ID: string; Name: string; NameField?: string; Fields?: Array<{ Name: string; Type: string; IsPrimaryKey?: boolean }> }> }).Entities ?? [];
        const rv = RunView.FromMetadataProvider(this.ProviderToUse);

        const queries = Array.from(byEntity.entries()).map(([entityID, recordIDs]) => {
            const meta = entitiesMeta.find(e => UUIDsEqual(e.ID, entityID));
            if (!meta) return null;
            const nameField = meta.NameField
                ?? meta.Fields?.find(f => f.Type?.toLowerCase().includes('char') && !f.IsPrimaryKey)?.Name
                ?? null;
            const ids = Array.from(recordIDs).map(id => `'${id.replace(/'/g, "''")}'`).join(',');
            return { entityID, nameField, EntityName: meta.Name, ExtraFilter: `ID IN (${ids})`, Fields: nameField ? ['ID', nameField] : ['ID'], ResultType: 'simple' as const };
        }).filter((x): x is NonNullable<typeof x> => x != null);

        if (queries.length === 0) return;

        const results = await rv.RunViews(queries.map(q => ({ EntityName: q.EntityName, ExtraFilter: q.ExtraFilter, Fields: q.Fields, ResultType: q.ResultType })), this.ProviderToUse?.CurrentUser);
        for (let i = 0; i < queries.length; i++) {
            const q = queries[i];
            const r = results[i];
            if (!r?.Success || !q.nameField) continue;
            for (const row of r.Results as Array<Record<string, string>>) {
                const id = row['ID'];
                const name = row[q.nameField];
                if (id && name) {
                    this.RecordDisplayName.set(`${q.entityID}|${id}`, name);
                }
            }
        }
    }

    private async loadSuggestionRows(sugsRes: { Success: boolean; Results: unknown[] }): Promise<void> {
        if (!sugsRes.Success) {
            this.SuggestionRows = [];
            this.applySuggestionFilters();
            return;
        }
        const raw = sugsRes.Results as Array<{
            ID: string;
            ProposedName: string;
            Reason: string;
            BestMatchTagID: string | null;
            BestMatchScore: number | null;
            SourceContentSourceID: string | null;
            SourceContentItemID: string | null;
            SourceText: string | null;
            __mj_CreatedAt: string | Date;
            Status: string;
        }>;

        this.SuggestionRows = raw.map(r => {
            const matchTag = r.BestMatchTagID ? this.TagsByID.get(r.BestMatchTagID) : undefined;
            return {
                ID: r.ID,
                ProposedName: r.ProposedName,
                Reason: r.Reason,
                BestMatchTagID: r.BestMatchTagID,
                BestMatchName: matchTag?.Name ?? null,
                BestMatchPath: matchTag ? this.computeTagPath(matchTag) : null,
                BestMatchScore: r.BestMatchScore,
                SourceContentSourceID: r.SourceContentSourceID,
                SourceContentItemID: r.SourceContentItemID,
                SourceText: r.SourceText,
                CreatedAt: new Date(r.__mj_CreatedAt as string),
                Status: r.Status,
                selected: false,
                dispositionInProgress: null,
            };
        });
        this.applySuggestionFilters();
    }

    public computeTagPath(tag: MJTagEntity): string {
        const parts: string[] = [tag.Name];
        let cursor: MJTagEntity | undefined = tag.ParentID ? this.TagsByID.get(tag.ParentID) : undefined;
        const guard = new Set<string>();
        while (cursor && !guard.has(cursor.ID) && parts.length < 8) {
            guard.add(cursor.ID);
            parts.unshift(cursor.Name);
            cursor = cursor.ParentID ? this.TagsByID.get(cursor.ParentID) : undefined;
        }
        return parts.join(' › ');
    }

    /** UUID normalizer exposed for template binding (avoids re-importing the helper). */
    public NormalizeUUID(id: string | null | undefined): string {
        return id ? NormalizeUUID(id) : '';
    }

    /** How many synonyms on the selected tag are awaiting human approval (Source='LLM'). */
    public pendingSynonymCount(): number {
        return this.SelectedTagSynonyms.filter(s => s.Source === 'LLM').length;
    }

    // =========================================================================
    // Tree building (Taxonomy section)
    // =========================================================================

    public rebuildTree(): void {
        const filter = this.TreeFilter.trim().toLowerCase();
        const matches = (tag: MJTagEntity): boolean => {
            if (!filter) return true;
            return tag.Name.toLowerCase().includes(filter) || (tag.DisplayName?.toLowerCase().includes(filter) ?? false);
        };
        // When a filter is set, also include ancestors of matches so the user
        // sees context for the matching node.
        const ancestorIDs = new Set<string>();
        if (filter) {
            for (const tag of this.TagsByID.values()) {
                if (matches(tag)) {
                    let cursor: string | null | undefined = tag.ParentID;
                    while (cursor) {
                        ancestorIDs.add(cursor);
                        cursor = this.TagsByID.get(cursor)?.ParentID;
                    }
                }
            }
        }

        const buildNode = (tag: MJTagEntity, depth: number): TagTreeNodeView | null => {
            const isMatch = matches(tag);
            const isAncestor = ancestorIDs.has(tag.ID);
            const children = (this.TagsByParentID.get(tag.ID) ?? [])
                .map(c => buildNode(c, depth + 1))
                .filter((x): x is TagTreeNodeView => x != null);
            if (!filter || isMatch || isAncestor || children.length > 0) {
                return {
                    Tag: tag,
                    Children: children,
                    Expanded: filter ? true : depth < 1,
                    DirectChildCount: this.TagsByParentID.get(tag.ID)?.length ?? 0,
                    ItemCount: this.TaggedItemCountsByTagID.get(NormalizeUUID(tag.ID)) ?? 0,
                };
            }
            return null;
        };

        const roots = (this.TagsByParentID.get(null) ?? []);
        this.Tree = roots
            .map(t => buildNode(t, 0))
            .filter((x): x is TagTreeNodeView => x != null);
    }

    public ToggleNode(node: TagTreeNodeView, e: Event): void {
        e.stopPropagation();
        node.Expanded = !node.Expanded;
        this.cdr.detectChanges();
    }

    public async SelectTag(tag: MJTagEntity): Promise<void> {
        this.SelectedTag = tag;
        this.SelectedTagSavingField = {};
        this.UpdateQueryParams({ tagId: tag.ID });

        // Synonyms for the selected tag
        const syns = this.SynonymsByTagID.get(tag.ID) ?? [];
        this.SelectedTagSynonyms = syns.map(s => ({
            ID: s.ID,
            Synonym: s.Synonym,
            Source: s.Source,
            CreatedAt: new Date(s.__mj_CreatedAt as unknown as string),
        }));

        // Scope rows for the selected tag
        const scopes = this.ScopesByTagID.get(tag.ID) ?? [];
        this.SelectedTagScopes = scopes.map(s => ({
            ID: s.ID,
            ScopeEntityID: s.ScopeEntityID,
            ScopeRecordID: s.ScopeRecordID,
            EntityName: this.EntityNameByID.get(s.ScopeEntityID) ?? 'Unknown entity',
            DisplayName: this.RecordDisplayName.get(`${s.ScopeEntityID}|${s.ScopeRecordID}`) ?? s.ScopeRecordID,
            CreatedAt: s.__mj_CreatedAt ? new Date(s.__mj_CreatedAt as unknown as string) : null,
        }));

        this.cdr.detectChanges();
    }

    // =========================================================================
    // Tag detail edits — governance toggles, sliders, name/desc save
    // =========================================================================

    public IsGlobalLocked(): boolean {
        return this.SelectedTag != null && this.SelectedTagScopes.length > 0;
    }

    public async ToggleGovernanceFlag(field: 'AllowAutoGrow' | 'IsFrozen' | 'RequiresReview' | 'IsGlobal'): Promise<void> {
        if (!this.SelectedTag) return;
        if (field === 'IsGlobal' && this.IsGlobalLocked()) {
            this.notify.CreateSimpleNotification(
                'Cannot toggle Global while scope rows exist. Remove all scope rows first or use the Scope dialog.',
                'warning', 5000
            );
            return;
        }
        const tag = this.SelectedTag;
        const newValue = !tag[field];
        await this.persistTagField(tag, field, newValue);
    }

    public async SaveSelectedTagText(field: 'Name' | 'DisplayName' | 'Description', value: string): Promise<void> {
        if (!this.SelectedTag) return;
        await this.persistTagField(this.SelectedTag, field, value);
    }

    public async SaveSelectedTagNumber(field: 'MaxChildren' | 'MaxDescendantDepth' | 'MinWeight', raw: string): Promise<void> {
        if (!this.SelectedTag) return;
        const trimmed = raw.trim();
        const value: number | null = trimmed === '' ? null : Number(trimmed);
        if (value !== null && !Number.isFinite(value)) {
            this.notify.CreateSimpleNotification(`"${raw}" is not a valid number for ${field}.`, 'error', 4000);
            return;
        }
        await this.persistTagField(this.SelectedTag, field, value);
    }

    private async persistTagField(tag: MJTagEntity, field: keyof MJTagEntity, value: unknown): Promise<void> {
        this.SelectedTagSavingField[field as string] = true;
        this.cdr.detectChanges();
        try {
            const md = this.ProviderToUse;
            const fresh = await md.GetEntityObject<MJTagEntity>('MJ: Tags', this.ProviderToUse?.CurrentUser);
            const loaded = await fresh.Load(tag.ID);
            if (!loaded) throw new Error(`Failed to load tag ${tag.ID}`);
            (fresh as unknown as Record<string, unknown>)[field as string] = value;
            const ok = await fresh.Save();
            if (!ok) throw new Error(fresh.LatestResult?.CompleteMessage ?? 'Save failed');
            // Mirror the change into the cached entity so the UI updates without a full reload.
            (tag as unknown as Record<string, unknown>)[field as string] = value;
            this.notify.CreateSimpleNotification(`Saved ${String(field)} on "${tag.Name}".`, 'info', 1800);
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            this.notify.CreateSimpleNotification(`Failed to save ${String(field)}: ${msg}`, 'error', 5000);
        } finally {
            this.SelectedTagSavingField[field as string] = false;
            this.cdr.detectChanges();
        }
    }

    // =========================================================================
    // Synonyms (inline-on-tag-form)
    // =========================================================================

    public async AddSynonym(): Promise<void> {
        const text = this.NewSynonymName.trim();
        if (!text || !this.SelectedTag) return;
        // De-dupe client-side
        if (this.SelectedTagSynonyms.some(s => s.Synonym.toLowerCase() === text.toLowerCase())) {
            this.notify.CreateSimpleNotification(`"${text}" is already a synonym for this tag.`, 'warning', 3000);
            return;
        }
        try {
            const md = this.ProviderToUse;
            const syn = await md.GetEntityObject<MJTagSynonymEntity>('MJ: Tag Synonyms', this.ProviderToUse?.CurrentUser);
            syn.NewRecord();
            syn.TagID = this.SelectedTag.ID;
            syn.Synonym = text;
            syn.Source = this.NewSynonymSource;
            const ok = await syn.Save();
            if (!ok) throw new Error(syn.LatestResult?.CompleteMessage ?? 'Save failed');
            // Update local index + visible list
            const list = this.SynonymsByTagID.get(this.SelectedTag.ID) ?? [];
            list.push(syn);
            this.SynonymsByTagID.set(this.SelectedTag.ID, list);
            this.AllSynonyms.push(syn);
            this.SelectedTagSynonyms = [
                ...this.SelectedTagSynonyms,
                { ID: syn.ID, Synonym: syn.Synonym, Source: syn.Source, CreatedAt: new Date() }
            ];
            this.NewSynonymName = '';
            this.notify.CreateSimpleNotification(`Added synonym "${text}".`, 'info', 2000);
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            this.notify.CreateSimpleNotification(`Failed to add synonym: ${msg}`, 'error', 5000);
        } finally {
            this.cdr.detectChanges();
        }
    }

    public async RemoveSynonym(row: SynonymRow): Promise<void> {
        if (!this.SelectedTag) return;
        if (!confirm(`Remove synonym "${row.Synonym}"?`)) return;
        try {
            const md = this.ProviderToUse;
            const syn = await md.GetEntityObject<MJTagSynonymEntity>('MJ: Tag Synonyms', this.ProviderToUse?.CurrentUser);
            const loaded = await syn.Load(row.ID);
            if (!loaded) throw new Error('Synonym not found.');
            const ok = await syn.Delete();
            if (!ok) throw new Error(syn.LatestResult?.CompleteMessage ?? 'Delete failed');
            this.SelectedTagSynonyms = this.SelectedTagSynonyms.filter(s => !UUIDsEqual(s.ID, row.ID));
            const list = (this.SynonymsByTagID.get(this.SelectedTag.ID) ?? []).filter(s => !UUIDsEqual(s.ID, row.ID));
            this.SynonymsByTagID.set(this.SelectedTag.ID, list);
            this.AllSynonyms = this.AllSynonyms.filter(s => !UUIDsEqual(s.ID, row.ID));
            this.notify.CreateSimpleNotification(`Removed synonym "${row.Synonym}".`, 'info', 1800);
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            this.notify.CreateSimpleNotification(`Failed to remove synonym: ${msg}`, 'error', 5000);
        } finally {
            this.cdr.detectChanges();
        }
    }

    // =========================================================================
    // Scope dialog
    // =========================================================================

    public async OpenScopeDialog(): Promise<void> {
        if (!this.SelectedTag) return;
        const md = this.ProviderToUse;
        const entitiesMeta = (md as unknown as { Entities?: Array<{ ID: string; Name: string; AllowAllRowsAPI?: boolean }> }).Entities ?? [];

        // Default to whichever entity already has scope rows, falling back to
        // "Companies" when present, then the first user-friendly entity.
        const used = new Set(this.SelectedTagScopes.map(s => s.ScopeEntityID));
        this.ScopeDialogEntities = entitiesMeta
            .filter(e => used.has(e.ID) || e.Name.toLowerCase() === 'companies' || e.Name.toLowerCase() === 'tenants' || e.Name.toLowerCase() === 'organizations')
            .map(e => ({ ID: e.ID, Name: e.Name }));

        if (this.ScopeDialogEntities.length === 0 && entitiesMeta.length > 0) {
            // Fall back to first entity so the dialog is at least usable
            const first = entitiesMeta[0];
            this.ScopeDialogEntities = [{ ID: first.ID, Name: first.Name }];
        }

        this.ScopeDialogActiveEntityID = this.ScopeDialogEntities[0]?.ID ?? null;
        this.ScopeDialogAvailSelected.clear();
        this.ScopeDialogInScopeSelected.clear();
        await this.refreshScopeDialogPanes();
        this.ScopeDialogOpen = true;
        this.cdr.detectChanges();
    }

    public CloseScopeDialog(): void {
        this.ScopeDialogOpen = false;
        this.cdr.detectChanges();
    }

    public async OnScopeDialogEntityChange(entityID: string): Promise<void> {
        this.ScopeDialogActiveEntityID = entityID;
        this.ScopeDialogAvailSelected.clear();
        this.ScopeDialogInScopeSelected.clear();
        await this.refreshScopeDialogPanes();
        this.cdr.detectChanges();
    }

    private async refreshScopeDialogPanes(): Promise<void> {
        const entityID = this.ScopeDialogActiveEntityID;
        const tag = this.SelectedTag;
        if (!entityID || !tag) {
            this.ScopeDialogAvailable = [];
            this.ScopeDialogInScope = [];
            return;
        }
        const md = this.ProviderToUse;
        const entitiesMeta = (md as unknown as { Entities?: Array<{ ID: string; Name: string; NameField?: string; Fields?: Array<{ Name: string; Type: string; IsPrimaryKey?: boolean }> }> }).Entities ?? [];
        const meta = entitiesMeta.find(e => UUIDsEqual(e.ID, entityID));
        if (!meta) { this.ScopeDialogAvailable = []; this.ScopeDialogInScope = []; return; }
        const nameField = meta.NameField
            ?? meta.Fields?.find(f => f.Type?.toLowerCase().includes('char') && !f.IsPrimaryKey)?.Name
            ?? null;
        const fields = nameField ? ['ID', nameField] : ['ID'];

        const rv = RunView.FromMetadataProvider(this.ProviderToUse);
        const result = await rv.RunView<Record<string, string>>({
            EntityName: meta.Name,
            Fields: fields,
            ResultType: 'simple',
            MaxRows: 1000,
            OrderBy: nameField ? nameField : 'ID',
        }, this.ProviderToUse?.CurrentUser);
        const rows = result.Success ? result.Results : [];

        const inScopeIDs = new Set(
            this.SelectedTagScopes.filter(s => s.ScopeEntityID === entityID).map(s => s.ScopeRecordID)
        );

        // Parent-scope subset rule: child cannot be wider than parent. We
        // resolve parent (recursively up to a non-global ancestor) and disable
        // anything that wouldn't be in the parent's scope.
        const parentScopeKeys = this.computeNearestNonGlobalAncestorScope(tag);
        const parentInScopeForEntity = parentScopeKeys
            ? new Set(parentScopeKeys.filter(k => k.startsWith(`${entityID}|`)).map(k => k.split('|')[1]))
            : null; // null = no constraint

        const avail: ScopeOption[] = [];
        const inScope: ScopeOption[] = [];
        for (const r of rows) {
            const id = r['ID'];
            if (!id) continue;
            const display = nameField ? (r[nameField] ?? id) : id;
            const opt: ScopeOption = {
                EntityID: entityID,
                EntityName: meta.Name,
                RecordID: id,
                DisplayName: display,
                Subtext: nameField ? undefined : 'no display field',
            };
            if (inScopeIDs.has(id)) {
                inScope.push(opt);
            } else {
                if (parentInScopeForEntity && !parentInScopeForEntity.has(id)) {
                    opt.Disabled = true;
                    opt.DisabledReason = 'Parent scope conflict — child cannot be wider than parent.';
                }
                avail.push(opt);
            }
        }
        this.ScopeDialogAvailable = avail;
        this.ScopeDialogInScope = inScope;
    }

    /**
     * Walks the parent chain looking for the first non-global ancestor and
     * returns its scope keys (`entityID|recordID`). Returns null when no such
     * ancestor exists (i.e., tree is fully global above this tag).
     */
    private computeNearestNonGlobalAncestorScope(tag: MJTagEntity): string[] | null {
        let cursor: MJTagEntity | undefined = tag.ParentID ? this.TagsByID.get(tag.ParentID) : undefined;
        const guard = new Set<string>();
        while (cursor) {
            if (guard.has(cursor.ID)) break;
            guard.add(cursor.ID);
            if (!cursor.IsGlobal) {
                const scopes = this.ScopesByTagID.get(cursor.ID) ?? [];
                if (scopes.length > 0) {
                    return scopes.map(s => `${s.ScopeEntityID}|${s.ScopeRecordID}`);
                }
            }
            cursor = cursor.ParentID ? this.TagsByID.get(cursor.ParentID) : undefined;
        }
        return null;
    }

    public ToggleAvailRow(opt: ScopeOption, e: Event): void {
        e.stopPropagation();
        if (opt.Disabled) return;
        const k = opt.RecordID;
        if (this.ScopeDialogAvailSelected.has(k)) this.ScopeDialogAvailSelected.delete(k);
        else this.ScopeDialogAvailSelected.add(k);
        this.cdr.detectChanges();
    }
    public ToggleInScopeRow(opt: ScopeOption, e: Event): void {
        e.stopPropagation();
        const k = opt.RecordID;
        if (this.ScopeDialogInScopeSelected.has(k)) this.ScopeDialogInScopeSelected.delete(k);
        else this.ScopeDialogInScopeSelected.add(k);
        this.cdr.detectChanges();
    }

    public AddSelectedToScope(): void { this.moveScope(this.ScopeDialogAvailSelected, this.ScopeDialogAvailable, this.ScopeDialogInScope, false); }
    public AddAllToScope(): void { this.moveScope(new Set(this.ScopeDialogAvailable.filter(o => !o.Disabled).map(o => o.RecordID)), this.ScopeDialogAvailable, this.ScopeDialogInScope, false); }
    public RemoveSelectedFromScope(): void { this.moveScope(this.ScopeDialogInScopeSelected, this.ScopeDialogInScope, this.ScopeDialogAvailable, true); }
    public RemoveAllFromScope(): void { this.moveScope(new Set(this.ScopeDialogInScope.map(o => o.RecordID)), this.ScopeDialogInScope, this.ScopeDialogAvailable, true); }

    private moveScope(selectedKeys: Set<string>, from: ScopeOption[], to: ScopeOption[], comingBackFromInScope: boolean): void {
        const moved: ScopeOption[] = [];
        for (let i = from.length - 1; i >= 0; i--) {
            if (selectedKeys.has(from[i].RecordID)) {
                moved.push(from[i]);
                from.splice(i, 1);
            }
        }
        for (const m of moved) {
            // When moving back to "available", clear any disabled state — it
            // can only be set by the parent-scope-conflict check, which only
            // applies to records the user is *adding*, not ones they previously
            // had assigned and are now removing. We re-evaluate next refresh.
            if (comingBackFromInScope) { m.Disabled = false; m.DisabledReason = undefined; }
            to.unshift(m);
        }
        selectedKeys.clear();
        this.cdr.detectChanges();
    }

    public async SaveScopeDialog(): Promise<void> {
        const tag = this.SelectedTag;
        const entityID = this.ScopeDialogActiveEntityID;
        if (!tag || !entityID) return;
        this.ScopeDialogSaving = true;
        this.cdr.detectChanges();
        try {
            const md = this.ProviderToUse;
            const ctx = this.ProviderToUse?.CurrentUser;
            const desiredIDs = new Set(this.ScopeDialogInScope.map(o => o.RecordID));
            const currentRows = this.AllScopes.filter(s => UUIDsEqual(s.TagID, tag.ID) && UUIDsEqual(s.ScopeEntityID, entityID));
            const currentIDs = new Set(currentRows.map(s => s.ScopeRecordID));

            // Inserts
            const toAdd = Array.from(desiredIDs).filter(id => !currentIDs.has(id));
            // Deletes
            const toRemove = currentRows.filter(s => !desiredIDs.has(s.ScopeRecordID));

            // If we're about to add scope rows AND tag is currently global,
            // first flip IsGlobal=0 (server invariant otherwise rejects).
            if (toAdd.length > 0 && tag.IsGlobal) {
                await this.persistTagField(tag, 'IsGlobal', false);
            }

            for (const recID of toAdd) {
                const sc = await md.GetEntityObject<MJTagScopeEntity>('MJ: Tag Scopes', ctx);
                sc.NewRecord();
                sc.TagID = tag.ID;
                sc.ScopeEntityID = entityID;
                sc.ScopeRecordID = recID;
                const ok = await sc.Save();
                if (!ok) throw new Error(`Failed adding scope ${recID}: ${sc.LatestResult?.CompleteMessage ?? 'unknown'}`);
                this.AllScopes.push(sc);
                const list = this.ScopesByTagID.get(tag.ID) ?? [];
                list.push(sc);
                this.ScopesByTagID.set(tag.ID, list);
            }
            for (const sc of toRemove) {
                const ok = await sc.Delete();
                if (!ok) throw new Error(`Failed removing scope ${sc.ID}: ${sc.LatestResult?.CompleteMessage ?? 'unknown'}`);
                this.AllScopes = this.AllScopes.filter(x => !UUIDsEqual(x.ID, sc.ID));
                const list = (this.ScopesByTagID.get(tag.ID) ?? []).filter(x => !UUIDsEqual(x.ID, sc.ID));
                this.ScopesByTagID.set(tag.ID, list);
            }

            // If after all removals the tag has no scope rows at all, leave
            // IsGlobal as-is (admin must explicitly promote to global). The
            // invariant stays consistent — empty scope + IsGlobal=0 is allowed.

            await this.SelectTag(tag); // refresh visible synonyms + scopes
            this.notify.CreateSimpleNotification(`Saved scope changes (+${toAdd.length} / -${toRemove.length}).`, 'info', 2500);
            this.ScopeDialogOpen = false;
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            this.notify.CreateSimpleNotification(`Failed to save scope: ${msg}`, 'error', 6000);
        } finally {
            this.ScopeDialogSaving = false;
            this.cdr.detectChanges();
        }
    }

    // =========================================================================
    // Suggestions section
    // =========================================================================

    public applySuggestionFilters(): void {
        const reason = this.SuggestionFilterReason;
        const minScore = this.SuggestionFilterMinScore;
        const search = this.SuggestionSearch.trim().toLowerCase();
        this.SuggestionRowsFiltered = this.SuggestionRows.filter(r => {
            if (reason && r.Reason !== reason) return false;
            if (minScore != null && (r.BestMatchScore == null || r.BestMatchScore < minScore)) return false;
            if (search) {
                const haystack = `${r.ProposedName} ${r.BestMatchName ?? ''} ${r.SourceText ?? ''}`.toLowerCase();
                if (!haystack.includes(search)) return false;
            }
            return true;
        });
        this.cdr.detectChanges();
    }

    public ToggleSuggestionSelected(row: SuggestionRow, ev: Event): void {
        ev.stopPropagation();
        row.selected = !row.selected;
        this.cdr.detectChanges();
    }

    public ToggleAllSuggestions(checked: boolean): void {
        for (const r of this.SuggestionRowsFiltered) r.selected = checked;
        this.cdr.detectChanges();
    }

    public SelectedSuggestionCount(): number {
        return this.SuggestionRowsFiltered.filter(r => r.selected).length;
    }

    public SelectSuggestion(row: SuggestionRow): void {
        this.SuggestionSelected = row;
        this.SuggestionSelectedAffectedItems = [];
        this.SuggestionSelectedAffectedCount = 0;
        this.UpdateQueryParams({ suggestionId: row.ID });
        this.loadAffectedItems(row);
    }

    private async loadAffectedItems(row: SuggestionRow): Promise<void> {
        // Affected items = ContentItemTag rows whose free-text Tag matches ProposedName.
        // We surface a few exemplars so the reviewer can see what's about to change.
        try {
            const escaped = row.ProposedName.replace(/'/g, "''");
            const rv = RunView.FromMetadataProvider(this.ProviderToUse);
            const result = await rv.RunView<{ ItemID: string; Tag: string; ContentSourceID: string | null; __mj_CreatedAt: string | Date }>({
                EntityName: 'MJ: Content Item Tags',
                ExtraFilter: `LOWER(Tag) = LOWER('${escaped}')`,
                Fields: ['ItemID', 'Tag', 'ContentSourceID', '__mj_CreatedAt'],
                OrderBy: '__mj_CreatedAt DESC',
                ResultType: 'simple',
                MaxRows: 5,
            }, this.ProviderToUse?.CurrentUser);
            if (result.Success) {
                this.SuggestionSelectedAffectedCount = result.TotalRowCount ?? result.Results.length;
                this.SuggestionSelectedAffectedItems = result.Results.map(r => ({
                    Title: r.ItemID,
                    Source: r.ContentSourceID ?? '—',
                    CreatedAt: new Date(r.__mj_CreatedAt as string),
                }));
            }
            this.cdr.detectChanges();
        } catch (e) {
            console.error('[TagGovernance] failed to load affected items:', e);
        }
    }

    public CloseDrawer(): void {
        this.SuggestionSelected = null;
        this.UpdateQueryParams({ suggestionId: null });
        this.cdr.detectChanges();
    }

    public async DispositionSuggestion(row: SuggestionRow, kind: 'create-new' | 'merge' | 'reject'): Promise<void> {
        if (!row || row.dispositionInProgress) return;
        row.dispositionInProgress = kind;
        this.cdr.detectChanges();
        try {
            const provider = this.ProviderToUse as GraphQLDataProvider;
            if (!provider) throw new Error('No GraphQL provider available.');
            const client = new GraphQLAIClient(provider);
            if (kind === 'reject') {
                const r = await client.RejectTagSuggestion({ suggestionID: row.ID });
                if (!r.Success) throw new Error(r.ErrorMessage ?? 'reject failed');
                this.notify.CreateSimpleNotification(`Rejected "${row.ProposedName}".`, 'info', 2200);
            } else {
                const r = await client.PromoteTagSuggestion({
                    suggestionID: row.ID,
                    strategy: kind === 'merge' ? 'merge-into-existing' : 'create-new',
                    targetTagID: kind === 'merge' ? row.BestMatchTagID ?? undefined : undefined,
                });
                if (!r.Success) throw new Error(r.ErrorMessage ?? 'promote failed');
                if (kind === 'merge') {
                    this.notify.CreateSimpleNotification(`Merged "${row.ProposedName}" into "${r.ResolvedTagName ?? row.BestMatchName}".`, 'info', 2500);
                } else {
                    this.notify.CreateSimpleNotification(`Created tag "${r.ResolvedTagName ?? row.ProposedName}".`, 'info', 2500);
                }
            }
            // Drop the row optimistically.
            this.SuggestionRows = this.SuggestionRows.filter(r => !UUIDsEqual(r.ID, row.ID));
            this.applySuggestionFilters();
            if (this.SuggestionSelected && UUIDsEqual(this.SuggestionSelected.ID, row.ID)) this.SuggestionSelected = null;
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            this.notify.CreateSimpleNotification(`Failed to ${kind}: ${msg}`, 'error', 6000);
        } finally {
            row.dispositionInProgress = null;
            this.cdr.detectChanges();
        }
    }

    public async BulkApprove(): Promise<void> {
        const selected = this.SuggestionRowsFiltered.filter(r => r.selected);
        if (selected.length === 0) return;
        if (!confirm(`Approve ${selected.length} suggestion(s)? Each will merge into its best match (when available) or be created as a new tag.`)) return;
        this.BulkInProgress = true;
        for (const row of selected) {
            const kind = row.BestMatchTagID ? 'merge' : 'create-new';
            await this.DispositionSuggestion(row, kind);
        }
        this.BulkInProgress = false;
    }

    public async BulkReject(): Promise<void> {
        const selected = this.SuggestionRowsFiltered.filter(r => r.selected);
        if (selected.length === 0) return;
        if (!confirm(`Reject ${selected.length} suggestion(s)?`)) return;
        this.BulkInProgress = true;
        for (const row of selected) await this.DispositionSuggestion(row, 'reject');
        this.BulkInProgress = false;
    }

    public ReasonClass(reason: string): string {
        switch (reason) {
            case 'MergeCandidate':       return 'merge';
            case 'BelowThreshold':       return 'below';
            case 'ConstrainedMode':
            case 'AmbiguousMatch':       return 'constrained';
            case 'ParentFrozen':
            case 'MaxChildrenExceeded':
            case 'MaxDepthExceeded':
            case 'BelowMinWeight':       return 'frozen';
            case 'RequiresReview':       return 'review';
            case 'LowUsage':             return 'lowusage';
            case 'WideNode':             return 'widenode';
            case 'AutoGrowDisabled':
            case 'MaxItemTagsExceeded':  return 'autogrow';
            default:                     return '';
        }
    }

    // =========================================================================
    // Tag Health section
    // =========================================================================

    private computeHealthCandidates(): void {
        // Top merge candidates — pull from existing pending suggestions of that reason.
        this.MergeCandidates = this.SuggestionRows
            .filter(r => r.Reason === 'MergeCandidate' && r.BestMatchTagID && r.BestMatchScore != null)
            .sort((a, b) => (b.BestMatchScore ?? 0) - (a.BestMatchScore ?? 0))
            .slice(0, 5)
            .map(r => ({ ProposedName: r.ProposedName, BestMatchName: r.BestMatchName ?? '?', Score: r.BestMatchScore ?? 0 }));

        this.LowUsageCandidates = this.SuggestionRows
            .filter(r => r.Reason === 'LowUsage')
            .slice(0, 5)
            .map(r => ({ Name: r.ProposedName, Usage: this.TaggedItemCountsByTagID.get(NormalizeUUID(r.BestMatchTagID ?? '')) ?? 0 }));

        this.WideNodeCandidates = this.SuggestionRows
            .filter(r => r.Reason === 'WideNode')
            .slice(0, 5)
            .map(r => {
                const tag = r.BestMatchTagID ? this.TagsByID.get(r.BestMatchTagID) : undefined;
                const childCount = tag ? (this.TagsByParentID.get(tag.ID)?.length ?? 0) : 0;
                return { Name: r.ProposedName, ChildCount: childCount, Threshold: tag?.MaxChildren ?? this.HealthThresholds.maxImplicitChildren };
            });

        this.TotalTagsScanned = this.TagsByID.size;
    }

    public async RunHealthNow(): Promise<void> {
        if (this.HealthRunning) return;
        this.HealthRunning = true;
        this.cdr.detectChanges();
        try {
            const provider = this.ProviderToUse as GraphQLDataProvider;
            if (!provider) throw new Error('No GraphQL provider available.');
            const client = new GraphQLAIClient(provider);
            const r = await client.RunTagHealth({
                minCoOccurrence: this.HealthThresholds.minCoOccurrence,
                minNameSimilarity: this.HealthThresholds.minNameSimilarity,
                minEmbeddingSimilarity: this.HealthThresholds.minEmbeddingSimilarity,
                maxUsage: this.HealthThresholds.maxUsage,
                maxImplicitChildren: this.HealthThresholds.maxImplicitChildren,
            });
            if (!r.Success) throw new Error(r.ErrorMessage ?? 'health run failed');
            this.LastHealthSummary = {
                mergeCount: r.MergeCount,
                lowUsageCount: r.LowUsageCount,
                wideNodeCount: r.WideNodeCount,
                durationMs: r.DurationMs,
                runAt: new Date(),
            };
            this.HealthRunHistory = [
                { When: new Date(), Trigger: 'Manual · UI', TagsScanned: this.TagsByID.size, Merge: r.MergeCount, LowUsage: r.LowUsageCount, WideNode: r.WideNodeCount, DurationMs: r.DurationMs },
                ...this.HealthRunHistory,
            ].slice(0, 12);
            this.notify.CreateSimpleNotification(`Tag Health: ${r.MergeCount} merge / ${r.LowUsageCount} low-usage / ${r.WideNodeCount} wide-node in ${r.DurationMs}ms.`, 'info', 4000);
            await this.loadAll(); // pull in new pending suggestions
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            this.notify.CreateSimpleNotification(`Tag Health failed: ${msg}`, 'error', 5000);
        } finally {
            this.HealthRunning = false;
            this.cdr.detectChanges();
        }
    }

    public async RebuildEmbeddings(): Promise<void> {
        if (this.RebuildEmbeddingsRunning) return;
        if (!confirm('Rebuild embeddings for all tags whose model doesn\'t match the configured embedding model? This can take time.')) return;
        this.RebuildEmbeddingsRunning = true;
        this.cdr.detectChanges();
        try {
            const provider = this.ProviderToUse as GraphQLDataProvider;
            if (!provider) throw new Error('No GraphQL provider available.');
            const client = new GraphQLAIClient(provider);
            const r = await client.RebuildTagEmbeddings();
            if (!r.Success) throw new Error(r.ErrorMessage ?? 'rebuild failed');
            this.notify.CreateSimpleNotification(`Refreshed ${r.Refreshed}/${r.Total} tag embeddings.`, 'info', 4000);
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            this.notify.CreateSimpleNotification(`Rebuild failed: ${msg}`, 'error', 5000);
        } finally {
            this.RebuildEmbeddingsRunning = false;
            this.cdr.detectChanges();
        }
    }

    // =========================================================================
    // Section switching
    // =========================================================================

    public ChangeSection(s: Section): void {
        this.ActiveSection = s;
        this.UpdateQueryParams({ section: s });
        this.publishAgentContext();
    }

    private publishAgentContext(): void {
        try {
            (this as unknown as { navigationService?: { SetAgentContext: (c: unknown, ctx: unknown) => void } }).navigationService?.SetAgentContext(this, {
                Section: this.ActiveSection,
                PendingSuggestionCount: this.SuggestionRows.length,
                TagCount: this.TagsByID.size,
                ScopedTagCount: Array.from(this.TagsByID.values()).filter(t => !t.IsGlobal).length,
            });
        } catch {
            // navigationService not always available in tests
        }
    }

    private publishAgentTools(): void {
        try {
            (this as unknown as { navigationService?: { SetAgentClientTools: (c: unknown, t: unknown) => void } }).navigationService?.SetAgentClientTools(this, [
                {
                    Name: 'SwitchSection',
                    Description: 'Switch the active dashboard section.',
                    ParameterSchema: { type: 'object', properties: { section: { type: 'string', enum: ['taxonomy', 'suggestions', 'health'] } }, required: ['section'] },
                    Handler: async (params: { section: Section }) => { this.ChangeSection(params.section); return { success: true, section: params.section }; },
                },
                {
                    Name: 'RunTagHealth',
                    Description: 'Run the Tag Health emitters now.',
                    ParameterSchema: { type: 'object', properties: {} },
                    Handler: async () => { await this.RunHealthNow(); return { success: true }; },
                },
            ]);
        } catch {
            // navigationService not always available in tests
        }
    }
}

export function LoadTagGovernanceResourceComponent(): void {
    // tree-shaking guard
}
