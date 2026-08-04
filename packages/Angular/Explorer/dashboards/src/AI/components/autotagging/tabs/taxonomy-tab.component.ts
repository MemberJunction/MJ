/**
 * @fileoverview Classify · Taxonomy Governance tab.
 *
 * Self-contained sub-page: owns its header-interior (sub-tab nav + Refresh),
 * the five governance sub-tabs (Tree, Duplicates, Orphans, Treemap, Audit), and
 * the five governance dialogs (Split, Move, Merge-Into, Create-Tag, Confirm).
 *
 * Loads its own taxonomy data (Tags, Tagged Items, Tag Audit Logs, and per-tag
 * SQL aggregates) via `RunView.FromMetadataProvider(this.ProviderToUse)` /
 * `RunQuery`, exactly as the host did. Receives the already-loaded shared
 * `MJ: Content Item Tags` rows from the host via `[ContentTags]` (used for
 * per-tag counts + recent-item previews). After a governance mutation it
 * reloads its own data and emits `(DataChanged)` so the host can react if needed.
 */
import { Component, ChangeDetectorRef, EventEmitter, Input, Output, OnInit, inject } from '@angular/core';
import { BaseEntity, CompositeKey, RunQuery, RunView } from '@memberjunction/core';
import { MJTagEntity, MJTaggedItemEntity, MJTagScopeEntity, MJTagSynonymEntity } from '@memberjunction/core-entities';
import { UUIDsEqual, NormalizeUUID } from '@memberjunction/global';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { TabConfig } from '@memberjunction/ng-ui-components';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import {
    TaxonomySubTab, TaxTreeNode, TaxDuplicatePair, TaxOrphanCard,
    TaxTreemapCell, TaxAuditAction, TaxAuditEvent, TaxHealthStat
} from '../shared/classify.types';
import { formatShortDate, formatDate } from '../shared/classify.format';

@Component({
    standalone: false,
    selector: 'classify-taxonomy-tab',
    templateUrl: './taxonomy-tab.component.html',
    styleUrls: ['./taxonomy-tab.component.css']
})
export class ClassifyTaxonomyTabComponent extends BaseAngularComponent implements OnInit {
    private cdr = inject(ChangeDetectorRef);

    /** Shared raw `MJ: Content Item Tags` rows, supplied by the host orchestrator. */
    private _contentTags: Record<string, unknown>[] = [];
    @Input()
    set ContentTags(value: Record<string, unknown>[]) {
        this._contentTags = value ?? [];
    }
    get ContentTags(): Record<string, unknown>[] {
        return this._contentTags;
    }

    /** Fired after a governance mutation so the host can refresh its own surfaces if needed. */
    @Output() DataChanged = new EventEmitter<void>();

    // ── Taxonomy Governance state ──
    public TaxSubTab: TaxonomySubTab = 'tree';
    public TaxTreeNodes: TaxTreeNode[] = [];
    public TaxFlatNodes: TaxTreeNode[] = [];
    public TaxFilteredNodes: TaxTreeNode[] = [];
    public TaxSelectedNode: TaxTreeNode | null = null;
    public TaxTreeSearch = '';
    public TaxDuplicates: TaxDuplicatePair[] = [];
    public TaxOrphans: TaxOrphanCard[] = [];
    public TaxAllOrphansSelected = false;
    public TaxTreemapCells: TaxTreemapCell[] = [];
    public TaxAuditEvents: TaxAuditEvent[] = [];
    public TaxAuditFilterTypes = new Set<string>(['created', 'merged', 'moved', 'deleted', 'renamed', 'deprecated', 'descriptionchanged', 'reactivated', 'split']);
    public TaxHealth: TaxHealthStat = { Total: 0, Healthy: 0, NeedAttention: 0, Orphaned: 0, Duplicates: 0 };
    public TaxRecentItems: { Name: string; Weight: number; Date: string; Icon: string }[] = [];
    public TaxTreemapKPIs: { Label: string; Value: string }[] = [];
    public TaxIsEditing = false;

    // ── Create Tag Dialog ──
    public ShowCreateTagDialog = false;
    public CreateTagName = '';
    public CreateTagDescription = '';
    public CreateTagParentID: string | null = null;
    /** Label shown in the create dialog to indicate context (e.g., "under AI Agent") */
    public CreateTagParentLabel = '';

    // ── Multi-select for drag reparenting ──
    public TaxMultiSelectMode = false;
    public TaxSelectedIDs = new Set<string>();
    /** The node currently being dragged over (drop target highlight) */
    public TaxDragOverNodeID: string | null = null;
    /** True while a drag-reparent operation is saving */
    public TaxTreeSaving = false;

    /** Count of high-confidence duplicate pairs (>85% similarity) */
    public get TaxHighConfidenceDupeCount(): number {
        return this.TaxDuplicates.filter(d => d.SeverityClass === 'high').length;
    }

    /** Count of moderate-confidence duplicate pairs (70-85% similarity) */
    public get TaxModerateDupeCount(): number {
        return this.TaxDuplicates.filter(d => d.SeverityClass === 'moderate').length;
    }
    public TaxEditName = '';
    public TaxEditDescription = '';

    // ── Selected-node editor sub-tabs (Overview / Governance / Synonyms / Scope) ──
    /** Active sub-tab in the selected-node editor. Only visible when a node is selected. */
    public TagEditorSubTab: 'overview' | 'governance' | 'synonyms' | 'scope' = 'overview';

    // ── Governance panel state ──
    /** The strongly-typed MJ: Tags entity backing the governance editor for the selected node. */
    public GovernanceTag: MJTagEntity | null = null;
    /** True while the governance entity is loading. */
    public GovernanceLoading = false;
    /** True while a governance save is in flight. */
    public GovernanceSaving = false;
    /** Editable copies of the governance flags so we don't mutate the entity until Save(). */
    public GovIsFrozen = false;
    public GovAllowAutoGrow = false;
    public GovRequiresReview = false;
    public GovMaxChildren: number | null = null;
    public GovMaxDescendantDepth: number | null = null;
    public GovMinWeight: number | null = null;

    // ── Synonyms panel state ──
    /** Synonyms for the selected tag (typed entity objects, loaded lazily per-tag). */
    public Synonyms: MJTagSynonymEntity[] = [];
    /** True while synonyms are loading. */
    public SynonymsLoading = false;
    /** New synonym text to add. */
    public NewSynonymText = '';
    /** True while a synonym add/delete is in flight. */
    public SynonymSaving = false;

    // ── Scope panel state ──
    /** Scopes for the selected tag (typed entity objects, loaded lazily per-tag). */
    public Scopes: MJTagScopeEntity[] = [];
    /** True while scopes are loading. */
    public ScopesLoading = false;
    /** True while a scope/global mutation is in flight. */
    public ScopeSaving = false;
    /** Selected entity ID for the "Add scope" affordance. */
    public NewScopeEntityID: string | null = null;
    /** RecordID text for the "Add scope" affordance. */
    public NewScopeRecordID = '';

    // Raw taxonomy data cache
    private tagsRaw: Record<string, unknown>[] = [];
    private taggedItemsRaw: Record<string, unknown>[] = [];
    private tagAuditLogsRaw: Record<string, unknown>[] = [];
    /** Cached per-tag aggregates from server-side SQL (weights + counts) */
    private tagAggregateWeights = new Map<string, number>();
    private tagAggregateCounts = new Map<string, number>();

    // ── Confirmation dialog state ──
    /** Whether a generic confirmation overlay is visible */
    public ShowConfirmDialog = false;
    /** Title text for the confirmation dialog */
    public ConfirmDialogTitle = '';
    /** Body message for the confirmation dialog */
    public ConfirmDialogMessage = '';
    /** Callback invoked when user confirms */
    private confirmDialogAction: (() => Promise<void>) | null = null;

    // ── Split dialog state ──
    /** Whether the split-tag dialog is visible */
    public ShowSplitDialog = false;
    /** Comma-separated new child tag names for the split operation */
    public SplitChildNames = '';
    /** The node currently being split */
    private splitTargetNode: TaxTreeNode | null = null;

    // ── Move dialog state ──
    /** Whether the move-tag dialog is visible */
    public ShowMoveDialog = false;
    /** Selected new parent tag ID for the move operation */
    public MoveNewParentID: string | null = null;
    /** The node currently being moved */
    private moveTargetNode: TaxTreeNode | null = null;

    // ── Merge Into dialog state ──
    public ShowMergeIntoDialog = false;
    public MergeSourceTag: TaxTreeNode | null = null;
    public MergeTargetID: string | null = null;
    public MergeTargetData: { ID: string; Label: string }[] = [];

    // ── Treemap drill-in state ──
    /** Whether the treemap drill-in panel is visible */
    public ShowTreemapDrillIn = false;
    /** Tag node currently displayed in treemap drill-in */
    public TreemapDrillInNode: TaxTreeNode | null = null;

    public IsMerging = false;

    /** Subtitle rendered in the per-section `<mj-page-header-interior>`. */
    public get Subtitle(): string {
        return `Manage tag hierarchy, resolve duplicates, and monitor taxonomy health — ${this.TaxHealth.Total} total tags`;
    }

    public async ngOnInit(): Promise<void> {
        await this.loadTaxonomyData();
    }

    /** Taxonomy sub-tabs as `TabConfig[]` for `<mj-tab-nav>`. */
    public get taxSubTabsConfig(): TabConfig[] {
        return [
            { key: 'tree',       label: 'Tree View',  icon: 'fa-solid fa-sitemap' },
            { key: 'duplicates', label: 'Duplicates', icon: 'fa-solid fa-link',
              badge: this.TaxDuplicates.length > 0 ? this.TaxDuplicates.length : null,
              badgeVariant: 'warning' },
            { key: 'orphans',    label: 'Orphans',    icon: 'fa-solid fa-ban',
              badge: this.TaxOrphans.length > 0 ? this.TaxOrphans.length : null,
              badgeVariant: 'error' },
            { key: 'treemap',    label: 'Treemap',    icon: 'fa-solid fa-chart-tree-map' },
            { key: 'audit',      label: 'Audit Log',  icon: 'fa-solid fa-scroll' }
        ];
    }

