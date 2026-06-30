/**
 * @fileoverview Archive Runs Resource Component
 *
 * Dashboard resource wrapper for the "Run History" tab in the Archiving application.
 * Delegates all rendering to the reusable mj-archive-run-viewer component from
 * @memberjunction/ng-archive-manager.
 *
 * Beyond rendering, this wrapper reports a READ-ONLY summary of the archive run
 * history to the AI agent (outcome counts, active status filter, which run's
 * detail drawer is open) and exposes read-only filter/refresh/view tools. The
 * inner run viewer publishes its loaded runs (`Runs`) and an `OpenRunDrawer`
 * method that this wrapper drives for the view-detail tool.
 *
 * 🔒 SAFETY BOUNDARY (READ-ONLY / VIEW-ONLY): this surface NEVER exposes run
 * execution or mutation to the agent. The following are intentionally NOT wired
 * as client tools: RunArchiveNow / execute, CancelRunningArchive,
 * RetryFailedArchiveRun, PurgeArchivedData, and ModifyArchivePolicy. The agent
 * may only filter, refresh, and open a run's detail drawer (by ID or
 * configuration/policy name) for inspection. SelectRun / ViewArchiveRunDetail
 * open the drawer for VIEWING only — they perform no execution or mutation.
 */

import { Component, AfterViewInit, OnDestroy, ViewChild } from '@angular/core';
import { ResourceData } from '@memberjunction/core-entities';
import { RegisterClass, UUIDsEqual } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { ArchiveRunViewerComponent } from '@memberjunction/ng-archive-manager';
import { AgentToolResult } from '../../shared/agent-tool-validation';
import {
    buildArchiveRunsAgentContext,
    computeArchiveRunStatusCounts,
    filterArchiveRunsByStatus,
    isValidArchiveRunStatusFilter,
    resolveArchiveRun,
    ARCHIVE_RUN_STATUS_FILTERS,
    ARCHIVE_NAME_LIST_CAP,
    ArchiveRunStatusFilter,
    ArchiveRunSnapshot,
    ArchiveRunSummaryItem,
    ArchiveRunsAgentContextInput,
} from '../archive-agent-context';

@RegisterClass(BaseResourceComponent, 'ArchiveRunsResource')
@Component({
    standalone: false,
    selector: 'app-archive-runs-resource',
    template: `
        <mj-page-layout>
            <mj-page-header
                Title="Archive Run History"
                Icon="fa-solid fa-clock-rotate-left"
                Subtitle="Execution history and results for archive jobs">
            </mj-page-header>
            <mj-page-body [Flex]="true" [Padding]="false">
                <mj-archive-run-viewer></mj-archive-run-viewer>
            </mj-page-body>
        </mj-page-layout>
    `,
    styles: [`:host { display: block; height: 100%; width: 100%; }`],
})
export class ArchiveRunsResourceComponent extends BaseResourceComponent implements AfterViewInit, OnDestroy {
    /** Reference to the inner run viewer — source of loaded runs + the detail drawer. */
    @ViewChild(ArchiveRunViewerComponent) private runViewer?: ArchiveRunViewerComponent;

    /** Wrapper-owned status filter (defaults to no filter). */
    private statusFilter: ArchiveRunStatusFilter = 'all';

    ngAfterViewInit(): void {
        this.publishAgentContext();
        this.registerAgentClientTools();
        this.NotifyLoadComplete();
    }

    override ngOnDestroy(): void {
        super.ngOnDestroy();
    }

    async GetResourceDisplayName(_data: ResourceData): Promise<string> {
        return 'Archive Run History';
    }

    async GetResourceIconClass(_data: ResourceData): Promise<string> {
        return 'fa-solid fa-clock-rotate-left';
    }

    // ========================================
    // AI AGENT CONTEXT & CLIENT TOOLS (READ-ONLY / VIEW-ONLY)
    // ========================================

    /**
     * Publish the current run-history summary to the AI agent. Read-only —
     * describes outcome counts, the active filter, and which run (if any) is open.
     */
    private publishAgentContext(): void {
        const runs = this.loadedRuns();
        const counts = computeArchiveRunStatusCounts(runs);
        const filtered = filterArchiveRunsByStatus(runs, this.statusFilter);
        const selected = this.runViewer?.SelectedRun ?? null;
        const recentRuns: ArchiveRunSummaryItem[] = filtered
            .slice(0, ARCHIVE_NAME_LIST_CAP)
            .map((r) => ({ ID: r.ID, Name: r.ConfigurationName, Status: r.Status }));
        const input: ArchiveRunsAgentContextInput = {
            Counts: counts,
            StatusFilter: this.statusFilter,
            FilteredRunCount: filtered.length,
            SelectedRunId: selected?.ID ?? null,
            SelectedRunName: selected?.ConfigurationName ?? null,
            SelectedRunStatus: selected?.Status ?? null,
            RecentRuns: recentRuns,
            IsLoading: this.runViewer?.IsLoading ?? false,
        };
        this.navigationService.SetAgentContext(this, buildArchiveRunsAgentContext(input));
    }

