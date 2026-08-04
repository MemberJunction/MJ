/**
 * @fileoverview Knowledge Hub "Visualize" Resource (host surface)
 *
 * Phase 5 host surface that replaces the standalone "Clusters" tab. It hosts two
 * visualization modes behind an internal segmented control:
 *   - "Clusters"  — the existing cluster scatter visualization (embedded child).
 *   - "Tag Cloud" — a weighted tag cloud driven by TagCloudEngine.
 *
 * Both modes feed ONE shared record-drilldown panel:
 *   - cluster point selection  → a single record opened/listed.
 *   - tag-cloud word selection → the records carrying that tag (via RunView).
 *
 * The host owns the resource lifecycle (NotifyLoadComplete), agent context
 * (ActiveVisualizationMode), and all navigation — the embedded children emit
 * open-record intents up to here.
 */

import { Component, ChangeDetectorRef, OnDestroy, AfterViewInit, inject, ViewChild } from '@angular/core';
import { Subject } from 'rxjs';
import { CompositeKey, RunView } from '@memberjunction/core';
import { ResourceData, UserInfoEngine } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent, NavigationService } from '@memberjunction/ng-shared';
import { TagCloudScope } from '@memberjunction/tag-engine-base';
import { TagCloudComponent, TagCloudSelection } from './tag-cloud/tag-cloud.component';
import { DrilldownRecord, DrilldownOpenRequest } from './record-drilldown/record-drilldown.component';
import {
    buildVisualizeAgentContext,
    resolveDrilldownRecord,
    capVisualizeList,
    VISUALIZATION_MODES,
    VisualizationModeId,
    DrilldownRecordSummary,
} from './visualize-agent-context';
import { validateEnumParam, validateStringParam } from '../../../shared/agent-tool-validation';

/** Visualization modes hosted by this surface. */
export type VisualizationMode = 'clusters' | 'tagcloud';

interface ModeOption {
    ID: VisualizationMode;
    Label: string;
    Icon: string;
}

@RegisterClass(BaseResourceComponent, 'VisualizationResource')
@Component({
    standalone: false,
    selector: 'app-visualize-resource',
    templateUrl: './visualize-resource.component.html',
    styleUrls: ['./visualize-resource.component.css'],
})
export class VisualizeResourceComponent extends BaseResourceComponent implements AfterViewInit, OnDestroy {
    @ViewChild('tagCloud') tagCloud?: TagCloudComponent;

    private cdr = inject(ChangeDetectorRef);
    protected override navigationService = inject(NavigationService);
    protected override destroy$ = new Subject<void>();

    // ================================================================
    // Resource overrides
    // ================================================================

    async GetResourceDisplayName(_data: ResourceData): Promise<string> {
        return 'Visualize';
    }

    async GetResourceIconClass(_data: ResourceData): Promise<string> {
        return 'fa-solid fa-circle-nodes';
    }

    // ================================================================
    // Mode switch
    // ================================================================

    public Modes: ModeOption[] = [
        { ID: 'clusters', Label: 'Clusters', Icon: 'fa-solid fa-circle-nodes' },
        { ID: 'tagcloud', Label: 'Tag Cloud', Icon: 'fa-solid fa-cloud' },
    ];

    public ActiveMode: VisualizationMode = 'clusters';

    // ================================================================
    // Shared drilldown state
    // ================================================================

    public DrilldownVisible = false;
    public DrilldownTitle = '';
    public DrilldownSubtitle = '';
    public DrilldownIcon = 'fa-solid fa-list';
    public DrilldownLoading = false;
    public DrilldownRecords: DrilldownRecord[] = [];

    // ================================================================
    // Preferences
    // ================================================================

    /** Current preference key for the active mode. */
    private static readonly PREFS_KEY = 'KH_Visualize_Mode';
    /** Legacy key (pre-rename) — read for back-compat only. */
    private static readonly LEGACY_PREFS_KEY = 'KH_Clusters_ActiveTab';

    // ================================================================
    // Lifecycle
    // ================================================================