    /** Adapter for `<mj-tab-nav>`'s string-typed `(TabChange)` output. */
    public onTaxSubTabChange(key: string): void {
        if (key === 'tree' || key === 'duplicates' || key === 'orphans' || key === 'treemap' || key === 'audit') {
            this.SwitchTaxSubTab(key);
        }
    }

    public SwitchTaxSubTab(sub: TaxonomySubTab): void {
        this.TaxSubTab = sub;
        this.cdr.detectChanges();
    }

    /**
     * Loads all data needed by the Taxonomy Governance sub-tabs:
     * Tags, Tagged Items, Tag Audit Logs, and cross-references content item tags.
     */
    private async loadTaxonomyData(): Promise<void> {
        try {
            const rv = RunView.FromMetadataProvider(this.ProviderToUse);
            const [tagsResult, taggedItemsResult, auditResult] = await rv.RunViews([
                { EntityName: 'MJ: Tags', OrderBy: 'Name', ResultType: 'simple' },
                { EntityName: 'MJ: Tagged Items', ResultType: 'simple' },
                { EntityName: 'MJ: Tag Audit Logs', OrderBy: '__mj_CreatedAt DESC', MaxRows: 200, ResultType: 'simple' }
            ]);

            this.tagsRaw = tagsResult.Success ? tagsResult.Results : [];
            this.taggedItemsRaw = taggedItemsResult.Success ? taggedItemsResult.Results : [];
            this.tagAuditLogsRaw = auditResult.Success ? auditResult.Results : [];

            // Load per-tag aggregates (weights + counts) via server-side SQL
            await this.loadTagAggregates();

            this.buildTaxTree();
            this.buildTaxDuplicates();
            this.buildTaxOrphans();
            this.buildTaxTreemap();
            this.buildTaxAuditLog();
            this.buildTaxHealth();
            this.cdr.detectChanges();
        } catch (error) {
            console.error('[Autotagging] Error loading taxonomy data:', error);
        }
    }

    // ── Tree View ──

    /**
     * Builds the taxonomy tree from raw tag data, wiring up parent-child
     * relationships and attaching item counts and average weights.
     */
    private buildTaxTree(): void {
        const tagMap = new Map<string, TaxTreeNode>();
        const tagItemCounts = this.tagAggregateCounts;
        const tagAvgWeights = this.tagAggregateWeights;

        // Create flat node list from raw tags (exclude merged/soft-deleted tags)
        const activeTags = this.tagsRaw.filter(t => (t['Status'] as string)?.toLowerCase() !== 'merged');
        for (const tag of activeTags) {
            const id = tag['ID'] as string;
            const normalizedId = NormalizeUUID(id);
            const name = (tag['Name'] as string) ?? 'Unnamed';
            const itemCount = tagItemCounts.get(normalizedId) ?? 0;
            const avgWeight = tagAvgWeights.get(normalizedId) ?? 0;

            tagMap.set(normalizedId, {
                ID: id,
                Name: name,
                DisplayName: (tag['DisplayName'] as string) ?? name,
                Description: (tag['Description'] as string) ?? '',
                ParentID: (tag['ParentID'] as string) ?? null,
                Depth: 0,
                Children: [],
                ItemCount: itemCount,
                AvgWeight: avgWeight,
                HealthColor: this.computeTagHealth(itemCount, avgWeight),
                IsExpanded: false,
                IsSelected: false,
                FirstSeen: formatShortDate((tag['__mj_CreatedAt'] as string) ?? '')
            });
        }

        // Build parent-child relationships
        const roots: TaxTreeNode[] = [];
        for (const node of tagMap.values()) {
            const normalizedParent = node.ParentID ? NormalizeUUID(node.ParentID) : null;
            if (normalizedParent && tagMap.has(normalizedParent)) {
                tagMap.get(normalizedParent)!.Children.push(node);
            } else {
                roots.push(node);
            }
        }

        // Compute depths and aggregate child counts
        this.computeTreeDepths(roots, 0);
        this.propagateItemCounts(roots);

        // Sort children alphabetically
        this.sortTreeNodes(roots);

        // Expand top two levels by default
        for (const root of roots) {
            root.IsExpanded = true;
            for (const child of root.Children) {
                child.IsExpanded = true;
            }
        }

        this.TaxTreeNodes = roots;
        this.TaxFlatNodes = this.flattenTree(roots);
        this.TaxFilteredNodes = this.TaxFlatNodes;

        // Select first node if available
        if (this.TaxFlatNodes.length > 0) {
            this.SelectTaxNode(this.TaxFlatNodes[0]);
        }
    }

    private computeTreeDepths(nodes: TaxTreeNode[], depth: number): void {
        for (const node of nodes) {
            node.Depth = depth;
            this.computeTreeDepths(node.Children, depth + 1);
        }
    }

    private propagateItemCounts(nodes: TaxTreeNode[]): number {
        let total = 0;
        for (const node of nodes) {
            const childCount = this.propagateItemCounts(node.Children);
            node.ItemCount = node.ItemCount + childCount;
            total += node.ItemCount;
        }
        return total;
    }

    private sortTreeNodes(nodes: TaxTreeNode[]): void {
        nodes.sort((a, b) => a.Name.localeCompare(b.Name));
        for (const node of nodes) {
            this.sortTreeNodes(node.Children);
        }
    }

    private flattenTree(nodes: TaxTreeNode[]): TaxTreeNode[] {
        const result: TaxTreeNode[] = [];
        for (const node of nodes) {
            result.push(node);
            if (node.IsExpanded && node.Children.length > 0) {
                result.push(...this.flattenTree(node.Children));
            }
        }
        return result;
    }

    private computeTagHealth(itemCount: number, avgWeight: number): 'green' | 'yellow' | 'red' {
        if (itemCount === 0) return 'red';
        if (itemCount <= 2 || avgWeight < 0.3) return 'yellow';
        return 'green';
    }

    /**
     * Counts the number of items referencing each tag, combining both
     * Tagged Items and Content Item Tags. Uses NormalizeUUID for
     * cross-platform UUID case consistency.
     */
    private countItemsByTag(): Map<string, number> {
        const counts = new Map<string, number>();
        for (const ti of this.taggedItemsRaw) {
            const tagId = ti['TagID'] as string;
            if (tagId) {
                const key = NormalizeUUID(tagId);
                counts.set(key, (counts.get(key) ?? 0) + 1);
            }
        }
        // Also count from content item tags that reference TagID
        for (const cit of this._contentTags) {
            const tagId = cit['TagID'] as string;
            if (tagId) {
                const key = NormalizeUUID(tagId);
                counts.set(key, (counts.get(key) ?? 0) + 1);
            }
        }
        return counts;
    }

    /**
     * Loads per-tag average weights and item counts via the "Tag Aggregates" saved query.
     * This runs a SQL GROUP BY on the server, avoiding loading 17K+ TaggedItem rows to the browser.
     */
    private async loadTagAggregates(): Promise<void> {
        this.tagAggregateWeights.clear();
        this.tagAggregateCounts.clear();
        try {
            const rq = new RunQuery();
            const result = await rq.RunQuery({
                QueryName: 'Tag Aggregates',
                CategoryPath: '/MJ/Tags'
            });
            if (result.Success) {
                for (const row of result.Results) {
                    const tagId = row['TagID'] as string;
                    if (tagId) {
                        const key = NormalizeUUID(tagId);
                        this.tagAggregateWeights.set(key, Number(row['AvgWeight'] ?? 0));
                        this.tagAggregateCounts.set(key, Number(row['ItemCount'] ?? 0));
                    }
                }
            }
        } catch (error) {
            console.error('[Autotagging] Error loading tag aggregates:', error);
        }
    }

    public ToggleTaxNode(node: TaxTreeNode): void {
        if (node.Children.length > 0) {
            node.IsExpanded = !node.IsExpanded;
            this.TaxFlatNodes = this.flattenTree(this.TaxTreeNodes);
            this.applyTaxTreeFilter();
            this.cdr.detectChanges();
        }
    }

    public SelectTaxNode(node: TaxTreeNode): void {
        // Deselect previous
        for (const n of this.TaxFlatNodes) {
            n.IsSelected = false;
        }
        node.IsSelected = true;
        this.TaxSelectedNode = node;
        this.TaxIsEditing = false;
        this.resetEditorPanels();
        this.loadRecentItemsForTag(node);
        // Lazy-load the data for whichever sub-tab is currently active.
        void this.ensureEditorSubTabLoaded();
        this.cdr.detectChanges();
    }

    /**
     * Clears the lazily-loaded governance/synonyms/scope panel state so a newly
     * selected node starts fresh. Data is re-fetched on demand when its sub-tab opens.
     */
    private resetEditorPanels(): void {
        this.GovernanceTag = null;
        this.Synonyms = [];
        this.Scopes = [];
        this.NewSynonymText = '';
        this.NewScopeEntityID = null;
        this.NewScopeRecordID = '';
    }

    public FilterTaxTree(): void {
        this.applyTaxTreeFilter();
        this.cdr.detectChanges();
    }

    private applyTaxTreeFilter(): void {
        const q = this.TaxTreeSearch.toLowerCase().trim();
        if (!q) {
            this.TaxFilteredNodes = this.TaxFlatNodes;
        } else {
            this.TaxFilteredNodes = this.TaxFlatNodes.filter(n =>
                n.Name.toLowerCase().includes(q) || n.DisplayName.toLowerCase().includes(q)
            );
        }
    }

    public GetTaxBreadcrumb(node: TaxTreeNode): { ID: string; Name: string }[] {
        const breadcrumb: { ID: string; Name: string }[] = [];
        const tagMap = new Map<string, Record<string, unknown>>();
        for (const t of this.tagsRaw) {
            tagMap.set(t['ID'] as string, t);
        }

        let currentID: string | null = node.ParentID;
        while (currentID) {
            const parent = tagMap.get(currentID);
            if (!parent) break;
            breadcrumb.unshift({ ID: currentID, Name: (parent['Name'] as string) ?? '' });
            currentID = (parent['ParentID'] as string) ?? null;
        }
        return breadcrumb;
    }