    /**
     * The runs currently loaded in the inner viewer, narrowed to the
     * {@link ArchiveRunSnapshot} shape the pure helpers consume. The viewer's
     * `ArchiveRunSummary` is structurally compatible (ID · ConfigurationName ·
     * Status); this keeps the cast in one place.
     */
    private loadedRuns(): ArchiveRunSnapshot[] {
        return (this.runViewer?.Runs ?? []) as ArchiveRunSnapshot[];
    }

    /**
     * Register the read-only client tools for this surface.
     *
     * 🔒 Filter / refresh / view-detail only. No run execution, cancellation,
     * retry, or purge is exposed (see SAFETY BOUNDARY).
     */
    private registerAgentClientTools(): void {
        this.navigationService.SetAgentClientTools(this, [
            {
                Name: 'FilterArchiveRunsByStatus',
                Description: `Filter the archive run history by status. Valid values: ${ARCHIVE_RUN_STATUS_FILTERS.join(', ')} ('all' clears the filter). Read-only — changes only the agent-visible filtered count.`,
                ParameterSchema: {
                    type: 'object',
                    properties: { status: { type: 'string', enum: [...ARCHIVE_RUN_STATUS_FILTERS] } },
                    required: ['status'],
                },
                Handler: async (params: Record<string, unknown>) => this.toolFilterByStatus(params),
            },
            {
                Name: 'RefreshArchiveRunHistory',
                Description: 'Reload the archive run history. Read-only — re-reads runs and re-publishes the summary.',
                ParameterSchema: { type: 'object', properties: {} },
                Handler: async () => this.toolRefreshRunHistory(),
            },
            {
                Name: 'ViewArchiveRunDetail',
                Description: 'Open the detail drawer for a specific archive run — by its ID or by its configuration/policy name — to inspect its archived records. Resolution: exact ID, then exact name, then a name-contains match. View-only — performs no execution or mutation.',
                ParameterSchema: {
                    type: 'object',
                    properties: { run: { type: 'string', description: 'Run ID or configuration/policy name.' } },
                    required: ['run'],
                },
                Handler: async (params: Record<string, unknown>) => this.toolViewRunDetail(params),
            },
            {
                Name: 'SelectRun',
                Description: 'Alias of ViewArchiveRunDetail: open a run by ID or configuration/policy name for inspection. View-only.',
                ParameterSchema: {
                    type: 'object',
                    properties: { run: { type: 'string', description: 'Run ID or configuration/policy name.' } },
                    required: ['run'],
                },
                Handler: async (params: Record<string, unknown>) => this.toolViewRunDetail(params),
            },
        ]);
    }

    /** Apply a status filter (wrapper-owned) and re-publish context. Never throws. */
    private toolFilterByStatus(params: Record<string, unknown>): AgentToolResult & { Data?: Record<string, unknown> } {
        const raw = params['status'];
        if (!isValidArchiveRunStatusFilter(raw)) {
            return {
                Success: false,
                ErrorMessage: `Invalid status "${String(raw)}". Expected one of: ${ARCHIVE_RUN_STATUS_FILTERS.join(', ')}.`,
            };
        }
        this.statusFilter = raw;
        const filteredCount = filterArchiveRunsByStatus(this.loadedRuns(), this.statusFilter).length;
        this.publishAgentContext();
        return { Success: true, Data: { StatusFilter: this.statusFilter, FilteredRunCount: filteredCount } };
    }

    /**
     * Refresh the run history. The inner viewer loads its data in ngOnInit and
     * exposes no public reload, so the wrapper re-publishes the latest context
     * from the inner viewer's current state. Never throws.
     */
    private toolRefreshRunHistory(): AgentToolResult {
        if (!this.runViewer) {
            return { Success: false, ErrorMessage: 'The run history view is not ready yet.' };
        }
        this.publishAgentContext();
        return { Success: true };
    }

    /**
     * Open the detail drawer for a run by ID or configuration/policy name
     * (view-only). Accepts the agent's `run` parameter and resolves it via the
     * pure {@link resolveArchiveRun} helper (exact ID → exact name → name-contains).
     * Never throws.
     */
    private async toolViewRunDetail(params: Record<string, unknown>): Promise<AgentToolResult & { Data?: Record<string, unknown> }> {
        const reference = typeof params['run'] === 'string' ? params['run'] : '';
        if (!reference) {
            return { Success: false, ErrorMessage: 'A run ID or configuration/policy name is required.' };
        }
        if (!this.runViewer) {
            return { Success: false, ErrorMessage: 'The run history view is not ready yet.' };
        }
        const resolution = resolveArchiveRun(reference, this.loadedRuns());
        if (!resolution.ok) {
            return { Success: false, ErrorMessage: resolution.error };
        }
        // OpenRunDrawer wants the viewer's own run object; the resolved snapshot
        // shares the same ID, so re-find by ID to hand back the live reference.
        const run = this.runViewer.Runs.find((r) => UUIDsEqual(r.ID, resolution.run.ID));
        if (!run) {
            return { Success: false, ErrorMessage: `No archive run found with ID "${resolution.run.ID}".` };
        }
        await this.runViewer.OpenRunDrawer(run);
        this.publishAgentContext();
        return { Success: true, Data: { SelectedRunId: run.ID, SelectedRunName: run.ConfigurationName, SelectedRunStatus: run.Status } };
    }
}

export function LoadArchiveRunsResource() {
    // Prevents tree-shaking
}
