import { AfterViewInit, Component, OnDestroy, OnInit, ViewChild, inject } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent, NavigationService } from '@memberjunction/ng-shared';
import { ResourceData } from '@memberjunction/core-entities';
import { RecordProcessStudioComponent } from '@memberjunction/ng-record-process-studio';
import { AgentToolResult, validateStringParam } from '../shared/agent-tool-validation';
import { buildStudioAgentContext, resolveRowByID } from './bulk-operations-agent-helpers';

/**
 * "Operations" sub-page of the Bulk Operations shell. A thin host that renders the generic, self-contained
 * `<mj-record-process-studio>` (list / create / edit / run) scoped to the current provider.
 *
 * This host also wires the surface into the MJ AI-agent stack: it reports the studio's live state via
 * `SetAgentContext` and registers a curated set of SAFE client tools via `SetAgentClientTools`. The host
 * reaches the hosted generic studio through a {@link ViewChild} reference (`studio`) and only reads its
 * public state / calls its public methods — it never reaches into the generic package's internals, and it
 * never duplicates the studio's logic.
 *
 * 🚨🚨🚨 SAFETY BOUNDARY — Bulk Operations is the most destructive surface in the product. 🚨🚨🚨
 * A single operation can mutate thousands of records. Therefore:
 *   1. The ONLY "run"-shaped tool exposed to the agent is `PreviewProcessChanges`, which calls
 *      `studio.Run(p)`. `Run()` opens the RecordProcessRunnerUX runner, which ALWAYS performs a
 *      compute-only DRY-RUN preview FIRST and requires the USER to click Apply to write real changes.
 *      So the agent can only trigger the *preview*; the destructive apply remains a manual user click.
 *   2. DO NOT add any tool that performs a REAL (non-dry-run) apply — nothing that bypasses the runner's
 *      preview → user-confirm flow (e.g. nothing that would call `runOp(id, false)` or write directly).
 *   3. DO NOT expose `SaveProcess` / process-definition commits as an agent tool. Creating/editing/saving
 *      a process definition stays user-driven; the agent may only *open* the editor (CreateNewProcess /
 *      EditProcess) and navigate.
 * If you are tempted to add a "RunProcessForReal" / "ApplyChanges" tool here: STOP. It violates this
 * boundary. The real apply is, and must remain, a manual user action inside the runner.
 */
@RegisterClass(BaseResourceComponent, 'BulkOperationsOperations')
@Component({
    standalone: false,
    selector: 'mj-bulk-operations-operations',
    template: `<div class="bo-host"><mj-record-process-studio #studio [Provider]="ProviderToUse"></mj-record-process-studio></div>`,
    styles: [`.bo-host{padding:20px;height:100%;overflow:auto;box-sizing:border-box}`],
})
export class BulkOperationsOperationsComponent extends BaseResourceComponent implements OnInit, AfterViewInit, OnDestroy {
    /** Reference to the hosted generic studio — the source of truth for context + the target of every tool. */
    @ViewChild('studio') private studio?: RecordProcessStudioComponent;

    protected override navigationService = inject(NavigationService);

    override async ngOnInit(): Promise<void> {
        super.ngOnInit();
        this.NotifyLoadComplete();
    }

    /**
     * Wire agent context + tools once the view (and therefore the `studio` ViewChild) is available.
     * The studio finishes its own initial `reload()` asynchronously; we publish context immediately
     * with whatever state is present and rely on each tool Handler to re-publish after it acts, so the
     * agent's streamed context tracks the visible operation set. A `queueMicrotask` defers the first
     * publish one tick so an in-flight `ngOnInit` reload that has already resolved is reflected.
     */
    ngAfterViewInit(): void {
        this.registerAgentTools();
        queueMicrotask(() => this.publishAgentContext());
    }

    override ngOnDestroy(): void {
        super.ngOnDestroy();
    }

    override async GetResourceDisplayName(_data: ResourceData): Promise<string> { return 'Operations'; }
    override async GetResourceIconClass(_data: ResourceData): Promise<string> { return 'fa-solid fa-wand-magic-sparkles'; }

    // ================================================================
    // Agent context
    // ================================================================

    /**
     * Publish the studio's live state to the AI agent. Tolerant of the ViewChild not yet being
     * resolved (publishes a minimal "loading" snapshot). Re-invoked by every tool Handler after it
     * mutates studio state, since the generic studio emits no change events we could subscribe to.
     */
    private publishAgentContext(): void {
        const s = this.studio;
        if (!s) {
            this.navigationService.SetAgentContext(this, { CurrentMode: 'list', IsReady: false });
            return;
        }
        this.navigationService.SetAgentContext(this, buildStudioAgentContext({
            Mode: s.Mode,
            ProcessCount: s.Processes.length,
            FilteredCount: s.Filtered.length,
            Search: s.Search,
            EditingID: s.EditingID,
            IsRunning: s.RunDriver != null,
        }));
    }

    // ================================================================
    // Agent client tools
    // ================================================================

