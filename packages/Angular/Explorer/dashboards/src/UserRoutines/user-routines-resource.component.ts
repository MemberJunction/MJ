import { Component, ViewChild, inject } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent, NavigationService } from '@memberjunction/ng-shared';
import { ResourceData, UserRoutineEngine } from '@memberjunction/core-entities';
import { CompositeKey } from '@memberjunction/core';
import { FilterFieldConfig } from '@memberjunction/ng-ui-components';
import {
    HistoryRecordOpenedEventArgs,
    RoutineCounts,
    RoutineStatusFilter,
    UserRoutinesCommandCenterComponent,
    UserRoutinesView,
} from '@memberjunction/ng-user-routines';
import { AgentToolResult, validateStringParam } from '../shared/agent-tool-validation';
import { buildUserRoutinesAgentContext, resolveRoutineByIDOrName, RoutineSummaryRow } from './user-routines-agent-context';

/**
 * Routines app — full-page Explorer host for the User Routines command center
 * (list / create-edit / run history). Thin chrome-trio wrapper over the generic
 * `<mj-user-routines-command-center>` from `@memberjunction/ng-user-routines`.
 *
 * Query-param round trip: `routine=<id>` opens that routine's history view; the pair
 * `initial read` + `OnQueryParamsChanged` keeps deep links, Home pins, and
 * back/forward working on cached instances.
 *
 * 🚨 SAFETY BOUNDARY 🚨 (see user-routines-agent-context.ts for the full statement)
 * Agent tools here are navigation / filter / search / select / refresh ONLY. The
 * agent may OPEN the editor (CreateRoutine / OpenRoutineEditor) but can never save,
 * delete, pause/resume, or run-now a routine — those stay human-driven in the UI.
 */
@RegisterClass(BaseResourceComponent, 'UserRoutines')
@Component({
    standalone: false,
    selector: 'mj-user-routines-resource',
    templateUrl: './user-routines-resource.component.html',
    styleUrls: ['./user-routines-resource.component.css'],
})
export class UserRoutinesResourceComponent extends BaseResourceComponent {
    protected override navigationService = inject(NavigationService);

    @ViewChild('commandCenter') private commandCenter?: UserRoutinesCommandCenterComponent;

    public SearchText = '';
    public StatusFilter: RoutineStatusFilter = 'all';
    public TotalCount = 0;
    public FilteredCount = 0;
    public ActiveView: UserRoutinesView = 'list';
    public SelectedRoutineID: string | null = null;

    public readonly FilterFields: FilterFieldConfig[] = [
        {
            key: 'status',
            type: 'dropdown',
            label: 'Status',
            icon: 'fa-solid fa-circle-half-stroke',
            options: [
                { text: 'All statuses', value: 'all' },
                { text: 'Active', value: 'Active' },
                { text: 'Paused', value: 'Paused' },
                { text: 'Disabled', value: 'Disabled' },
            ],
        },
    ];
    public FilterValues: Record<string, unknown> = { status: 'all' };

    public get ActiveFilterCount(): number {
        return this.StatusFilter === 'all' ? 0 : 1;
    }

    override async ngOnInit(): Promise<void> {
        super.ngOnInit();
        // 1) Initial query-param read (deep links)
        const params = this.GetQueryParams();
        if (params['routine']) {
            this.SelectedRoutineID = params['routine'];
        }
        this.registerAgentTools();
        this.publishAgentContext();
        this.NotifyLoadComplete();
    }

    override async GetResourceDisplayName(_data: ResourceData): Promise<string> {
        return 'Routines';
    }

    override async GetResourceIconClass(_data: ResourceData): Promise<string> {
        return 'fa-solid fa-business-time';
    }

    /** 2) React to later query-param changes (back/forward, pins, cached re-focus). */
    protected override OnQueryParamsChanged(params: Record<string, string>, _source: 'popstate' | 'deeplink'): void {
        const routineId = params['routine'] || null;
        if (routineId !== this.SelectedRoutineID) {
            this.SelectedRoutineID = routineId;
        }
    }

