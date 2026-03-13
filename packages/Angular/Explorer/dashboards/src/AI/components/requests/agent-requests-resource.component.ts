/**
 * @fileoverview Agent Requests Resource Component
 *
 * Dashboard resource for the AI application's "Requests" tab.
 * Displays all agent feedback requests with filtering by status, priority,
 * request type, and agent. Opens the generic agent-request-panel for
 * viewing details and responding.
 */

import { Component, ChangeDetectorRef, OnDestroy, AfterViewInit } from '@angular/core';
import { Subject } from 'rxjs';
import { debounceTime, takeUntil } from 'rxjs/operators';
import { RunView } from '@memberjunction/core';
import { ResourceData, UserInfoEngine } from '@memberjunction/core-entities';
import { MJAIAgentRequestEntity, MJAIAgentRequestTypeEntity } from '@memberjunction/core-entities';
import { RegisterClass, UUIDsEqual } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { AgentRequestPanelResult } from '@memberjunction/ng-agent-requests';

interface RequestFilter {
    SearchTerm: string;
    Status: string;
    RequestType: string;
    Priority: string;
}

/**
 * User preferences for the Agent Requests dashboard
 */
interface AgentRequestsUserPreferences {
    Filters: RequestFilter;
    SortColumn: string;
    SortDirection: 'asc' | 'desc';
}

@RegisterClass(BaseResourceComponent, 'AIAgentRequestsResource')
@Component({
    standalone: false,
    selector: 'app-agent-requests-resource',
    templateUrl: './agent-requests-resource.component.html',
    styleUrls: ['./agent-requests-resource.component.css']
})
export class AgentRequestsResourceComponent extends BaseResourceComponent implements AfterViewInit, OnDestroy {
    private readonly USER_SETTINGS_KEY = 'AI.AgentRequests.UserPreferences';
    private settingsPersistSubject = new Subject<void>();
    private destroy$ = new Subject<void>();
    private settingsLoaded = false;

    public IsLoading = false;
    public Requests: MJAIAgentRequestEntity[] = [];
    public FilteredRequests: MJAIAgentRequestEntity[] = [];
    public RequestTypes: MJAIAgentRequestTypeEntity[] = [];

    // Panel state
    public SelectedRequest: MJAIAgentRequestEntity | null = null;
    public ShowRequestPanel = false;

    // Filter state
    public Filters: RequestFilter = {
        SearchTerm: '',
        Status: '',
        RequestType: '',
        Priority: ''
    };

    // Available filter options
    public StatusOptions = ['Requested', 'Approved', 'Rejected', 'Responded', 'Canceled', 'Expired'];
    public PriorityOptions = [
        { Label: 'Critical (76-100)', Value: 'critical' },
        { Label: 'High (51-75)', Value: 'high' },
        { Label: 'Normal (26-50)', Value: 'normal' },
        { Label: 'Low (1-25)', Value: 'low' }
    ];

    private searchSubject = new Subject<string>();

    constructor(private cdr: ChangeDetectorRef) {
        super();
    }

