import { AfterViewInit, Component, OnDestroy, OnInit, ViewChild, inject } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent, NavigationService } from '@memberjunction/ng-shared';
import { ResourceData } from '@memberjunction/core-entities';
import { RecordProcessHistoryComponent } from '@memberjunction/ng-record-process-studio';
import { AgentToolResult } from '../shared/agent-tool-validation';
import { buildHistoryAgentContext, resolveRowByID } from './bulk-operations-agent-helpers';

/**
 * "Run History" sub-page of the Bulk Operations shell. A thin host that renders the generic, self-contained
 * `<mj-record-process-history>` (run list + per-record drill-in) scoped to the current provider.
 *
 * Like its Operations sibling, this host wires the surface into the MJ AI-agent stack: it reports the
 * history component's live state via `SetAgentContext` and registers SAFE, READ-ONLY navigation tools via
 * `SetAgentClientTools`. The host reaches the hosted generic component through a {@link ViewChild}
 * reference (`history`) and only reads its public state / calls its public methods.
 *
 * 🚨🚨🚨 SAFETY BOUNDARY — Run History is a read-only audit surface. 🚨🚨🚨
 * Every tool exposed here is read-only / navigational (refresh, view a run's details, go back). There is
 * NOTHING destructive on this surface and there must NEVER be:
 *   - DO NOT add any tool that re-runs, applies, retries, or otherwise mutates a Record Process or its
 *     records. Re-running an operation belongs on the Operations surface and is gated by the runner's
 *     dry-run → user-confirm flow there.
 *   - DO NOT expose any tool that writes to the run / run-detail tables.
 * Viewing history is inert; keep it that way.
 */
@RegisterClass(BaseResourceComponent, 'BulkOperationsRunHistory')
@Component({
    standalone: false,
    selector: 'mj-bulk-operations-run-history',
    template: `<div class="bo-host"><mj-record-process-history #history [Provider]="ProviderToUse"></mj-record-process-history></div>`,
    styles: [`.bo-host{padding:20px;height:100%;overflow:auto;box-sizing:border-box}`],
})
export class BulkOperationsRunHistoryComponent extends BaseResourceComponent implements OnInit, AfterViewInit, OnDestroy {
    /** Reference to the hosted generic history component — the source of truth for context + tool target. */
    @ViewChild('history') private history?: RecordProcessHistoryComponent;

    protected override navigationService = inject(NavigationService);

    override async ngOnInit(): Promise<void> {
        super.ngOnInit();
        this.NotifyLoadComplete();
    }

    /**
     * Wire agent context + tools once the view (and the `history` ViewChild) is available. The history
     * component finishes its initial `reload()` asynchronously; we publish immediately and rely on each
     * tool Handler to re-publish after acting. A `queueMicrotask` defers the first publish one tick so an
     * already-resolved `ngOnInit` reload is reflected.
     */
    ngAfterViewInit(): void {
        this.registerAgentTools();
        queueMicrotask(() => this.publishAgentContext());
    }

    override ngOnDestroy(): void {
        super.ngOnDestroy();
    }

    override async GetResourceDisplayName(_data: ResourceData): Promise<string> { return 'Run History'; }
    override async GetResourceIconClass(_data: ResourceData): Promise<string> { return 'fa-solid fa-clock-rotate-left'; }

    // ================================================================
    // Agent context
    // ================================================================

    /**
     * Publish the history component's live state to the AI agent. Tolerant of the ViewChild not yet being
     * resolved. Re-invoked by every tool Handler after it changes history state, since the generic
     * component emits no change events we could subscribe to.
     */
    private publishAgentContext(): void {
        const h = this.history;
        if (!h) {
            this.navigationService.SetAgentContext(this, { IsViewingRunDetail: false, IsReady: false });
            return;
        }
        const open = h.OpenRunRow;
        this.navigationService.SetAgentContext(this, buildHistoryAgentContext({
            Mode: h.Mode,
            RunCount: h.Runs.length,
            OpenRunID: open?.ID ?? null,
            OpenRunStatus: open?.Status ?? null,
            OpenRunIsDryRun: open?.DryRun ?? null,
        }));
    }

    // ================================================================
    // Agent client tools (all READ-ONLY / navigational — see SAFETY BOUNDARY)
    // ================================================================

    /**
     * Register the SAFE, read-only agent tools for the Run History surface: refresh the run list, open a
     * run's per-record details, and return to the list. Every Handler is tolerant and re-publishes context.
     */
    private registerAgentTools(): void {
        this.navigationService.SetAgentClientTools(this, [
            {
                Name: 'RefreshRunHistory',
                Description: 'Reload the list of bulk operation runs from the server.',
                ParameterSchema: { type: 'object', properties: {} },
                Handler: async () => this.handleRefresh(),
            },
            {
                Name: 'ViewRunDetails',
                Description: 'Open the per-record detail view for a specific bulk operation run by its run ID. Read-only — shows what each record\'s outcome was.',
                ParameterSchema: {
                    type: 'object',
                    properties: { runID: { type: 'string', description: 'The ID of the Process Run to view.' } },
                    required: ['runID'],
                },
                Handler: async (params) => this.handleViewDetails(params),
            },
            {
                Name: 'BackToRunList',
                Description: 'Return from a run detail view to the run history list.',
                ParameterSchema: { type: 'object', properties: {} },
                Handler: async () => this.handleBackToList(),
            },
        ]);
    }

    // ================================================================
    // Tool handlers (small, single-purpose, tolerant)
    // ================================================================

    /** Reload the run list, then re-publish context. */
    private async handleRefresh(): Promise<AgentToolResult & { Data?: Record<string, unknown> }> {
        const h = this.requireHistory();
        if (!h) return this.notReady();
        await h.reload();
        this.publishAgentContext();
        return { Success: true, Data: { RunCount: h.Runs.length } };
    }

    /** Open a run's per-record details, resolved from the history component's loaded run list. */
    private async handleViewDetails(params: Record<string, unknown>): Promise<AgentToolResult> {
        const h = this.requireHistory();
        if (!h) return this.notReady();
        const run = this.findRun(h, params['runID']);
        if (!run.ok) return run.result;
        await h.openRun(run.value);
        this.publishAgentContext();
        return { Success: true };
    }

    /** Return to the run list from a detail view. */
    private async handleBackToList(): Promise<AgentToolResult> {
        const h = this.requireHistory();
        if (!h) return this.notReady();
        h.backToList();
        this.publishAgentContext();
        return { Success: true };
    }

    // ================================================================
    // Helpers
    // ================================================================

    /** The hosted history component, or undefined if the view isn't ready yet. */
    private requireHistory(): RecordProcessHistoryComponent | undefined {
        return this.history;
    }

    /** Typed "not ready" failure for tools invoked before the ViewChild resolves. */
    private notReady(): AgentToolResult {
        return { Success: false, ErrorMessage: 'The run history is still initializing. Please try again in a moment.' };
    }

    /**
     * Resolve a run row from the history component's loaded list by ID (delegates to the pure,
     * unit-tested {@link resolveRowByID} helper). Returns a structured failure if the param is
     * missing/non-string or the ID isn't found in the current list.
     */
    private findRun(
        h: RecordProcessHistoryComponent,
        rawID: unknown,
    ): { ok: true; value: RecordProcessHistoryComponent['Runs'][number] } | { ok: false; result: AgentToolResult } {
        return resolveRowByID(h.Runs, rawID, 'runID', 'bulk operation run');
    }
}