    // ---------------------------------------------------------------
    // Command-center wiring
    // ---------------------------------------------------------------
    public OnSelectedRoutineIDChange(routineId: string | null): void {
        this.SelectedRoutineID = routineId;
        this.UpdateQueryParams({ routine: routineId });
        this.publishAgentContext();
    }

    public OnViewChanged(view: UserRoutinesView): void {
        this.ActiveView = view;
        this.publishAgentContext();
    }

    public OnCountsChanged(counts: RoutineCounts): void {
        this.TotalCount = counts.Total;
        this.FilteredCount = counts.Filtered;
        this.publishAgentContext();
    }

    /** Opens the linked execution record (Agent Run / Prompt Run / Action Log) in a tab. */
    public OnHistoryRecordOpened(args: HistoryRecordOpenedEventArgs): void {
        this.navigationService.OpenEntityRecord(args.EntityName, CompositeKey.FromID(args.RecordID));
    }

    public OnSearchChange(value: string): void {
        this.SearchText = value;
        this.publishAgentContext();
    }

    public OnFilterValuesChange(values: Record<string, unknown>): void {
        this.FilterValues = values;
        const status = values['status'];
        this.StatusFilter = (status === 'Active' || status === 'Paused' || status === 'Disabled') ? status : 'all';
        this.publishAgentContext();
    }

    public ResetFilters(): void {
        this.OnFilterValuesChange({ status: 'all' });
    }

    public NewRoutine(): void {
        this.commandCenter?.ShowNewRoutine();
    }

    public BackToList(): void {
        this.commandCenter?.ShowList();
    }

    public async RefreshData(): Promise<void> {
        await this.commandCenter?.Refresh();
        this.publishAgentContext();
    }

    // ---------------------------------------------------------------
    // Agent context + tools (navigation/read-only — see SAFETY BOUNDARY)
    // ---------------------------------------------------------------
    private publishAgentContext(): void {
        this.navigationService.SetAgentContext(
            this,
            buildUserRoutinesAgentContext({
                ActiveView: this.ActiveView,
                SearchText: this.SearchText,
                StatusFilter: this.StatusFilter,
                TotalCount: this.TotalCount,
                FilteredCount: this.FilteredCount,
                SelectedRoutineID: this.SelectedRoutineID,
                Routines: this.routineRows(),
            })
        );
    }

    private routineRows(): RoutineSummaryRow[] {
        const engine = UserRoutineEngine.GetProviderInstance<UserRoutineEngine>(this.ProviderToUse, UserRoutineEngine) as UserRoutineEngine;
        return engine.Routines.map((r) => ({ ID: r.ID, Name: r.Name, Status: r.Status }));
    }

