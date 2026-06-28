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
 * may only filter, refresh, and open a run's detail drawer for inspection.
 */

import { Component, AfterViewInit, OnDestroy, ViewChild } from '@angular/core';
import { ResourceData } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { ArchiveRunViewerComponent } from '@memberjunction/ng-archive-manager';
import { AgentToolResult } from '../../shared/agent-tool-validation';
import {
    buildArchiveRunsAgentContext,
    computeArchiveRunStatusCounts,
    filterArchiveRunsByStatus,
    isValidArchiveRunStatusFilter,
    ARCHIVE_RUN_STATUS_FILTERS,
    ArchiveRunStatusFilter,
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
        const runs = this.runViewer?.Runs ?? [];
        const counts = computeArchiveRunStatusCounts(runs);
        const input: ArchiveRunsAgentContextInput = {
            Counts: counts,
            StatusFilter: this.statusFilter,
            FilteredRunCount: filterArchiveRunsByStatus(runs, this.statusFilter).length,
            SelectedRunId: this.runViewer?.SelectedRun?.ID ?? null,
            IsLoading: this.runViewer?.IsLoading ?? false,
        };
        this.navigationService.SetAgentContext(this, buildArchiveRunsAgentContext(input));
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
                Description: 'Open the detail drawer for a specific archive run by its ID, to inspect its archived records. View-only — performs no execution or mutation.',
                ParameterSchema: {
                    type: 'object',
                    properties: { runId: { type: 'string' } },
                    required: ['runId'],
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
        const runs = this.runViewer?.Runs ?? [];
        const filteredCount = filterArchiveRunsByStatus(runs, this.statusFilter).length;
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

    /** Open the detail drawer for a run by ID (view-only). Never throws. */
    private async toolViewRunDetail(params: Record<string, unknown>): Promise<AgentToolResult> {
        const runId = typeof params['runId'] === 'string' ? params['runId'] : '';
        if (!runId) {
            return { Success: false, ErrorMessage: 'A runId is required.' };
        }
        if (!this.runViewer) {
            return { Success: false, ErrorMessage: 'The run history view is not ready yet.' };
        }
        const run = this.runViewer.Runs.find((r) => r.ID === runId);
        if (!run) {
            return { Success: false, ErrorMessage: `No archive run found with ID "${runId}".` };
        }
        await this.runViewer.OpenRunDrawer(run);
        this.publishAgentContext();
        return { Success: true };
    }
}

export function LoadArchiveRunsResource() {
    // Prevents tree-shaking
}