    async ngAfterViewInit(): Promise<void> {
        this.setupSearchDebounce();
        await this.loadUserSettings();
        await this.loadData();
        this.NotifyLoadComplete();
    }

    ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
    }

    async GetResourceDisplayName(data: ResourceData): Promise<string> {
        return 'Agent Requests';
    }

    async GetResourceIconClass(data: ResourceData): Promise<string> {
        return 'fa-solid fa-inbox';
    }

    /** Count of pending (Requested) items */
    public get PendingCount(): number {
        return this.Requests.filter(r => r.Status === 'Requested').length;
    }

    /** Open the detail panel for a request */
    public OnRequestClick(request: MJAIAgentRequestEntity): void {
        this.SelectedRequest = request;
        this.ShowRequestPanel = true;
        this.cdr.detectChanges();
    }

    /** Handle panel close */
    public OnPanelClose(result: AgentRequestPanelResult): void {
        this.ShowRequestPanel = false;
        this.SelectedRequest = null;

        if (result.Success) {
            // Refresh the list to reflect the status change
            this.loadData();
        }
        this.cdr.detectChanges();
    }

    /** Handle search input */
    public OnSearchChange(term: string): void {
        this.searchSubject.next(term);
    }

    /** Handle filter changes */
    public OnFilterChange(): void {
        this.applyFilters();
        this.saveUserSettings();
    }

    /** Clear all filters */
    public ClearFilters(): void {
        this.Filters = { SearchTerm: '', Status: '', RequestType: '', Priority: '' };
        this.applyFilters();
        this.saveUserSettings();
    }

    /** Get the request type name by ID */
    public GetRequestTypeName(typeId: string | null): string {
        if (!typeId) return '';
        const type = this.RequestTypes.find(t => UUIDsEqual(t.ID, typeId));
        return type?.Name ?? '';
    }

    /** Get the request type icon by ID */
    public GetRequestTypeIcon(typeId: string | null): string {
        if (!typeId) return 'fa-solid fa-question-circle';
        const type = this.RequestTypes.find(t => UUIDsEqual(t.ID, typeId));
        return type?.Icon ?? 'fa-solid fa-question-circle';
    }

    /** Get priority label from numeric value */
    public GetPriorityLabel(priority: number): string {
        if (priority <= 25) return 'Low';
        if (priority <= 50) return 'Normal';
        if (priority <= 75) return 'High';
        return 'Critical';
    }

    /** Get priority CSS class from numeric value */
    public GetPriorityClass(priority: number): string {
        if (priority <= 25) return 'priority-low';
        if (priority <= 50) return 'priority-normal';
        if (priority <= 75) return 'priority-high';
        return 'priority-critical';
    }

    /** Whether a request is expired */
    public IsExpired(request: MJAIAgentRequestEntity): boolean {
        if (!request.ExpiresAt) return false;
        return new Date(request.ExpiresAt) < new Date();
    }

    // ---- Private Methods ----

    private async loadData(): Promise<void> {
        this.IsLoading = true;
        this.cdr.detectChanges();

        try {
            const rv = new RunView();
            const [requestsResult, typesResult] = await rv.RunViews([
                {
                    EntityName: 'MJ: AI Agent Requests',
                    OrderBy: 'Priority DESC, __mj_CreatedAt DESC',
                    ResultType: 'entity_object'
                },
                {
                    EntityName: 'MJ: AI Agent Request Types',
                    OrderBy: 'Name',
                    ResultType: 'entity_object'
                }
            ]);

            if (requestsResult.Success) {
                this.Requests = requestsResult.Results as MJAIAgentRequestEntity[];
            }
            if (typesResult.Success) {
                this.RequestTypes = typesResult.Results as MJAIAgentRequestTypeEntity[];
            }

            this.applyFilters();
        } catch (error) {
            console.error('Error loading agent requests:', error);
        } finally {
            this.IsLoading = false;
            this.cdr.detectChanges();
        }
    }

    private applyFilters(): void {
        let filtered = [...this.Requests];

        // Status filter
        if (this.Filters.Status) {
            filtered = filtered.filter(r => r.Status === this.Filters.Status);
        }

        // Request type filter
        if (this.Filters.RequestType) {
            filtered = filtered.filter(r =>
                r.RequestTypeID && UUIDsEqual(r.RequestTypeID, this.Filters.RequestType)
            );
        }

        // Priority filter
        if (this.Filters.Priority) {
            filtered = filtered.filter(r => {
                const p = r.Priority;
                switch (this.Filters.Priority) {
                    case 'low': return p <= 25;
                    case 'normal': return p > 25 && p <= 50;
                    case 'high': return p > 50 && p <= 75;
                    case 'critical': return p > 75;
                    default: return true;
                }
            });
        }

        // Search term filter
        if (this.Filters.SearchTerm) {
            const term = this.Filters.SearchTerm.toLowerCase();
            filtered = filtered.filter(r =>
                (r.Request && r.Request.toLowerCase().includes(term)) ||
                (r.Agent && r.Agent.toLowerCase().includes(term)) ||
                (r.Response && r.Response.toLowerCase().includes(term))
            );
        }

        this.FilteredRequests = filtered;
        this.cdr.detectChanges();
    }

    private setupSearchDebounce(): void {
        this.searchSubject.pipe(
            debounceTime(300),
            takeUntil(this.destroy$)
        ).subscribe(term => {
            this.Filters.SearchTerm = term;
            this.applyFilters();
            this.saveUserSettings();
        });

        this.settingsPersistSubject.pipe(
            debounceTime(500),
            takeUntil(this.destroy$)
        ).subscribe(() => this.persistUserSettings());
    }

    private async loadUserSettings(): Promise<void> {
        try {
            const prefs = UserInfoEngine.Instance.GetSetting(this.USER_SETTINGS_KEY);
            if (prefs) {
                const parsed: AgentRequestsUserPreferences = JSON.parse(prefs);
                if (parsed.Filters) {
                    this.Filters = { ...this.Filters, ...parsed.Filters };
                }
            }
        } catch {
            // Use defaults
        }
        this.settingsLoaded = true;
    }

    private saveUserSettings(): void {
        if (this.settingsLoaded) {
            this.settingsPersistSubject.next();
        }
    }

    private async persistUserSettings(): Promise<void> {
        try {
            const prefs: AgentRequestsUserPreferences = {
                Filters: this.Filters,
                SortColumn: 'Priority',
                SortDirection: 'desc'
            };
            await UserInfoEngine.Instance.SetSetting(
                this.USER_SETTINGS_KEY,
                JSON.stringify(prefs)
            );
        } catch {
            // Silent failure for settings persistence
        }
    }
}

export function LoadAgentRequestsResource(): void {
    // Prevents tree-shaking
}