    private registerAgentTools(): void {
        this.navigationService.SetAgentClientTools(this, [
            {
                Name: 'RefreshRoutines',
                Description: 'Reload the routines list from the server.',
                ParameterSchema: { type: 'object', properties: {} },
                Handler: async () => {
                    await this.RefreshData();
                    return { Success: true, Data: { TotalRoutineCount: this.TotalCount } };
                },
            },
            {
                Name: 'SearchRoutines',
                Description: 'Filter the routines list by a search query (name, description, or agent). Pass an empty string to clear.',
                ParameterSchema: {
                    type: 'object',
                    properties: { query: { type: 'string', description: 'Text to filter by; empty clears.' } },
                    required: ['query'],
                },
                Handler: async (params) => this.handleSearch(params),
            },
            {
                Name: 'FilterRoutinesByStatus',
                Description: "Filter routines by lifecycle status: 'Active', 'Paused', 'Disabled', or 'all'.",
                ParameterSchema: {
                    type: 'object',
                    properties: { status: { type: 'string', description: "'Active' | 'Paused' | 'Disabled' | 'all'" } },
                    required: ['status'],
                },
                Handler: async (params) => this.handleStatusFilter(params),
            },
            {
                Name: 'SelectRoutine',
                Description: "Open a routine's run history, referenced by ID or name (partial, case-insensitive match accepted).",
                ParameterSchema: {
                    type: 'object',
                    properties: { routine: { type: 'string', description: 'The routine ID or name.' } },
                    required: ['routine'],
                },
                Handler: async (params) => this.handleSelect(params),
            },
            {
                Name: 'OpenRoutineEditor',
                Description:
                    'Open the editor for an existing routine (by ID or name). This only opens the editor for the user — it does NOT save anything.',
                ParameterSchema: {
                    type: 'object',
                    properties: { routine: { type: 'string', description: 'The routine ID or name.' } },
                    required: ['routine'],
                },
                Handler: async (params) => this.handleEdit(params),
            },
            {
                Name: 'CreateRoutine',
                Description: 'Open the New Routine editor. This only opens the editor for the user — it does NOT save anything.',
                ParameterSchema: { type: 'object', properties: {} },
                Handler: async () => {
                    this.NewRoutine();
                    this.publishAgentContext();
                    return { Success: true };
                },
            },
            {
                Name: 'BackToRoutinesList',
                Description: 'Return from the editor or history view to the routines list.',
                ParameterSchema: { type: 'object', properties: {} },
                Handler: async () => {
                    this.BackToList();
                    this.publishAgentContext();
                    return { Success: true };
                },
            },
        ]);
    }

    private async handleSearch(params: Record<string, unknown>): Promise<AgentToolResult & { Data?: Record<string, unknown> }> {
        const check = validateStringParam(params['query'], 'query');
        if (!check.ok) {
            return check.result;
        }
        this.OnSearchChange(check.value);
        return { Success: true, Data: { FilteredRoutineCount: this.FilteredCount } };
    }

    private async handleStatusFilter(params: Record<string, unknown>): Promise<AgentToolResult> {
        const check = validateStringParam(params['status'], 'status');
        if (!check.ok) {
            return check.result;
        }
        const value = check.value.trim();
        const normalized = ['Active', 'Paused', 'Disabled'].find((s) => s.toLowerCase() === value.toLowerCase());
        if (!normalized && value.toLowerCase() !== 'all') {
            return { Success: false, ErrorMessage: `'${value}' is not a valid status. Use 'Active', 'Paused', 'Disabled', or 'all'.` };
        }
        this.OnFilterValuesChange({ status: normalized ?? 'all' });
        return { Success: true };
    }

    private async handleSelect(params: Record<string, unknown>): Promise<AgentToolResult & { Data?: Record<string, unknown> }> {
        const resolved = resolveRoutineByIDOrName(this.routineRows(), params['routine']);
        if (!resolved.ok) {
            return { Success: false, ErrorMessage: resolved.error };
        }
        this.commandCenter?.ShowHistory(resolved.value.ID);
        this.publishAgentContext();
        return { Success: true, Data: { RoutineID: resolved.value.ID, RoutineName: resolved.value.Name } };
    }

    private async handleEdit(params: Record<string, unknown>): Promise<AgentToolResult & { Data?: Record<string, unknown> }> {
        const resolved = resolveRoutineByIDOrName(this.routineRows(), params['routine']);
        if (!resolved.ok) {
            return { Success: false, ErrorMessage: resolved.error };
        }
        this.commandCenter?.ShowEditRoutine(resolved.value.ID);
        this.publishAgentContext();
        return { Success: true, Data: { RoutineID: resolved.value.ID, RoutineName: resolved.value.Name } };
    }
}

/** Tree-shaking prevention — referenced from the package public API. */
export function LoadUserRoutinesResource(): void {
    // Intentionally empty: forces inclusion of the @RegisterClass side effect.
}