    public NavigateToBreadcrumb(tagId: string): void {
        const node = this.TaxFlatNodes.find(n => UUIDsEqual(n.ID, tagId));
        if (node) {
            this.SelectTaxNode(node);
        }
    }

    private loadRecentItemsForTag(node: TaxTreeNode): void {
        // Find content item tags that reference this tag's ID.
        // Use the 'Item' view field (ContentItem name) directly from the tag record
        // instead of looking up from the capped contentItemsRaw array.
        const matchingTags = this._contentTags.filter(cit =>
            UUIDsEqual(cit['TagID'] as string, node.ID)
        ).slice(0, 5);

        this.TaxRecentItems = matchingTags.map(cit => ({
            Name: (cit['Item'] as string) ?? 'Unnamed Item',
            Weight: Number(cit['Weight'] ?? 0.5),
            Date: formatShortDate((cit['__mj_CreatedAt'] as string) ?? ''),
            Icon: 'fa-solid fa-file-lines'
        }));
    }

    // ── Selected-Node Editor Sub-Tabs ──

    /**
     * Switches the selected-node editor sub-tab and lazy-loads the data for
     * the newly opened sub-tab if it hasn't been fetched yet for this node.
     */
    public SwitchTagEditorSubTab(sub: 'overview' | 'governance' | 'synonyms' | 'scope'): void {
        this.TagEditorSubTab = sub;
        void this.ensureEditorSubTabLoaded();
        this.cdr.detectChanges();
    }

    /** Loads the data backing the currently active editor sub-tab on demand. */
    private async ensureEditorSubTabLoaded(): Promise<void> {
        if (!this.TaxSelectedNode) return;
        switch (this.TagEditorSubTab) {
            case 'governance':
                if (!this.GovernanceTag) await this.loadGovernanceTag();
                break;
            case 'synonyms':
                await this.loadSynonyms();
                break;
            case 'scope':
                if (!this.GovernanceTag) await this.loadGovernanceTag();
                await this.loadScopes();
                break;
            default:
                break;
        }
    }

    // ── Governance Panel ──

    /** Lazy-loads the strongly-typed MJ: Tags entity for the selected node. */
    private async loadGovernanceTag(): Promise<void> {
        if (!this.TaxSelectedNode) return;
        this.GovernanceLoading = true;
        this.cdr.detectChanges();
        try {
            const p = this.ProviderToUse;
            const tag = await p.GetEntityObject<MJTagEntity>('MJ: Tags', p.CurrentUser);
            const loaded = await tag.Load(this.TaxSelectedNode.ID);
            if (loaded) {
                this.GovernanceTag = tag;
                this.syncGovernanceFromEntity(tag);
            } else {
                this.GovernanceTag = null;
            }
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            MJNotificationService.Instance.CreateSimpleNotification(`Error loading governance: ${msg}`, 'error', 4000);
        }
        this.GovernanceLoading = false;
        this.cdr.detectChanges();
    }

    /** Copies governance flags from the entity into the editable view fields. */
    private syncGovernanceFromEntity(tag: MJTagEntity): void {
        this.GovIsFrozen = tag.IsFrozen;
        this.GovAllowAutoGrow = tag.AllowAutoGrow;
        this.GovRequiresReview = tag.RequiresReview;
        this.GovMaxChildren = tag.MaxChildren;
        this.GovMaxDescendantDepth = tag.MaxDescendantDepth;
        this.GovMinWeight = tag.MinWeight;
    }

    /** A one-line subtree-impact hint derived from the selected tree node. */
    public get GovernanceImpactHint(): string {
        const node = this.TaxSelectedNode;
        if (!node) return '';
        const children = node.Children.length;
        const items = node.ItemCount;
        return `Affects ${children} direct child${children === 1 ? '' : 'ren'} and ${items} tagged item${items === 1 ? '' : 's'} in this subtree.`;
    }

    /** Resets the governance editor fields back to the loaded entity values. */
    public ResetGovernance(): void {
        if (this.GovernanceTag) {
            this.syncGovernanceFromEntity(this.GovernanceTag);
            this.cdr.detectChanges();
        }
    }

    /** Persists the edited governance flags to the MJ: Tags entity. */
    public async SaveGovernance(): Promise<void> {
        const tag = this.GovernanceTag;
        if (!tag) return;
        this.GovernanceSaving = true;
        this.cdr.detectChanges();
        try {
            tag.IsFrozen = this.GovIsFrozen;
            tag.AllowAutoGrow = this.GovAllowAutoGrow;
            tag.RequiresReview = this.GovRequiresReview;
            tag.MaxChildren = this.GovMaxChildren;
            tag.MaxDescendantDepth = this.GovMaxDescendantDepth;
            tag.MinWeight = this.GovMinWeight;
            const saved = await tag.Save();
            if (saved) {
                this.syncGovernanceFromEntity(tag);
                MJNotificationService.Instance.CreateSimpleNotification('Governance saved', 'success', 2500);
                this.DataChanged.emit();
            } else {
                MJNotificationService.Instance.CreateSimpleNotification(
                    `Failed to save governance: ${tag.LatestResult?.CompleteMessage ?? 'unknown error'}`, 'error', 4000
                );
            }
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            MJNotificationService.Instance.CreateSimpleNotification(`Error: ${msg}`, 'error', 4000);
        }
        this.GovernanceSaving = false;
        this.cdr.detectChanges();
    }

    // ── Synonyms Panel ──

    /** Lazy-loads MJ: Tag Synonyms rows for the selected tag. */
    private async loadSynonyms(): Promise<void> {
        if (!this.TaxSelectedNode) return;
        this.SynonymsLoading = true;
        this.cdr.detectChanges();
        try {
            const rv = RunView.FromMetadataProvider(this.ProviderToUse);
            const result = await rv.RunView<MJTagSynonymEntity>({
                EntityName: 'MJ: Tag Synonyms',
                ExtraFilter: `TagID='${this.TaxSelectedNode.ID}'`,
                OrderBy: 'Synonym',
                ResultType: 'entity_object'
            });
            this.Synonyms = result.Success ? result.Results : [];
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            MJNotificationService.Instance.CreateSimpleNotification(`Error loading synonyms: ${msg}`, 'error', 4000);
            this.Synonyms = [];
        }
        this.SynonymsLoading = false;
        this.cdr.detectChanges();
    }

    /** Returns a colored-pill CSS class for a synonym Source. */
    public GetSynonymSourceClass(source: string): string {
        switch (source) {
            case 'Manual':   return 'at-syn-pill-manual';
            case 'LLM':      return 'at-syn-pill-llm';
            case 'Imported': return 'at-syn-pill-imported';
            case 'Merged':   return 'at-syn-pill-merged';
            default:         return 'at-syn-pill-manual';
        }
    }

    /** Creates a new Manual synonym for the selected tag. */
    public async AddSynonym(): Promise<void> {
        const text = this.NewSynonymText.trim();
        if (!text || !this.TaxSelectedNode) return;
        this.SynonymSaving = true;
        this.cdr.detectChanges();
        try {
            const p = this.ProviderToUse;
            const syn = await p.GetEntityObject<MJTagSynonymEntity>('MJ: Tag Synonyms', p.CurrentUser);
            syn.NewRecord();
            syn.TagID = this.TaxSelectedNode.ID;
            syn.Synonym = text;
            syn.Source = 'Manual';
            // Manually-added synonyms are trusted and resolve immediately.
            // Machine-proposed synonyms (Source = LLM/Imported) arrive as 'Pending'
            // and only resolve once approved via ApproveSynonym() below.
            syn.Status = 'Active';
            const saved = await syn.Save();
            if (saved) {
                this.NewSynonymText = '';
                MJNotificationService.Instance.CreateSimpleNotification('Synonym added', 'success', 2500);
                await this.loadSynonyms();
            } else {
                MJNotificationService.Instance.CreateSimpleNotification(
                    `Failed to add synonym: ${syn.LatestResult?.CompleteMessage ?? 'unknown error'}`, 'error', 4000
                );
            }
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            MJNotificationService.Instance.CreateSimpleNotification(`Error: ${msg}`, 'error', 4000);
        }
        this.SynonymSaving = false;
        this.cdr.detectChanges();
    }

    /** Deletes a synonym row. */
    public async DeleteSynonym(syn: MJTagSynonymEntity): Promise<void> {
        this.SynonymSaving = true;
        this.cdr.detectChanges();
        try {
            const deleted = await syn.Delete();
            if (deleted) {
                this.Synonyms = this.Synonyms.filter(s => !UUIDsEqual(s.ID, syn.ID));
                MJNotificationService.Instance.CreateSimpleNotification('Synonym removed', 'success', 2500);
            } else {
                MJNotificationService.Instance.CreateSimpleNotification(
                    `Failed to remove synonym: ${syn.LatestResult?.CompleteMessage ?? 'unknown error'}`, 'error', 4000
                );
            }
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            MJNotificationService.Instance.CreateSimpleNotification(`Error: ${msg}`, 'error', 4000);
        }
        this.SynonymSaving = false;
        this.cdr.detectChanges();
    }

    /** Count of synonyms awaiting review (Source = LLM/Imported, Status = Pending). */
    public get PendingSynonymCount(): number {
        return this.Synonyms.filter(s => s.Status === 'Pending').length;
    }

    /** Approves a pending (machine-proposed) synonym so it begins resolving to its tag. */
    public async ApproveSynonym(syn: MJTagSynonymEntity): Promise<void> {
        await this.setSynonymStatus(syn, 'Active', 'Synonym approved');
    }

    /** Rejects a pending synonym; retained for audit and to suppress re-proposal. */
    public async RejectSynonym(syn: MJTagSynonymEntity): Promise<void> {
        await this.setSynonymStatus(syn, 'Rejected', 'Synonym rejected');
    }