    /**
     * Register the curated set of SAFE agent tools for the Operations surface. Every Handler is tolerant
     * (returns a typed failure rather than throwing) and re-publishes context after acting.
     *
     * SAFETY: the only run capability here is `PreviewProcessChanges` (dry-run preview via the runner).
     * No tool performs a real apply, and no tool commits a process definition. See the class-level
     * SAFETY BOUNDARY comment.
     */
    private registerAgentTools(): void {
        this.navigationService.SetAgentClientTools(this, [
            {
                Name: 'RefreshProcessList',
                Description: 'Reload the list of bulk operations (Record Processes) from the server.',
                ParameterSchema: { type: 'object', properties: {} },
                Handler: async () => this.handleRefresh(),
            },
            {
                Name: 'SearchProcesses',
                Description: 'Filter the bulk operations list by a search query (matches operation name or entity). Pass an empty string to clear the filter.',
                ParameterSchema: {
                    type: 'object',
                    properties: { query: { type: 'string', description: 'Text to filter by; empty clears the filter.' } },
                    required: ['query'],
                },
                Handler: async (params) => this.handleSearch(params),
            },
            {
                Name: 'CreateNewProcess',
                Description: 'Open the editor to create a new bulk operation. This only opens the editor for the user — it does NOT save anything.',
                ParameterSchema: { type: 'object', properties: {} },
                Handler: async () => this.handleCreateNew(),
            },
            {
                Name: 'EditProcess',
                Description: 'Open the editor for an existing bulk operation by its ID. This only opens the editor for the user — it does NOT save anything.',
                ParameterSchema: {
                    type: 'object',
                    properties: { processID: { type: 'string', description: 'The ID of the Record Process to edit.' } },
                    required: ['processID'],
                },
                Handler: async (params) => this.handleEdit(params),
            },
            {
                Name: 'PreviewProcessChanges',
                Description:
                    'Open a SAFE dry-run preview of a bulk operation by its ID. This opens the runner, which computes and shows the proposed changes WITHOUT writing anything. ' +
                    'Applying the changes for real always requires a separate, manual user confirmation in the runner — the agent cannot apply changes.',
                ParameterSchema: {
                    type: 'object',
                    properties: { processID: { type: 'string', description: 'The ID of the Record Process to preview.' } },
                    required: ['processID'],
                },
                Handler: async (params) => this.handlePreview(params),
            },
            {
                Name: 'BackToList',
                Description: 'Return from the editor or preview to the bulk operations list view.',
                ParameterSchema: { type: 'object', properties: {} },
                Handler: async () => this.handleBackToList(),
            },
        ]);
    }

    // ================================================================
    // Tool handlers (small, single-purpose, tolerant)
    // ================================================================

    /** Reload the studio's process list, then re-publish context. */
    private async handleRefresh(): Promise<AgentToolResult & { Data?: Record<string, unknown> }> {
        const s = this.requireStudio();
        if (!s) return this.notReady();
        await s.reload();
        this.publishAgentContext();
        return { Success: true, Data: { ProcessCount: s.Processes.length } };
    }

    /**
     * Apply a search filter to the studio. We set the studio's public `Search` field and then drive its
     * own `onSearch` with a synthetic input event so the studio re-derives `Filtered` and runs its OnPush
     * change detection exactly as it would for a real keystroke.
     */
    private async handleSearch(params: Record<string, unknown>): Promise<AgentToolResult & { Data?: Record<string, unknown> }> {
        const check = validateStringParam(params['query'], 'query');
        if (!check.ok) return check.result;
        const s = this.requireStudio();
        if (!s) return this.notReady();
        s.Search = check.value;
        s.onSearch(this.makeInputEvent(check.value));
        this.publishAgentContext();
        return { Success: true, Data: { FilteredProcessCount: s.Filtered.length } };
    }

    /** Open the editor in "new" mode (user-driven save). */
    private async handleCreateNew(): Promise<AgentToolResult> {
        const s = this.requireStudio();
        if (!s) return this.notReady();
        s.New();
        this.publishAgentContext();
        return { Success: true };
    }

    /** Open the editor for an existing process, resolved from the studio's loaded list. */
    private async handleEdit(params: Record<string, unknown>): Promise<AgentToolResult> {
        const s = this.requireStudio();
        if (!s) return this.notReady();
        const proc = this.findProcess(s, params['processID']);
        if (!proc.ok) return proc.result;
        s.Edit(proc.value);
        this.publishAgentContext();
        return { Success: true };
    }

    /**
     * Open the SAFE dry-run preview for an existing process. Delegates to `studio.Run(p)`, which mounts
     * the RecordProcessRunnerUX — that runner ALWAYS previews (dry-run) first and requires a manual user
     * click to apply real changes. The agent therefore triggers only the preview, never the apply.
     */
    private async handlePreview(params: Record<string, unknown>): Promise<AgentToolResult> {
        const s = this.requireStudio();
        if (!s) return this.notReady();
        const proc = this.findProcess(s, params['processID']);
        if (!proc.ok) return proc.result;
        s.Run(proc.value);
        this.publishAgentContext();
        return { Success: true };
    }

    /** Return to the list view from the editor or preview. */
    private async handleBackToList(): Promise<AgentToolResult> {
        const s = this.requireStudio();
        if (!s) return this.notReady();
        s.backToList();
        this.publishAgentContext();
        return { Success: true };
    }

    // ================================================================
    // Helpers
    // ================================================================

    /** The hosted studio, or undefined if the view isn't ready yet. */
    private requireStudio(): RecordProcessStudioComponent | undefined {
        return this.studio;
    }

    /** Typed "not ready" failure for tools invoked before the ViewChild resolves. */
    private notReady(): AgentToolResult {
        return { Success: false, ErrorMessage: 'The operations list is still initializing. Please try again in a moment.' };
    }

    /**
     * Resolve a process row from the studio's loaded list by ID (delegates to the pure, unit-tested
     * {@link resolveRowByID} helper). Returns a structured failure if the param is missing/non-string
     * or the ID isn't found in the current list.
     */
    private findProcess(
        s: RecordProcessStudioComponent,
        rawID: unknown,
    ): { ok: true; value: RecordProcessStudioComponent['Processes'][number] } | { ok: false; result: AgentToolResult } {
        return resolveRowByID(s.Processes, rawID, 'processID', 'bulk operation');
    }

    /** Build a minimal synthetic input event so we can drive the studio's `onSearch(event)` API. */
    private makeInputEvent(value: string): Event {
        return { target: { value } } as unknown as Event;
    }
}
