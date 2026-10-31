import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MJAIAgentRequestEntity, MJUserRoutineEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { ChiefOfStaffPage, IsApprovalRequest, IsSpentOneShotRoutine, ValidateSearchQueryParam } from './chief-of-staff-agent-context';
import { BaseChiefOfStaffPage, ChiefOfStaffClientTool } from './chief-of-staff-page-base';

/**
 * The Chief of Staff application's Approvals & Wakes page: every pending approval with its
 * recent decisions, and every wake routine with Wake Now, pause and its briefings. The search
 * box filters both lists and round-trips through the `search` query param.
 */
@RegisterClass(BaseResourceComponent, 'ChiefOfStaffApprovals')
@Component({
    standalone: false,
    selector: 'mj-chief-of-staff-approvals',
    templateUrl: './chief-of-staff-approvals.component.html',
    styleUrls: ['./chief-of-staff-pages.css'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChiefOfStaffApprovalsComponent extends BaseChiefOfStaffPage {
    protected readonly Page: ChiefOfStaffPage = 'approvals-wakes';
    private initialParamsApplied = false;

    /** When true, the wake list also shows spent one-shots (reminders that have fired). Off by default. */
    public ShowFiredRoutines = false;

    public get RecentResolvedRequests(): MJAIAgentRequestEntity[] {
        return this.Requests.filter((r) => r.Status !== 'Requested' && IsApprovalRequest(r)).slice(0, 8);
    }

    /** Spent one-shots: reminders and one-time wakes that have already fired. */
    public get FiredRoutineCount(): number {
        return this.Routines.filter((r) => IsSpentOneShotRoutine(r)).length;
    }

    public get FilteredRoutines(): MJUserRoutineEntity[] {
        const search = this.SearchText.trim().toLowerCase();
        const base = this.ShowFiredRoutines ? this.SortedRoutines : this.UpcomingRoutines;
        if (!search) {
            return base;
        }
        return base.filter(
            (r) =>
                r.Name.toLowerCase().includes(search) ||
                (r.Description ?? '').toLowerCase().includes(search),
        );
    }

    public ToggleShowFiredRoutines(): void {
        this.ShowFiredRoutines = !this.ShowFiredRoutines;
        this.cdr.markForCheck();
    }

    public OnSearchChange(value: string): void {
        this.SearchText = value;
        this.syncQueryParams();
        this.publishAgentContext();
        this.cdr.markForCheck();
    }

    protected override OnPageInit(): void {
        this.SearchText = this.GetQueryParams()['search'] ?? '';
        this.initialParamsApplied = true;
    }

    protected override OnQueryParamsChanged(
        params: Record<string, string>,
        _source: 'popstate' | 'deeplink',
    ): void {
        this.SearchText = params['search'] ?? '';
        this.publishAgentContext();
        this.cdr.markForCheck();
    }

    private syncQueryParams(): void {
        if (!this.initialParamsApplied) {
            return;
        }
        this.UpdateQueryParams({
            search: this.SearchText.trim().length > 0 ? this.SearchText.trim() : null,
        });
    }

    protected override PageAgentTools(): ChiefOfStaffClientTool[] {
        return [
            {
                Name: 'SearchChiefOfStaffApprovals',
                Description:
                    'Filter the pending requests and wake routines on the Approvals & Wakes page by search text. Pass empty string to clear.',
                ParameterSchema: {
                    type: 'object',
                    properties: {
                        query: {
                            type: 'string',
                            description: 'Search text; empty string clears.',
                        },
                    },
                    required: ['query'],
                },
                Handler: async (params) => {
                    const check = ValidateSearchQueryParam(params['query'] as string | undefined);
                    if (!check.ok) {
                        return check.result;
                    }
                    this.OnSearchChange(check.value);
                    return {
                        Success: true,
                        Data: {
                            SearchText: this.SearchText,
                            PendingRequestCount: this.PendingRequests.length,
                            VisibleRoutineCount: this.FilteredRoutines.length,
                        },
                    };
                },
            },
        ];
    }
}

export function LoadChiefOfStaffApprovals(): void {
    // Intentionally empty: forces inclusion of the @RegisterClass side effect.
}