    /** Shared transition for approve/reject of a synonym's Status. */
    private async setSynonymStatus(syn: MJTagSynonymEntity, status: 'Active' | 'Rejected', successMsg: string): Promise<void> {
        this.SynonymSaving = true;
        this.cdr.detectChanges();
        try {
            syn.Status = status;
            const saved = await syn.Save();
            if (saved) {
                MJNotificationService.Instance.CreateSimpleNotification(successMsg, 'success', 2500);
                await this.loadSynonyms();
            } else {
                MJNotificationService.Instance.CreateSimpleNotification(
                    `Failed to update synonym: ${syn.LatestResult?.CompleteMessage ?? 'unknown error'}`, 'error', 4000
                );
            }
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            MJNotificationService.Instance.CreateSimpleNotification(`Error: ${msg}`, 'error', 4000);
        }
        this.SynonymSaving = false;
        this.cdr.detectChanges();
    }

    // ── Scope Panel ──

    /** Entity options for the "Add scope" combobox, sorted by name. */
    public get ScopeEntityOptions(): { ID: string; Name: string }[] {
        return this.ProviderToUse.Entities
            .map(e => ({ ID: e.ID, Name: e.Name }))
            .sort((a, b) => a.Name.localeCompare(b.Name));
    }

    /** Whether the selected tag is global (read from the governance entity). */
    public get IsTagGlobal(): boolean {
        return this.GovernanceTag?.IsGlobal ?? false;
    }

    /** Lazy-loads MJ: Tag Scopes rows for the selected tag. */
    private async loadScopes(): Promise<void> {
        if (!this.TaxSelectedNode) return;
        this.ScopesLoading = true;
        this.cdr.detectChanges();
        try {
            const rv = RunView.FromMetadataProvider(this.ProviderToUse);
            const result = await rv.RunView<MJTagScopeEntity>({
                EntityName: 'MJ: Tag Scopes',
                ExtraFilter: `TagID='${this.TaxSelectedNode.ID}'`,
                OrderBy: 'ScopeEntity',
                ResultType: 'entity_object'
            });
            this.Scopes = result.Success ? result.Results : [];
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            MJNotificationService.Instance.CreateSimpleNotification(`Error loading scopes: ${msg}`, 'error', 4000);
            this.Scopes = [];
        }
        this.ScopesLoading = false;
        this.cdr.detectChanges();
    }

    /** Adapter for the entity combobox's string-typed value output. */
    public OnScopeEntitySelected(value: unknown): void {
        this.NewScopeEntityID = value != null ? String(value) : null;
    }

    /** Toggles the tag's IsGlobal flag and persists it. */
    public async ToggleTagGlobal(value: boolean): Promise<void> {
        if (!this.GovernanceTag) return;
        this.ScopeSaving = true;
        this.cdr.detectChanges();
        try {
            this.GovernanceTag.IsGlobal = value;
            const saved = await this.GovernanceTag.Save();
            if (saved) {
                MJNotificationService.Instance.CreateSimpleNotification(
                    value ? 'Tag is now global' : 'Tag is now scoped', 'success', 2500
                );
                this.DataChanged.emit();
            } else {
                MJNotificationService.Instance.CreateSimpleNotification(
                    `Failed to update scope: ${this.GovernanceTag.LatestResult?.CompleteMessage ?? 'unknown error'}`, 'error', 4000
                );
            }
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            MJNotificationService.Instance.CreateSimpleNotification(`Error: ${msg}`, 'error', 4000);
        }
        this.ScopeSaving = false;
        this.cdr.detectChanges();
    }

    /** Creates a new MJ: Tag Scopes row for the selected tag. */
    public async AddScope(): Promise<void> {
        const entityId = this.NewScopeEntityID;
        const recordId = this.NewScopeRecordID.trim();
        if (!entityId || !recordId || !this.TaxSelectedNode) return;
        this.ScopeSaving = true;
        this.cdr.detectChanges();
        try {
            const p = this.ProviderToUse;
            const scope = await p.GetEntityObject<MJTagScopeEntity>('MJ: Tag Scopes', p.CurrentUser);
            scope.NewRecord();
            scope.TagID = this.TaxSelectedNode.ID;
            scope.ScopeEntityID = entityId;
            scope.ScopeRecordID = recordId;
            const saved = await scope.Save();
            if (saved) {
                this.NewScopeEntityID = null;
                this.NewScopeRecordID = '';
                MJNotificationService.Instance.CreateSimpleNotification('Scope added', 'success', 2500);
                await this.loadScopes();
            } else {
                MJNotificationService.Instance.CreateSimpleNotification(
                    `Failed to add scope: ${scope.LatestResult?.CompleteMessage ?? 'unknown error'}`, 'error', 4000
                );
            }
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            MJNotificationService.Instance.CreateSimpleNotification(`Error: ${msg}`, 'error', 4000);
        }
        this.ScopeSaving = false;
        this.cdr.detectChanges();
    }

    /** Deletes a scope row. */
    public async DeleteScope(scope: MJTagScopeEntity): Promise<void> {
        this.ScopeSaving = true;
        this.cdr.detectChanges();
        try {
            const deleted = await scope.Delete();
            if (deleted) {
                this.Scopes = this.Scopes.filter(s => !UUIDsEqual(s.ID, scope.ID));
                MJNotificationService.Instance.CreateSimpleNotification('Scope removed', 'success', 2500);
            } else {
                MJNotificationService.Instance.CreateSimpleNotification(
                    `Failed to remove scope: ${scope.LatestResult?.CompleteMessage ?? 'unknown error'}`, 'error', 4000
                );
            }
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            MJNotificationService.Instance.CreateSimpleNotification(`Error: ${msg}`, 'error', 4000);
        }
        this.ScopeSaving = false;
        this.cdr.detectChanges();
    }

    // ── Tag Operations ──

    public StartEditTag(): void {
        if (!this.TaxSelectedNode) return;
        this.TaxIsEditing = true;
        this.TaxEditName = this.TaxSelectedNode.Name;
        this.TaxEditDescription = this.TaxSelectedNode.Description;
        this.cdr.detectChanges();
    }

    public CancelEditTag(): void {
        this.TaxIsEditing = false;
        this.cdr.detectChanges();
    }

    public async SaveEditTag(): Promise<void> {
        if (!this.TaxSelectedNode) return;
        try {
            const md = this.ProviderToUse;
            const tag = await md.GetEntityObject<MJTagEntity>('MJ: Tags', md.CurrentUser);
            await tag.InnerLoad(new CompositeKey([{ FieldName: 'ID', Value: this.TaxSelectedNode.ID }]));
            tag.Name = this.TaxEditName;
            tag.Description = this.TaxEditDescription;
            const saved = await tag.Save();
            if (saved) {
                this.TaxSelectedNode.Name = this.TaxEditName;
                this.TaxSelectedNode.DisplayName = this.TaxEditName;
                this.TaxSelectedNode.Description = this.TaxEditDescription;
                this.TaxIsEditing = false;
                this.addTaxAuditEntry('renamed', this.TaxEditName);
                MJNotificationService.Instance.CreateSimpleNotification('Tag updated', 'success', 2500);
            } else {
                MJNotificationService.Instance.CreateSimpleNotification('Failed to update tag', 'error', 3000);
            }
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            MJNotificationService.Instance.CreateSimpleNotification(`Error: ${msg}`, 'error', 4000);
        }
        this.cdr.detectChanges();
    }

    public async MoveTag(node: TaxTreeNode, newParentId: string | null): Promise<void> {
        try {
            const md = this.ProviderToUse;
            const tag = await md.GetEntityObject<MJTagEntity>('MJ: Tags', md.CurrentUser);
            await tag.InnerLoad(new CompositeKey([{ FieldName: 'ID', Value: node.ID }]));
            tag.ParentID = newParentId;
            const saved = await tag.Save();
            if (saved) {
                this.addTaxAuditEntry('moved', node.Name);
                MJNotificationService.Instance.CreateSimpleNotification('Tag moved', 'success', 2500);
                await this.RefreshTaxonomyData();
            }
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            MJNotificationService.Instance.CreateSimpleNotification(`Error: ${msg}`, 'error', 4000);
        }
    }

    public DeleteTag(node: TaxTreeNode): void {
        this.OpenConfirmDialog(
            'Delete Tag',
            `Delete tag "${node.Name}"? This will also remove all tagged item associations.`,
            async () => {
                try {
                    const md = this.ProviderToUse;
                    const tag = await md.GetEntityObject<MJTagEntity>('MJ: Tags', md.CurrentUser);
                    await tag.InnerLoad(new CompositeKey([{ FieldName: 'ID', Value: node.ID }]));
                    const deleted = await tag.Delete();
                    if (deleted) {
                        this.addTaxAuditEntry('deleted', node.Name);
                        MJNotificationService.Instance.CreateSimpleNotification('Tag deleted', 'success', 2500);
                        await this.RefreshTaxonomyData();
                    }
                } catch (error) {
                    const msg = error instanceof Error ? error.message : String(error);
                    MJNotificationService.Instance.CreateSimpleNotification(`Error: ${msg}`, 'error', 4000);
                }
            }
        );
    }

    // ── Create Tag ──

    /** Open create tag dialog for a root-level tag */
    public OpenCreateRootTag(): void {
        this.CreateTagParentID = null;
        this.CreateTagParentLabel = 'Root level';
        this.CreateTagName = '';
        this.CreateTagDescription = '';
        this.ShowCreateTagDialog = true;
        this.cdr.detectChanges();
    }

    /** Open create tag dialog as child of the selected node */
    public OpenCreateChildTag(): void {
        if (!this.TaxSelectedNode) return;
        this.OpenCreateChildTagFor(this.TaxSelectedNode);
    }

    /** Open create tag dialog as child of a specific node */
    public OpenCreateChildTagFor(node: TaxTreeNode): void {
        this.CreateTagParentID = node.ID;
        this.CreateTagParentLabel = `under "${node.Name}"`;
        this.CreateTagName = '';
        this.CreateTagDescription = '';
        this.ShowCreateTagDialog = true;
        this.cdr.detectChanges();
    }