    async ngAfterViewInit(): Promise<void> {
        await UserInfoEngine.Instance.Config(false);
        this.loadModePreference();
        this.emitAgentContext();
        this.registerAgentTools();
        // loadModePreference() may flip ActiveMode AFTER the view's first CD pass
        // (it runs post-`await`), which swaps the `@if (IsActiveMode('clusters'))`
        // branch and the embedded child's count bindings mid-cycle — surfacing an
        // NG0100. Flush once here so the mode is settled before the next checked render.
        this.cdr.detectChanges();
        this.NotifyLoadComplete();
    }

    ngOnDestroy(): void {
        super.ngOnDestroy();
        this.destroy$.next();
        this.destroy$.complete();
    }

    // ================================================================
    // Mode switching
    // ================================================================

    public SelectMode(mode: VisualizationMode): void {
        if (this.ActiveMode === mode) {
            return;
        }
        this.ActiveMode = mode;
        this.CloseDrilldown();
        this.persistModePreference();
        this.emitAgentContext();
        this.cdr.detectChanges();
    }

    public IsActiveMode(mode: VisualizationMode): boolean {
        return this.ActiveMode === mode;
    }

    public TrackByMode(_index: number, mode: ModeOption): string {
        return mode.ID;
    }

    // ================================================================
    // Drilldown — shared by both modes
    // ================================================================

    /** Cluster mode: open the underlying entity record directly. */
    public OnClusterOpenRecord(request: { EntityName: string; RecordID: string }): void {
        this.openEntityRecord(request.EntityName, request.RecordID);
    }

    /** Tag-cloud mode: list the records carrying the clicked tag in the drilldown. */
    public async OnTagSelected(selection: TagCloudSelection): Promise<void> {
        this.DrilldownVisible = true;
        this.DrilldownLoading = true;
        this.DrilldownIcon = 'fa-solid fa-tag';
        this.DrilldownTitle = selection.Tag;
        this.DrilldownSubtitle = `${selection.Count} tagged ${selection.Count === 1 ? 'record' : 'records'}`;
        this.DrilldownRecords = [];
        this.cdr.detectChanges();

        this.emitAgentContext();

        try {
            this.DrilldownRecords = await this.loadRecordsForTag(selection.Tag, selection.Scope);
        } catch (error) {
            console.error('[Visualize] Error loading tag records:', error);
            this.DrilldownRecords = [];
        } finally {
            this.DrilldownLoading = false;
            this.emitAgentContext();
            this.cdr.detectChanges();
        }
    }

    /** Drilldown open-record intent (from the shared panel). */
    public OnDrilldownOpenRecord(request: DrilldownOpenRequest): void {
        this.openEntityRecord(request.EntityName, request.RecordID);
    }

    public CloseDrilldown(): void {
        this.DrilldownVisible = false;
        this.DrilldownRecords = [];
        this.DrilldownLoading = false;
        this.emitAgentContext();
        this.cdr.detectChanges();
    }

    // ================================================================
    // Private helpers
    // ================================================================