    /** Close create tag dialog */
    public CloseCreateTagDialog(): void {
        this.ShowCreateTagDialog = false;
        this.cdr.detectChanges();
    }

    /** Save the new tag */
    public async SaveNewTag(): Promise<void> {
        const name = this.CreateTagName.trim();
        if (!name) return;

        try {
            const md = this.ProviderToUse;
            const tag = await md.GetEntityObject<MJTagEntity>('MJ: Tags', md.CurrentUser);
            tag.NewRecord();
            tag.Name = name;
            tag.DisplayName = name;
            tag.Description = this.CreateTagDescription.trim() || null;
            tag.ParentID = this.CreateTagParentID;
            const saved = await tag.Save();
            if (saved) {
                this.addTaxAuditEntry('created', name);
                MJNotificationService.Instance.CreateSimpleNotification(`Tag "${name}" created`, 'success', 2500);
                this.ShowCreateTagDialog = false;
                await this.RefreshTaxonomyData();
            } else {
                MJNotificationService.Instance.CreateSimpleNotification('Failed to save tag', 'error', 4000);
            }
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            MJNotificationService.Instance.CreateSimpleNotification(`Error: ${msg}`, 'error', 4000);
        }
    }

    // ── Multi-Select & Drag Reparent ──

    /** Toggle multi-select mode on/off */
    public ToggleMultiSelectMode(): void {
        this.TaxMultiSelectMode = !this.TaxMultiSelectMode;
        if (!this.TaxMultiSelectMode) {
            this.TaxSelectedIDs.clear();
        }
        this.cdr.detectChanges();
    }

    /** Toggle a node's selection in multi-select mode */
    public ToggleNodeSelection(node: TaxTreeNode, event: Event): void {
        event.stopPropagation();
        if (this.TaxSelectedIDs.has(node.ID)) {
            this.TaxSelectedIDs.delete(node.ID);
        } else {
            this.TaxSelectedIDs.add(node.ID);
        }
        this.cdr.detectChanges();
    }

    /** Check if a node is selected in multi-select mode */
    public IsNodeMultiSelected(nodeID: string): boolean {
        return this.TaxSelectedIDs.has(nodeID);
    }

    /** Handle drag start on a tree node */
    public OnTreeNodeDragStart(event: DragEvent, node: TaxTreeNode): void {
        if (!event.dataTransfer) return;
        // If dragging a multi-selected node, drag all selected; otherwise just this one
        const dragIDs = this.TaxMultiSelectMode && this.TaxSelectedIDs.has(node.ID)
            ? [...this.TaxSelectedIDs]
            : [node.ID];
        event.dataTransfer.setData('text/plain', JSON.stringify(dragIDs));
        event.dataTransfer.effectAllowed = 'move';
    }

    /** Handle drag over a tree node (drop target) */
    public OnTreeNodeDragOver(event: DragEvent, node: TaxTreeNode): void {
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
        this.TaxDragOverNodeID = node.ID;
    }

    /** Handle drag leave */
    public OnTreeNodeDragLeave(): void {
        this.TaxDragOverNodeID = null;
    }

    /** Handle drop — reparent dragged node(s) under the drop target */
    public async OnTreeNodeDrop(event: DragEvent, targetNode: TaxTreeNode): Promise<void> {
        event.preventDefault();
        this.TaxDragOverNodeID = null;

        const data = event.dataTransfer?.getData('text/plain');
        if (!data) return;

        let dragIDs: string[];
        try { dragIDs = JSON.parse(data); } catch { return; }

        // Prevent dropping onto itself or a descendant
        const targetDescendants = this.collectDescendantIds(targetNode);
        const validIDs = dragIDs.filter(id =>
            !UUIDsEqual(id, targetNode.ID) && !targetDescendants.has(NormalizeUUID(id))
        );

        if (validIDs.length === 0) return;

        this.TaxTreeSaving = true;
        this.cdr.detectChanges();

        const md = this.ProviderToUse;
        let movedCount = 0;
        for (const tagID of validIDs) {
            try {
                const tag = await md.GetEntityObject<MJTagEntity>('MJ: Tags', md.CurrentUser);
                await tag.InnerLoad(new CompositeKey([{ FieldName: 'ID', Value: tagID }]));
                tag.ParentID = targetNode.ID;
                const saved = await tag.Save();
                if (saved) movedCount++;
            } catch {
                // continue with remaining
            }
        }

        if (movedCount > 0) {
            const label = movedCount === 1 ? '1 tag' : `${movedCount} tags`;
            MJNotificationService.Instance.CreateSimpleNotification(`Moved ${label} under "${targetNode.Name}"`, 'success', 2500);
            this.addTaxAuditEntry('moved', `${movedCount} tag(s) → ${targetNode.Name}`);
            this.TaxSelectedIDs.clear();
            await this.RefreshTaxonomyData();
        }

        this.TaxTreeSaving = false;
        this.cdr.detectChanges();
    }

    /** Handle drop on the "Root" drop zone (make root-level) */
    public async OnDropToRoot(event: DragEvent): Promise<void> {
        event.preventDefault();
        this.TaxDragOverNodeID = null;

        const data = event.dataTransfer?.getData('text/plain');
        if (!data) return;

        let dragIDs: string[];
        try { dragIDs = JSON.parse(data); } catch { return; }

        this.TaxTreeSaving = true;
        this.cdr.detectChanges();

        const md = this.ProviderToUse;
        let movedCount = 0;
        for (const tagID of dragIDs) {
            try {
                const tag = await md.GetEntityObject<MJTagEntity>('MJ: Tags', md.CurrentUser);
                await tag.InnerLoad(new CompositeKey([{ FieldName: 'ID', Value: tagID }]));
                if (tag.ParentID != null) {
                    tag.ParentID = null;
                    const saved = await tag.Save();
                    if (saved) movedCount++;
                }
            } catch {
                // continue
            }
        }

        if (movedCount > 0) {
            MJNotificationService.Instance.CreateSimpleNotification(`Moved ${movedCount} tag(s) to root`, 'success', 2500);
            this.addTaxAuditEntry('moved', `${movedCount} tag(s) → root`);
            this.TaxSelectedIDs.clear();
            await this.RefreshTaxonomyData();
        }

        this.TaxTreeSaving = false;
        this.cdr.detectChanges();
    }

    public async MergeTags(sourceTagId: string, targetTagId: string, sourceName: string, targetName: string): Promise<void> {
        if (this.IsMerging) return; // Prevent duplicate calls from button spam
        this.IsMerging = true;
        this.cdr.detectChanges();

        try {
            // Re-parent tagged items from source to target
            const itemsToMove = this.taggedItemsRaw.filter(ti => (ti['TagID'] as string) === sourceTagId);
            const md = this.ProviderToUse;
            for (const ti of itemsToMove) {
                const taggedItem = await md.GetEntityObject<MJTaggedItemEntity>('MJ: Tagged Items', md.CurrentUser);
                await taggedItem.InnerLoad(new CompositeKey([{ FieldName: 'ID', Value: ti['ID'] as string }]));
                taggedItem.TagID = targetTagId;
                if (!await taggedItem.Save()) {
                    MJNotificationService.Instance.CreateSimpleNotification(
                        `Merge failed: ${taggedItem.LatestResult?.CompleteMessage ?? 'unknown error'}`, 'error', 4000
                    );
                    return;
                }
            }

            // Re-parent children of source under target
            const childTags = this.tagsRaw.filter(t => (t['ParentID'] as string) === sourceTagId);
            for (const child of childTags) {
                const childTag = await md.GetEntityObject<MJTagEntity>('MJ: Tags', md.CurrentUser);
                await childTag.InnerLoad(new CompositeKey([{ FieldName: 'ID', Value: child['ID'] as string }]));
                childTag.ParentID = targetTagId;
                if (!await childTag.Save()) {
                    MJNotificationService.Instance.CreateSimpleNotification(
                        `Merge failed: ${childTag.LatestResult?.CompleteMessage ?? 'unknown error'}`, 'error', 4000
                    );
                    return;
                }
            }

            // Clean up co-occurrence records before delete (FK constraint)
            await this.cleanupTagReferences(sourceTagId);

            // Delete source tag (original behavior — hard delete)
            const sourceEntity = await md.GetEntityObject<MJTagEntity>('MJ: Tags', md.CurrentUser);
            await sourceEntity.InnerLoad(new CompositeKey([{ FieldName: 'ID', Value: sourceTagId }]));
            if (!await sourceEntity.Delete()) {
                MJNotificationService.Instance.CreateSimpleNotification(
                    `Merge failed: ${sourceEntity.LatestResult?.CompleteMessage ?? 'unknown error'}`, 'error', 4000
                );
                return;
            }

            this.addTaxAuditEntry('merged', `${sourceName} into ${targetName}`);
            MJNotificationService.Instance.CreateSimpleNotification(`Merged "${sourceName}" into "${targetName}"`, 'success', 3000);
            await this.RefreshTaxonomyData();
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            MJNotificationService.Instance.CreateSimpleNotification(`Merge error: ${msg}`, 'error', 4000);
        } finally {
            this.IsMerging = false;
            this.cdr.detectChanges();
        }
    }

    public async MakeChildTag(childTagId: string, parentTagId: string): Promise<void> {
        try {
            const md = this.ProviderToUse;
            const tag = await md.GetEntityObject<MJTagEntity>('MJ: Tags', md.CurrentUser);
            await tag.InnerLoad(new CompositeKey([{ FieldName: 'ID', Value: childTagId }]));
            tag.ParentID = parentTagId;
            const saved = await tag.Save();
            if (saved) {
                this.addTaxAuditEntry('moved', tag.Name ?? 'tag');
                MJNotificationService.Instance.CreateSimpleNotification('Tag reparented', 'success', 2500);
                await this.RefreshTaxonomyData();
            }
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            MJNotificationService.Instance.CreateSimpleNotification(`Error: ${msg}`, 'error', 4000);
        }
    }

    public DismissDuplicate(pair: TaxDuplicatePair): void {
        this.TaxDuplicates = this.TaxDuplicates.filter(d => d !== pair);
        this.TaxHealth.Duplicates = this.TaxDuplicates.length;
        this.cdr.detectChanges();
    }

    // ── Duplicates ──

    private buildTaxDuplicates(): void {
        const tags = this.tagsRaw
            .filter(t => (t['Status'] as string)?.toLowerCase() !== 'merged')
            .map(t => ({
                ID: t['ID'] as string,
                Name: (t['Name'] as string) ?? ''
            }));

        const pairs: TaxDuplicatePair[] = [];

        // 1. Group exact-name duplicates (case-insensitive) into single entries
        const exactGroups = this.groupExactNameDuplicates(tags);
        const consumedIDs = new Set<string>();

        for (const [, group] of exactGroups) {
            if (group.length < 2) continue;
            // Emit one consolidated entry per group of exact-name duplicates
            pairs.push({
                TagA: group[0].Name,
                TagB: group[0].Name,
                TagAID: group[0].ID,
                TagBID: group[1].ID,
                Similarity: 100,
                SeverityClass: 'high',
                IsExactDuplicate: true,
                ExactDuplicateCount: group.length,
                AllIDs: group.map(t => t.ID)
            });
            for (const t of group) consumedIDs.add(t.ID);
        }

        // 2. Fuzzy/similar pairs — skip any tags already covered by exact-name groups
        for (let i = 0; i < tags.length; i++) {
            if (consumedIDs.has(tags[i].ID)) continue;
            for (let j = i + 1; j < tags.length; j++) {
                if (consumedIDs.has(tags[j].ID)) continue;
                const sim = this.computeStringSimilarity(tags[i].Name, tags[j].Name);
                if (sim >= 0.70) {
                    pairs.push({
                        TagA: tags[i].Name,
                        TagB: tags[j].Name,
                        TagAID: tags[i].ID,
                        TagBID: tags[j].ID,
                        Similarity: Math.round(sim * 100),
                        SeverityClass: sim >= 0.85 ? 'high' : 'moderate',
                        IsExactDuplicate: false,
                        ExactDuplicateCount: 0,
                        AllIDs: []
                    });
                }
            }
        }

        pairs.sort((a, b) => b.Similarity - a.Similarity);
        this.TaxDuplicates = pairs;
    }

    /** Group tags by case-insensitive name, returning only groups with 2+ members */
    private groupExactNameDuplicates(tags: { ID: string; Name: string }[]): Map<string, { ID: string; Name: string }[]> {
        const groups = new Map<string, { ID: string; Name: string }[]>();
        for (const tag of tags) {
            const key = tag.Name.toLowerCase().trim();
            const group = groups.get(key);
            if (group) {
                group.push(tag);
            } else {
                groups.set(key, [tag]);
            }
        }
        return groups;
    }

    /**
     * Enhanced string similarity: separator normalization, abbreviation,
     * pluralization, token-overlap Jaccard, containment, and Levenshtein.
     * Returns the highest score among all heuristics.
     */
    private computeStringSimilarity(a: string, b: string): number {
        const la = a.toLowerCase().trim();
        const lb = b.toLowerCase().trim();
        if (la === lb) return 1.0;

        // Strip separators and compare
        const normA = la.replace(/[\s\-_&]+/g, '');
        const normB = lb.replace(/[\s\-_&]+/g, '');
        if (normA === normB) return 0.98;

        let best = 0;

        // Abbreviation
        if (this.isAbbreviationOf(la, lb) || this.isAbbreviationOf(lb, la)) {
            best = Math.max(best, 0.90);
        }

        // Pluralization
        best = Math.max(best, this.computePluralizationScore(la, lb));

        // Token Jaccard
        best = Math.max(best, this.computeTokenJaccardSimilarity(la, lb));

        // Containment
        if (lb.includes(la) || la.includes(lb)) {
            const shorter = la.length < lb.length ? la : lb;
            const longer = la.length < lb.length ? lb : la;
            best = Math.max(best, shorter.length / longer.length);
        }

        // Levenshtein
        const dist = this.levenshteinDistance(la, lb);
        const maxLen = Math.max(la.length, lb.length);
        if (maxLen > 0) {
            best = Math.max(best, 1 - dist / maxLen);
        }

        return best;
    }

    /** Scores simple English pluralization differences */
    private computePluralizationScore(a: string, b: string): number {
        const shorter = a.length <= b.length ? a : b;
        const longer = a.length <= b.length ? b : a;
        if (longer === shorter + 's') return 0.95;
        if (longer === shorter + 'es') return 0.95;
        if (shorter.endsWith('y') && longer === shorter.slice(0, -1) + 'ies') return 0.95;
        return 0;
    }

    /** Jaccard similarity on word tokens */
    private computeTokenJaccardSimilarity(a: string, b: string): number {
        const tokensA = new Set(a.split(/[\s\-_&]+/).filter(w => w.length > 0));
        const tokensB = new Set(b.split(/[\s\-_&]+/).filter(w => w.length > 0));
        if (tokensA.size === 0 || tokensB.size === 0) return 0;
        let intersection = 0;
        for (const token of tokensA) {
            if (tokensB.has(token)) intersection++;
        }
        const union = tokensA.size + tokensB.size - intersection;
        return union > 0 ? intersection / union : 0;
    }

    private isAbbreviationOf(short: string, long: string): boolean {
        if (short.length >= long.length) return false;
        if (short.length < 2) return false;

        // Check if short is initials of words in long
        const words = long.split(/[\s\-_&]+/).filter(w => w.length > 0);
        if (words.length < 2) return false;
        const initials = words.map(w => w[0]).join('');
        return initials === short;
    }