    /**
     * Load the content-item records carrying a given tag, scoped to the same
     * content-source / content-type the cloud was built with. Each returned row
     * is a `MJ: Content Items` record the user can open.
     */
    private async loadRecordsForTag(tag: string, scope: TagCloudScope): Promise<DrilldownRecord[]> {
        const rv = RunView.FromMetadataProvider(this.ProviderToUse);
        const user = this.ProviderToUse.CurrentUser;

        // 1) Tag rows for this tag text → ItemID + Weight.
        const safeTag = tag.replace(/'/g, "''");
        const tagResult = await rv.RunView<{ ItemID: string; Item: string | null; Weight: number }>({
            EntityName: 'MJ: Content Item Tags',
            ExtraFilter: `Tag = '${safeTag}'`,
            Fields: ['ItemID', 'Item', 'Weight'],
            MaxRows: 200,
            ResultType: 'simple',
        }, user);

        if (!tagResult.Success || tagResult.Results.length === 0) {
            return [];
        }

        // De-dupe by ItemID, keep the highest weight seen.
        const byItem = new Map<string, { item: string | null; weight: number }>();
        for (const row of tagResult.Results) {
            const existing = byItem.get(row.ItemID);
            if (!existing || row.Weight > existing.weight) {
                byItem.set(row.ItemID, { item: row.Item, weight: row.Weight });
            }
        }
        const itemIDs = Array.from(byItem.keys());

        // 2) Resolve content-item details, narrowed by scope when present.
        const itemFilter = this.buildItemFilter(itemIDs, scope);
        const itemResult = await rv.RunView<{
            ID: string; Name: string | null; ContentSource: string | null; ContentType: string;
        }>({
            EntityName: 'MJ: Content Items',
            ExtraFilter: itemFilter,
            Fields: ['ID', 'Name', 'ContentSource', 'ContentType'],
            MaxRows: 200,
            ResultType: 'simple',
        }, user);

        if (!itemResult.Success) {
            return [];
        }

        return itemResult.Results.map(item => {
            const tagged = byItem.get(item.ID);
            const subtitleParts = [item.ContentType, item.ContentSource].filter(p => !!p);
            return {
                EntityName: 'MJ: Content Items',
                RecordID: item.ID,
                Title: item.Name || tagged?.item || 'Untitled',
                Subtitle: subtitleParts.join(' · '),
                Weight: tagged?.weight,
            } as DrilldownRecord;
        }).sort((a, b) => (b.Weight ?? 0) - (a.Weight ?? 0));
    }

    /** Build the `MJ: Content Items` filter: ID IN (...) plus optional scope. */
    private buildItemFilter(itemIDs: string[], scope: TagCloudScope): string {
        const fragments: string[] = [];
        if (itemIDs.length > 0) {
            const quoted = itemIDs.map(id => `'${id.replace(/'/g, "''")}'`).join(', ');
            fragments.push(`ID IN (${quoted})`);
        }
        if (scope.ContentSourceIDs && scope.ContentSourceIDs.length > 0) {
            const quoted = scope.ContentSourceIDs.map(id => `'${id.replace(/'/g, "''")}'`).join(', ');
            fragments.push(`ContentSourceID IN (${quoted})`);
        }
        if (scope.ContentTypeIDs && scope.ContentTypeIDs.length > 0) {
            const quoted = scope.ContentTypeIDs.map(id => `'${id.replace(/'/g, "''")}'`).join(', ');
            fragments.push(`ContentTypeID IN (${quoted})`);
        }
        return fragments.join(' AND ');
    }

    /** Open an entity record via NavigationService (single navigation path). */
    private openEntityRecord(entityName: string, recordID: string): void {
        if (!entityName || !recordID) {
            return;
        }
        const md = this.ProviderToUse;
        const entityInfo = md.EntityByName(entityName);
        const pkey = new CompositeKey();
        if (entityInfo) {
            pkey.LoadFromURLSegment(entityInfo, recordID);
        } else {
            pkey.KeyValuePairs = [{ FieldName: 'ID', Value: recordID }];
        }
        this.navigationService.OpenEntityRecord(entityName, pkey);
    }

    // ================================================================
    // Agent context + tools
    // ================================================================

    /**
     * Publish the host's state to the AI agent. Re-emitted whenever the mode
     * switches or the shared drilldown opens/loads/closes — so the streamed
     * context tracks what's on screen. Deepened to Data-Explorer depth: the
     * available modes plus the shared drilldown panel (open/loading state, what
     * it's showing, and the records it currently lists by id+title).
     */
    private emitAgentContext(): void {
        this.navigationService.SetAgentContext(this, buildVisualizeAgentContext({
            ActiveMode: this.ActiveMode,
            AvailableModes: [...VISUALIZATION_MODES],
            DrilldownVisible: this.DrilldownVisible,
            DrilldownLoading: this.DrilldownLoading,
            DrilldownTitle: this.DrilldownTitle,
            DrilldownSubtitle: this.DrilldownSubtitle,
            DrilldownRecords: this.buildDrilldownSummaries(),
        }));
    }

    /** Map the loaded drilldown rows to bounded id+title+subtitle summaries for the agent. */
    private buildDrilldownSummaries(): DrilldownRecordSummary[] {
        return this.DrilldownRecords.map(r => ({
            RecordID: r.RecordID,
            Title: r.Title,
            Subtitle: r.Subtitle ?? '',
        }));
    }

    /**
     * 🚨 SAFETY BOUNDARY (Knowledge Hub · Visualize host)
     * ------------------------------------------------------------------
     * The agent may SWITCH the visualization mode, OPEN a record currently
     * listed in the shared drilldown (by id or title), and CLOSE the
     * drilldown. All are read-only navigations / view-state changes.
     *
     * Nothing here mutates, deletes, or re-tags content. The embedded
     * Clusters child registers its OWN deep tools when it is the standalone
     * surface; here it is Embedded, so cluster recompute is reached through
     * the child's UI, not duplicated on the host. Tolerant handlers: every
     * Handler returns { Success, Data?, ErrorMessage? } and never throws;
     * drilldown references resolve id→title→contains.
     */
    private registerAgentTools(): void {
        this.navigationService.SetAgentClientTools(this, [
            {
                Name: 'SwitchVisualizationMode',
                Description: 'Switch the Visualize surface mode (clusters or tagcloud)',
                ParameterSchema: {
                    type: 'object',
                    properties: { mode: { type: 'string', enum: [...VISUALIZATION_MODES] } },
                    required: ['mode'],
                },
                Handler: async (params: Record<string, unknown>) => {
                    const check = validateEnumParam(params['mode'], VISUALIZATION_MODES, 'mode');
                    if (!check.ok) {
                        return check.result;
                    }
                    this.SelectMode(check.value as VisualizationModeId);
                    return { Success: true, Data: { ActiveMode: this.ActiveMode } };
                },
            },
            {
                Name: 'OpenDrilldownRecord',
                Description: 'Open one of the records currently listed in the shared drilldown panel, by record id or title. Only available while the drilldown is open.',
                ParameterSchema: {
                    type: 'object',
                    properties: { reference: { type: 'string', description: 'The record id or its on-screen title.' } },
                    required: ['reference'],
                },
                Handler: async (params: Record<string, unknown>) => {
                    const check = validateStringParam(params['reference'], 'reference');
                    if (!check.ok) {
                        return check.result;
                    }
                    if (!this.DrilldownVisible || this.DrilldownRecords.length === 0) {
                        return { Success: false, ErrorMessage: 'The drilldown panel is empty — select a tag or cluster point first.' };
                    }
                    const candidates = this.DrilldownRecords.map(r => ({ RecordID: r.RecordID, Title: r.Title }));
                    const match = resolveDrilldownRecord(check.value, candidates);
                    if (!match) {
                        const titles = capVisualizeList(candidates.map(c => c.Title));
                        return { Success: false, ErrorMessage: `No drilldown record matches "${check.value}". Listed records include: ${titles.join(', ')}.` };
                    }
                    const full = this.DrilldownRecords.find(r => r.RecordID === match.RecordID);
                    if (full) {
                        this.openEntityRecord(full.EntityName, full.RecordID);
                    }
                    return { Success: true, Data: { Title: match.Title } };
                },
            },
            {
                Name: 'CloseDrilldown',
                Description: 'Close the shared drilldown panel.',
                ParameterSchema: { type: 'object', properties: {} },
                Handler: async () => {
                    this.CloseDrilldown();
                    return { Success: true };
                },
            },
            {
                Name: 'ListDrilldownRecords',
                Description: 'List the records currently shown in the shared drilldown panel (bounded).',
                ParameterSchema: { type: 'object', properties: {} },
                Handler: async () => {
                    return {
                        Success: true,
                        Data: {
                            DrilldownVisible: this.DrilldownVisible,
                            DrilldownTitle: this.DrilldownTitle || null,
                            Records: capVisualizeList(this.buildDrilldownSummaries()),
                            TotalCount: this.DrilldownRecords.length,
                        },
                    };
                },
            },
        ]);
    }

    // ================================================================
    // Preferences (with legacy back-compat)
    // ================================================================

    private persistModePreference(): void {
        UserInfoEngine.Instance.SetSettingDebounced(VisualizeResourceComponent.PREFS_KEY, this.ActiveMode);
    }

    private loadModePreference(): void {
        // Prefer the new key; fall back to the legacy "Clusters" tab key.
        const raw = UserInfoEngine.Instance.GetSetting(VisualizeResourceComponent.PREFS_KEY)
            ?? UserInfoEngine.Instance.GetSetting(VisualizeResourceComponent.LEGACY_PREFS_KEY);
        if (raw === 'clusters' || raw === 'tagcloud') {
            this.ActiveMode = raw;
        }
    }
}

/** Tree-shaking prevention */
export function LoadVisualizeResource(): void {
    // Prevents tree-shaking of the component
}