    private levenshteinDistance(a: string, b: string): number {
        const m = a.length;
        const n = b.length;
        const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0) as number[]);

        for (let i = 0; i <= m; i++) dp[i][0] = i;
        for (let j = 0; j <= n; j++) dp[0][j] = j;

        for (let i = 1; i <= m; i++) {
            for (let j = 1; j <= n; j++) {
                const cost = a[i - 1] === b[j - 1] ? 0 : 1;
                dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
            }
        }
        return dp[m][n];
    }

    // ── Orphans ──

    /**
     * Finds orphan tags: no parent, no children, and zero usage.
     * A tag with even 1 connection is not orphaned — it's just a leaf.
     * Uses NormalizeUUID for consistent cross-platform UUID comparisons.
     */
    private buildTaxOrphans(): void {
        const tagItemCounts = this.tagAggregateCounts;
        const tagAvgWeights = this.tagAggregateWeights;
        const hasChildren = new Set<string>();
        for (const t of this.tagsRaw) {
            const pid = t['ParentID'] as string;
            if (pid) hasChildren.add(NormalizeUUID(pid));
        }

        this.TaxOrphans = this.tagsRaw
            .filter(t => {
                const normalizedId = NormalizeUUID(t['ID'] as string);
                const parentId = t['ParentID'] as string | null;
                const status = (t['Status'] as string)?.toLowerCase();
                const itemCount = tagItemCounts.get(normalizedId) ?? 0;
                // Skip merged tags — they're soft-deleted
                if (status === 'merged') return false;
                // Orphan: no parent, no children, and zero connections
                return !parentId && !hasChildren.has(normalizedId) && itemCount === 0;
            })
            .map(t => {
                const id = t['ID'] as string;
                const normalizedId = NormalizeUUID(id);
                const itemCount = tagItemCounts.get(normalizedId) ?? 0;
                return {
                    ID: id,
                    Name: (t['Name'] as string) ?? 'Unnamed',
                    UsageCount: itemCount,
                    AvgWeight: tagAvgWeights.get(normalizedId) ?? 0,
                    FirstSeen: formatShortDate((t['__mj_CreatedAt'] as string) ?? ''),
                    LastSeen: formatShortDate((t['__mj_UpdatedAt'] as string) ?? ''),
                    IsSelected: false
                };
            })
            .sort((a, b) => a.UsageCount - b.UsageCount);
    }

    public ToggleOrphanSelection(orphan: TaxOrphanCard): void {
        orphan.IsSelected = !orphan.IsSelected;
        this.TaxAllOrphansSelected = this.TaxOrphans.every(o => o.IsSelected);
        this.cdr.detectChanges();
    }

    public ToggleAllOrphans(): void {
        this.TaxAllOrphansSelected = !this.TaxAllOrphansSelected;
        for (const o of this.TaxOrphans) {
            o.IsSelected = this.TaxAllOrphansSelected;
        }
        this.cdr.detectChanges();
    }

    /**
     * Clean up TagCoOccurrence records that reference a tag before deleting it.
     * Without this, the FK constraint on TagCoOccurrence blocks the delete.
     */
    private async cleanupTagReferences(tagId: string): Promise<void> {
        const rv = RunView.FromMetadataProvider(this.ProviderToUse);
        const coOccResult = await rv.RunView<BaseEntity>({
            EntityName: 'MJ: Tag Co Occurrences',
            ExtraFilter: `TagAID='${tagId}' OR TagBID='${tagId}'`,
            ResultType: 'entity_object'
        });
        if (coOccResult.Success) {
            for (const coOcc of coOccResult.Results) {
                await coOcc.Delete();
            }
        }
    }

    public DeleteOrphan(orphan: TaxOrphanCard): void {
        this.OpenConfirmDialog(
            'Delete Orphan Tag',
            `Delete orphan tag "${orphan.Name}"?`,
            async () => {
                try {
                    await this.cleanupTagReferences(orphan.ID);
                    const md = this.ProviderToUse;
                    const tag = await md.GetEntityObject<MJTagEntity>('MJ: Tags', md.CurrentUser);
                    await tag.InnerLoad(new CompositeKey([{ FieldName: 'ID', Value: orphan.ID }]));
                    const deleted = await tag.Delete();
                    if (deleted) {
                        this.addTaxAuditEntry('deleted', orphan.Name);
                        MJNotificationService.Instance.CreateSimpleNotification('Orphan tag deleted', 'success', 2500);
                        this.TaxOrphans = this.TaxOrphans.filter(o => !UUIDsEqual(o.ID, orphan.ID));
                        this.TaxHealth.Orphaned = this.TaxOrphans.length;
                        this.cdr.detectChanges();
                    }
                } catch (error) {
                    const msg = error instanceof Error ? error.message : String(error);
                    MJNotificationService.Instance.CreateSimpleNotification(`Error: ${msg}`, 'error', 4000);
                }
            }
        );
    }

    public BulkDeleteOrphans(): void {
        const selected = this.TaxOrphans.filter(o => o.IsSelected);
        if (selected.length === 0) return;

        this.OpenConfirmDialog(
            'Bulk Delete Orphan Tags',
            `Delete ${selected.length} selected orphan tag${selected.length > 1 ? 's' : ''}? This cannot be undone.`,
            async () => {
                const md = this.ProviderToUse;
                let deletedCount = 0;
                for (const orphan of selected) {
                    try {
                        await this.cleanupTagReferences(orphan.ID);
                        const tag = await md.GetEntityObject<MJTagEntity>('MJ: Tags', md.CurrentUser);
                        await tag.InnerLoad(new CompositeKey([{ FieldName: 'ID', Value: orphan.ID }]));
                        if (await tag.Delete()) {
                            deletedCount++;
                            this.addTaxAuditEntry('deleted', orphan.Name);
                        }
                    } catch {
                        // continue with remaining
                    }
                }

                MJNotificationService.Instance.CreateSimpleNotification(`Deleted ${deletedCount} tags`, 'success', 3000);
                this.TaxOrphans = this.TaxOrphans.filter(o => !o.IsSelected);
                this.TaxHealth.Orphaned = this.TaxOrphans.length;
                this.TaxAllOrphansSelected = false;
                this.cdr.detectChanges();
            }
        );
    }

    /** Delete all orphan tags at once with a styled confirmation dialog */
    public DeleteAllOrphans(): void {
        if (this.TaxOrphans.length === 0) return;
        this.OpenConfirmDialog(
            'Delete All Orphaned Tags',
            `Delete all ${this.TaxOrphans.length} orphaned tag${this.TaxOrphans.length > 1 ? 's' : ''}? This cannot be undone.`,
            async () => {
                const md = this.ProviderToUse;
                let deletedCount = 0;
                for (const orphan of this.TaxOrphans) {
                    try {
                        const tag = await md.GetEntityObject<MJTagEntity>('MJ: Tags', md.CurrentUser);
                        await tag.InnerLoad(new CompositeKey([{ FieldName: 'ID', Value: orphan.ID }]));
                        if (await tag.Delete()) {
                            deletedCount++;
                            this.addTaxAuditEntry('deleted', orphan.Name);
                        }
                    } catch {
                        // continue with remaining
                    }
                }

                MJNotificationService.Instance.CreateSimpleNotification(`Deleted ${deletedCount} orphan tags`, 'success', 3000);
                this.TaxOrphans = [];
                this.TaxHealth.Orphaned = 0;
                this.TaxAllOrphansSelected = false;
                this.cdr.detectChanges();
            }
        );
    }

    // ── Treemap ──

    private buildTaxTreemap(): void {
        // Build treemap cells from root-level tags, sized by item count
        const tagItemCounts = this.countItemsByTag();

        // Group tags by root parent
        const rootGroups = new Map<string, { Name: string; TotalItems: number }>();
        for (const node of this.TaxTreeNodes) {
            rootGroups.set(node.ID, { Name: node.Name, TotalItems: node.ItemCount });
        }

        const colorFamilies = ['at-tm-blue', 'at-tm-green', 'at-tm-purple', 'at-tm-orange'];
        const cells: TaxTreemapCell[] = [];
        let colorIdx = 0;

        // For each root, add children as cells
        for (const root of this.TaxTreeNodes) {
            const family = colorFamilies[colorIdx % colorFamilies.length];
            let shadeIdx = 1;

            // Add root children (or the root itself if it has no children)
            const childNodes = root.Children.length > 0 ? root.Children : [root];
            const sortedChildren = [...childNodes].sort((a, b) => b.ItemCount - a.ItemCount);

            for (const child of sortedChildren.slice(0, 4)) {
                cells.push({
                    ID: child.ID,
                    Name: child.Name,
                    ItemCount: child.ItemCount,
                    ColorClass: `${family}-${shadeIdx}`,
                    RowSpan: child.ItemCount > 10 ? 2 : 1
                });
                shadeIdx++;
            }
            colorIdx++;
        }

        this.TaxTreemapCells = cells;

        // KPIs
        const totalTags = this.tagsRaw.length;
        const maxDepth = this.TaxFlatNodes.length > 0
            ? Math.max(...this.TaxFlatNodes.map(n => n.Depth))
            : 0;
        const avgDepth = this.TaxFlatNodes.length > 0
            ? (this.TaxFlatNodes.reduce((sum, n) => sum + n.Depth, 0) / this.TaxFlatNodes.length).toFixed(1)
            : '0';
        const mostUsed = this.TaxFlatNodes.length > 0
            ? [...this.TaxFlatNodes].sort((a, b) => b.ItemCount - a.ItemCount)[0]?.Name ?? 'None'
            : 'None';

        this.TaxTreemapKPIs = [
            { Label: 'Total Tags', Value: String(totalTags) },
            { Label: 'Avg Depth', Value: avgDepth },
            { Label: 'Max Depth', Value: String(maxDepth) },
            { Label: 'Most Used Tag', Value: mostUsed }
        ];
    }

    // ── Audit Log ──

    /**
     * Builds the audit timeline from the MJ: Tag Audit Logs entity.
     * Falls back to synthesizing "created" events from tag creation dates
     * if no real audit log records exist yet.
     */
    private buildTaxAuditLog(): void {
        if (this.tagAuditLogsRaw.length > 0) {
            this.TaxAuditEvents = this.buildAuditEventsFromLogs();
        } else {
            this.TaxAuditEvents = this.synthesizeAuditEventsFromTags();
        }
    }

    /**
     * Maps real Tag Audit Log records into TaxAuditEvent objects.
     * Uses the view's denormalized Tag, PerformedByUser, and RelatedTag fields.
     */
    private buildAuditEventsFromLogs(): TaxAuditEvent[] {
        const events: TaxAuditEvent[] = [];

        for (const log of this.tagAuditLogsRaw) {
            const action = (log['Action'] as string) ?? '';
            const type = this.mapAuditActionToType(action);
            if (!type) continue;

            const tagName = (log['Tag'] as string) ?? 'Unknown';
            const relatedTag = (log['RelatedTag'] as string) ?? '';
            const user = (log['PerformedByUser'] as string) ?? 'System';
            const createdAt = (log['__mj_CreatedAt'] as string) ?? '';
            const details = this.parseAuditDetails(log['Details'] as string | null);

            events.push({
                Type: type,
                Description: this.buildAuditDescription(type, tagName, relatedTag, details),
                TagRef: tagName,
                User: user,
                Timestamp: formatDate(createdAt),
                DayHeader: this.formatDayHeader(createdAt)
            });
        }

        return events;
    }

    /**
     * Synthesizes audit events from tag __mj_CreatedAt dates when no
     * real audit log records exist. Used as a fallback only.
     */
    private synthesizeAuditEventsFromTags(): TaxAuditEvent[] {
        const events: TaxAuditEvent[] = [];
        for (const tag of this.tagsRaw) {
            const name = (tag['Name'] as string) ?? 'Unnamed';
            const createdAt = tag['__mj_CreatedAt'] as string;
            if (createdAt) {
                events.push({
                    Type: 'created',
                    Description: 'Tag created',
                    TagRef: name,
                    User: 'System',
                    Timestamp: formatDate(createdAt),
                    DayHeader: this.formatDayHeader(createdAt)
                });
            }
        }
        events.sort((a, b) => b.Timestamp.localeCompare(a.Timestamp));
        return events.slice(0, 50);
    }

    /**
     * Maps a PascalCase DB Action value (e.g. "Renamed") to the lowercase
     * TaxAuditAction type used in the UI. Returns null for unrecognized values.
     */
    private mapAuditActionToType(action: string): TaxAuditAction | null {
        const mapped = action.toLowerCase() as TaxAuditAction;
        const validTypes: Set<string> = new Set<string>([
            'created', 'merged', 'moved', 'deleted', 'renamed',
            'deprecated', 'descriptionchanged', 'reactivated', 'split'
        ]);
        return validTypes.has(mapped) ? mapped : null;
    }

    /**
     * Safely parses the JSON Details column from a Tag Audit Log record.
     * Returns an empty object on parse failure.
     */
    private parseAuditDetails(details: string | null): Record<string, string> {
        if (!details) return {};
        try {
            return JSON.parse(details) as Record<string, string>;
        } catch {
            return {};
        }
    }

    /**
     * Builds a human-readable description for an audit event based on the
     * action type and any additional context from the related tag or details JSON.
     */
    private buildAuditDescription(type: TaxAuditAction, tagName: string, relatedTag: string, details: Record<string, string>): string {
        switch (type) {
            case 'created':
                return 'Tag created';
            case 'renamed': {
                const oldName = details['OldName'];
                return oldName ? `Renamed from "${oldName}"` : 'Tag renamed';
            }
            case 'moved': {
                return 'Tag moved to new parent';
            }
            case 'merged':
                return relatedTag ? `Merged into "${relatedTag}"` : 'Tags merged';
            case 'split':
                return relatedTag ? `Split from "${relatedTag}"` : 'Tag split';
            case 'deleted':
                return 'Tag deleted';
            case 'deprecated':
                return 'Tag deprecated';
            case 'reactivated':
                return 'Tag reactivated';
            case 'descriptionchanged':
                return 'Description updated';
            default:
                return `Tag ${type}`;
        }
    }

    /**
     * Adds a local-only audit entry to the top of the timeline for
     * immediate UI feedback after a user action (merge, delete, etc.).
     */
    private addTaxAuditEntry(type: TaxAuditAction, tagRef: string): void {
        const now = new Date().toISOString();
        this.TaxAuditEvents.unshift({
            Type: type,
            Description: this.buildAuditDescription(type, tagRef, '', {}),
            TagRef: tagRef,
            User: 'You',
            Timestamp: formatDate(now),
            DayHeader: 'Today'
        });
    }

    public ToggleTaxAuditFilter(type: string): void {
        if (this.TaxAuditFilterTypes.has(type)) {
            this.TaxAuditFilterTypes.delete(type);
        } else {
            this.TaxAuditFilterTypes.add(type);
        }
        this.cdr.detectChanges();
    }

    public GetFilteredAuditEvents(): TaxAuditEvent[] {
        return this.TaxAuditEvents.filter(e => this.TaxAuditFilterTypes.has(e.Type));
    }

    private formatDayHeader(dateStr: string): string {
        try {
            const d = new Date(dateStr);
            const today = new Date();
            const yesterday = new Date(today);
            yesterday.setDate(yesterday.getDate() - 1);

            if (d.toDateString() === today.toDateString()) return 'Today';
            if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
            return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
        } catch {
            return '';
        }
    }

    // ── Health Stats ──

    private buildTaxHealth(): void {
        const total = this.tagsRaw.length;
        const orphaned = this.TaxOrphans.length;
        const duplicates = this.TaxDuplicates.length;
        const needAttention = this.TaxFlatNodes.filter(n => n.HealthColor === 'yellow').length;
        const healthy = total - orphaned - needAttention;

        this.TaxHealth = { Total: total, Healthy: Math.max(0, healthy), NeedAttention: needAttention, Orphaned: orphaned, Duplicates: duplicates };
    }

    /** Returns the Font Awesome icon class for an audit event action type. */
    public GetTaxAuditIcon(type: string): string {
        const map: Record<string, string> = {
            'created': 'fa-solid fa-plus',
            'merged': 'fa-solid fa-code-merge',
            'moved': 'fa-solid fa-arrows-up-down',
            'deleted': 'fa-solid fa-trash',
            'renamed': 'fa-solid fa-pen',
            'deprecated': 'fa-solid fa-ban',
            'descriptionchanged': 'fa-solid fa-file-pen',
            'reactivated': 'fa-solid fa-rotate-left',
            'split': 'fa-solid fa-code-branch'
        };
        return map[type] ?? 'fa-solid fa-circle';
    }

    // ── Confirmation Dialog ──

    /** Opens a styled confirmation dialog, replacing browser `confirm()`. */
    public OpenConfirmDialog(title: string, message: string, action: () => Promise<void>): void {
        this.ConfirmDialogTitle = title;
        this.ConfirmDialogMessage = message;
        this.confirmDialogAction = action;
        this.ShowConfirmDialog = true;
        this.cdr.detectChanges();
    }

    /** User confirmed the dialog action */
    public async ConfirmDialogAccept(): Promise<void> {
        this.ShowConfirmDialog = false;
        if (this.confirmDialogAction) {
            await this.confirmDialogAction();
        }
        this.confirmDialogAction = null;
        this.cdr.detectChanges();
    }

    /** User cancelled the confirmation dialog */
    public ConfirmDialogCancel(): void {
        this.ShowConfirmDialog = false;
        this.confirmDialogAction = null;
        this.cdr.detectChanges();
    }

    // ── Split Dialog ──

    /** Opens the split-tag dialog for a given tree node */
    public OpenSplitDialog(node: TaxTreeNode): void {
        this.splitTargetNode = node;
        this.SplitChildNames = '';
        this.ShowSplitDialog = true;
        this.cdr.detectChanges();
    }

    /** Closes the split-tag dialog without action */
    public CloseSplitDialog(): void {
        this.ShowSplitDialog = false;
        this.splitTargetNode = null;
        this.SplitChildNames = '';
        this.cdr.detectChanges();
    }

    /** Executes the split operation, creating child tags from comma-separated names */
    public async ExecuteSplit(): Promise<void> {
        if (!this.splitTargetNode || !this.SplitChildNames.trim()) return;
        const names = this.SplitChildNames.split(',')
            .map(n => n.trim())
            .filter(n => n.length > 0);
        if (names.length === 0) return;

        this.ShowSplitDialog = false;
        const nodeName = this.splitTargetNode.Name;
        const parentId = this.splitTargetNode.ParentID;

        try {
            const md = this.ProviderToUse;
            for (const name of names) {
                const tag = await md.GetEntityObject<MJTagEntity>('MJ: Tags', md.CurrentUser);
                tag.NewRecord();
                tag.Name = name;
                tag.DisplayName = name;
                tag.ParentID = parentId;
                await tag.Save();
            }

            this.addTaxAuditEntry('split', `${nodeName} into ${names.join(', ')}`);
            MJNotificationService.Instance.CreateSimpleNotification(
                `Split "${nodeName}" into ${names.length} new tags`, 'success', 3000
            );
            await this.RefreshTaxonomyData();
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            MJNotificationService.Instance.CreateSimpleNotification(`Split error: ${msg}`, 'error', 4000);
        }
        this.splitTargetNode = null;
        this.SplitChildNames = '';
        this.cdr.detectChanges();
    }

    // ── Move Dialog ──

    /** Opens the move-tag dialog for a given tree node */
    public OpenMoveDialog(node: TaxTreeNode): void {
        this.moveTargetNode = node;
        this.MoveNewParentID = node.ParentID;
        this.ShowMoveDialog = true;
        this.cdr.detectChanges();
    }

    /** Closes the move-tag dialog without action */
    public CloseMoveDialog(): void {
        this.ShowMoveDialog = false;
        this.moveTargetNode = null;
        this.MoveNewParentID = null;
        this.cdr.detectChanges();
    }

    /** Returns flat list of tags eligible as move targets (excludes the node being moved and its descendants) */
    public GetMoveTargetOptions(): { ID: string; Name: string; Depth: number }[] {
        if (!this.moveTargetNode) return [];
        const excludeIds = this.collectDescendantIds(this.moveTargetNode);
        excludeIds.add(NormalizeUUID(this.moveTargetNode.ID));

        return this.TaxFlatNodes
            .filter(n => !excludeIds.has(NormalizeUUID(n.ID)))
            .map(n => ({ ID: n.ID, Name: n.Name, Depth: n.Depth }));
    }

    /** Collects IDs of all descendants of a node */
    private collectDescendantIds(node: TaxTreeNode): Set<string> {
        const ids = new Set<string>();
        for (const child of node.Children) {
            ids.add(NormalizeUUID(child.ID));
            for (const id of this.collectDescendantIds(child)) {
                ids.add(id);
            }
        }
        return ids;
    }

    /** Executes the move operation */
    public async ExecuteMove(): Promise<void> {
        if (!this.moveTargetNode) return;
        const newParent = this.MoveNewParentID;
        this.ShowMoveDialog = false;

        await this.MoveTag(this.moveTargetNode, newParent);
        this.moveTargetNode = null;
        this.MoveNewParentID = null;
        this.cdr.detectChanges();
    }

    // ── Merge Into Dialog ──

    public OpenMergeIntoDialog(node: TaxTreeNode): void {
        this.MergeSourceTag = node;
        this.MergeTargetID = null;
        this.MergeTargetData = this.GetMergeTargetOptions().map(o => ({
            ID: o.ID,
            Label: `${'  '.repeat(o.Depth)}${o.Name} (${o.ItemCount})`
        }));
        this.ShowMergeIntoDialog = true;
        this.cdr.detectChanges();
    }

    public OnMergeTargetSelected(value: unknown): void {
        this.MergeTargetID = value != null ? String(value) : null;
    }

    public CloseMergeIntoDialog(): void {
        this.ShowMergeIntoDialog = false;
        this.MergeSourceTag = null;
        this.MergeTargetID = null;
        this.cdr.detectChanges();
    }

    /** Returns flat list of tags eligible as merge targets (excludes the source tag) */
    public GetMergeTargetOptions(): { ID: string; Name: string; Depth: number; ItemCount: number }[] {
        if (!this.MergeSourceTag) return [];
        const sourceNormalized = NormalizeUUID(this.MergeSourceTag.ID);

        return this.TaxFlatNodes
            .filter(n => NormalizeUUID(n.ID) !== sourceNormalized)
            .map(n => ({ ID: n.ID, Name: n.Name, Depth: n.Depth, ItemCount: n.ItemCount }));
    }

    public async ExecuteMergeInto(): Promise<void> {
        if (!this.MergeSourceTag || !this.MergeTargetID) return;
        const targetNode = this.TaxFlatNodes.find(n => UUIDsEqual(n.ID, this.MergeTargetID!));
        const targetName = targetNode?.Name ?? 'Unknown';
        const sourceName = this.MergeSourceTag.Name;
        const sourceId = this.MergeSourceTag.ID;
        const targetId = this.MergeTargetID;

        this.ShowMergeIntoDialog = false;
        await this.MergeTags(sourceId, targetId, sourceName, targetName);
        this.MergeSourceTag = null;
        this.MergeTargetID = null;
    }

    // ── Treemap Drill-In ──

    /** Opens treemap drill-in panel for the given cell */
    public OpenTreemapDrillIn(cell: TaxTreemapCell): void {
        const node = this.TaxFlatNodes.find(n => UUIDsEqual(n.ID, cell.ID));
        if (node) {
            this.TreemapDrillInNode = node;
            this.ShowTreemapDrillIn = true;
            this.loadRecentItemsForTag(node);
            this.cdr.detectChanges();
        }
    }

    /** Closes treemap drill-in panel */
    public CloseTreemapDrillIn(): void {
        this.ShowTreemapDrillIn = false;
        this.TreemapDrillInNode = null;
        this.cdr.detectChanges();
    }

    /** Navigate from treemap drill-in to the tag in the tree view */
    public DrillInToTreeView(node: TaxTreeNode): void {
        this.CloseTreemapDrillIn();
        this.SwitchTaxSubTab('tree');
        this.SelectTaxNode(node);
    }

    public async RefreshTaxonomyData(): Promise<void> {
        await this.loadTaxonomyData();
        this.DataChanged.emit();
        this.cdr.detectChanges();
    }
}
