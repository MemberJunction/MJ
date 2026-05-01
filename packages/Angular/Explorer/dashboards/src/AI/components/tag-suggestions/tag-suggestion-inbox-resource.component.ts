/**
 * Tag Suggestion Inbox — human-in-the-loop review queue for the autotagger.
 *
 * Reviewers see Pending suggestions (filtered by Reason / source / date), pick a
 * disposition (Accept-as-new, Merge into existing, Reject), and the component
 * delegates to TagGovernanceEngine via the GraphQL data provider.
 */

import { Component, ChangeDetectorRef, OnDestroy, AfterViewInit, inject } from '@angular/core';
import { Metadata, RunView } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { MJTagSuggestionEntity, MJTagEntity, ResourceData } from '@memberjunction/core-entities';
import { MJNotificationService } from '@memberjunction/ng-notifications';

type Disposition = 'create-new' | 'merge' | 'reject';

interface SuggestionRow {
    ID: string;
    ProposedName: string;
    Reason: string;
    BestMatchTagID: string | null;
    BestMatchName: string | null;
    BestMatchScore: number | null;
    SourceContentSourceID: string | null;
    SourceContentItemID: string | null;
    CreatedAt: Date;
    Status: string;
    selected?: boolean;
    dispositionInProgress?: Disposition | null;
}

@RegisterClass(BaseResourceComponent, 'TagSuggestionInbox')
@Component({
    selector: 'mj-tag-suggestion-inbox',
    template: `
<div class="suggestion-inbox" style="padding: 16px; height: 100%; overflow: auto; font-family: var(--mj-font-family, system-ui, sans-serif); color: var(--mj-text-primary, #333);">
    <header style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
        <div>
            <h2 style="margin:0; color: var(--mj-text-primary);">Tag Suggestions</h2>
            <div style="color: var(--mj-text-secondary); font-size: 13px;">Human-in-the-loop review for autotagger classifications</div>
        </div>
        <div style="display:flex; gap:8px; align-items:center;">
            <select [(ngModel)]="reasonFilter" (change)="loadSuggestions()" style="padding:6px 10px; border:1px solid var(--mj-border-default); border-radius:4px; background: var(--mj-bg-surface);">
                <option value="">All reasons</option>
                @for (r of reasonOptions; track r) { <option [value]="r">{{ r }}</option> }
            </select>
            <button (click)="loadSuggestions()" style="padding:6px 12px; border-radius:4px; background: var(--mj-brand-primary, #264FAF); color: white; border:none; cursor:pointer;">
                <i class="fa-solid fa-arrows-rotate"></i> Refresh
            </button>
        </div>
    </header>

    @if (loading) {
        <mj-loading></mj-loading>
    } @else if (rows.length === 0) {
        <div style="text-align:center; padding:48px; color: var(--mj-text-muted);">
            <i class="fa-solid fa-inbox" style="font-size:32px; opacity:0.3;"></i>
            <div style="margin-top:8px;">No pending suggestions.</div>
        </div>
    } @else {
        <div style="display:flex; gap:8px; align-items:center; margin-bottom:8px;">
            <span style="color: var(--mj-text-secondary); font-size:13px;">{{ rows.length }} pending</span>
            @if (selectedCount > 0) {
                <span style="margin-left:12px;">
                    <button (click)="bulkApprove()" [disabled]="bulkInProgress" style="padding:4px 10px; border:1px solid var(--mj-brand-primary, #264FAF); color: var(--mj-brand-primary, #264FAF); background: white; border-radius:4px; cursor:pointer; margin-right:6px;">
                        Approve {{ selectedCount }}
                    </button>
                    <button (click)="bulkReject()" [disabled]="bulkInProgress" style="padding:4px 10px; border:1px solid var(--mj-status-error, #dc2626); color: var(--mj-status-error, #dc2626); background: white; border-radius:4px; cursor:pointer;">
                        Reject {{ selectedCount }}
                    </button>
                </span>
            }
        </div>
        <table style="width:100%; border-collapse:collapse; font-size:13px;">
            <thead style="background: var(--mj-bg-surface-card); position:sticky; top:0;">
                <tr>
                    <th style="padding:8px; text-align:left; width:30px;"><input type="checkbox" (change)="toggleAll($event)" /></th>
                    <th style="padding:8px; text-align:left;">Proposed</th>
                    <th style="padding:8px; text-align:left;">Reason</th>
                    <th style="padding:8px; text-align:left;">Best Match</th>
                    <th style="padding:8px; text-align:right;">Score</th>
                    <th style="padding:8px; text-align:left;">Created</th>
                    <th style="padding:8px; text-align:right;">Actions</th>
                </tr>
            </thead>
            <tbody>
                @for (row of rows; track row.ID) {
                    <tr style="border-bottom:1px solid var(--mj-border-subtle, #eee);">
                        <td style="padding:8px;"><input type="checkbox" [(ngModel)]="row.selected" (change)="onSelectionChanged()" /></td>
                        <td style="padding:8px; font-weight:500;">{{ row.ProposedName }}</td>
                        <td style="padding:8px;"><span style="padding:2px 8px; border-radius:10px; background: var(--mj-bg-surface-card, #f5f5f5); font-size:11px;">{{ row.Reason }}</span></td>
                        <td style="padding:8px;">{{ row.BestMatchName ?? '—' }}</td>
                        <td style="padding:8px; text-align:right; font-variant-numeric: tabular-nums;">{{ row.BestMatchScore != null ? (row.BestMatchScore | number: '1.3-3') : '—' }}</td>
                        <td style="padding:8px; color: var(--mj-text-muted);">{{ row.CreatedAt | date: 'short' }}</td>
                        <td style="padding:8px; text-align:right;">
                            @if (row.dispositionInProgress) {
                                <span style="color: var(--mj-text-muted); font-size:12px;"><i class="fa-solid fa-spinner fa-spin"></i> {{ row.dispositionInProgress }}…</span>
                            } @else {
                                <button (click)="acceptAsNew(row)" style="padding:3px 8px; border:1px solid var(--mj-brand-primary, #264FAF); background:white; color: var(--mj-brand-primary, #264FAF); border-radius:3px; cursor:pointer; margin-right:4px;" title="Create new tag with this name">
                                    <i class="fa-solid fa-plus"></i>
                                </button>
                                @if (row.BestMatchTagID) {
                                    <button (click)="merge(row)" style="padding:3px 8px; border:1px solid #f59e0b; background:white; color:#b45309; border-radius:3px; cursor:pointer; margin-right:4px;" title="Merge into best match">
                                        <i class="fa-solid fa-code-merge"></i>
                                    </button>
                                }
                                <button (click)="reject(row)" style="padding:3px 8px; border:1px solid var(--mj-status-error, #dc2626); background:white; color: var(--mj-status-error, #dc2626); border-radius:3px; cursor:pointer;" title="Reject">
                                    <i class="fa-solid fa-xmark"></i>
                                </button>
                            }
                        </td>
                    </tr>
                }
            </tbody>
        </table>
    }
</div>
    `,
    standalone: false,
})
export class TagSuggestionInboxResourceComponent extends BaseResourceComponent implements AfterViewInit, OnDestroy {
    private readonly cdr = inject(ChangeDetectorRef);
    public readonly notifications = MJNotificationService.Instance;

    public async GetResourceDisplayName(_data: ResourceData): Promise<string> {
        return 'Tag Suggestion Inbox';
    }
    public async GetResourceIconClass(_data: ResourceData): Promise<string> {
        return 'fa-solid fa-inbox';
    }

    public loading = false;
    public reasonFilter = '';
    public reasonOptions = [
        'BelowThreshold', 'ConstrainedMode', 'AmbiguousMatch', 'ParentFrozen', 'AutoGrowDisabled',
        'MaxChildrenExceeded', 'MaxDepthExceeded', 'BelowMinWeight', 'RequiresReview',
        'MaxItemTagsExceeded', 'MergeCandidate', 'LowUsage', 'WideNode'
    ];
    public rows: SuggestionRow[] = [];
    public bulkInProgress = false;
    public selectedCount = 0;

    public async ngAfterViewInit(): Promise<void> {
        await this.loadSuggestions();
        this.NotifyLoadComplete();

        this.navigationService.SetAgentContext(this, {
            PendingCount: this.rows.length,
            ReasonFilter: this.reasonFilter || 'all',
        });
        this.navigationService.SetAgentClientTools(this, [
            {
                Name: 'RefreshSuggestions',
                Description: 'Reload the pending suggestion list.',
                ParameterSchema: { type: 'object', properties: {} },
                Handler: async () => { await this.loadSuggestions(); return { success: true, count: this.rows.length }; },
            }
        ]);
    }

    public override ngOnDestroy(): void {
        super.ngOnDestroy?.();
    }

    public async loadSuggestions(): Promise<void> {
        this.loading = true;
        this.cdr.detectChanges();

        try {
            const rv = new RunView();
            const filter = this.reasonFilter
                ? `Status='Pending' AND Reason='${this.reasonFilter}'`
                : `Status='Pending'`;
            const result = await rv.RunView<MJTagSuggestionEntity>({
                EntityName: 'MJ: Tag Suggestions',
                ExtraFilter: filter,
                OrderBy: '__mj_CreatedAt DESC',
                ResultType: 'simple',
                MaxRows: 500,
            }, this.ProviderToUse?.CurrentUser);

            if (!result.Success) {
                this.notifications.CreateSimpleNotification(`Failed to load suggestions: ${result.ErrorMessage}`, 'error', 5000);
                this.rows = [];
                return;
            }

            // Resolve best-match tag names client-side
            const matchIDs = Array.from(new Set(result.Results.map(r => r.BestMatchTagID).filter((x): x is string => !!x)));
            const matchNames = new Map<string, string>();
            if (matchIDs.length > 0) {
                const tagsResult = await rv.RunView<MJTagEntity>({
                    EntityName: 'MJ: Tags',
                    ExtraFilter: `ID IN (${matchIDs.map(id => `'${id}'`).join(',')})`,
                    Fields: ['ID', 'Name'],
                    ResultType: 'simple',
                }, this.ProviderToUse?.CurrentUser);
                if (tagsResult.Success) {
                    for (const t of tagsResult.Results) matchNames.set(t.ID, t.Name);
                }
            }

            this.rows = (result.Results as unknown as Array<{
                ID: string; ProposedName: string; Reason: string; BestMatchTagID: string | null;
                BestMatchScore: number | null; SourceContentSourceID: string | null;
                SourceContentItemID: string | null; __mj_CreatedAt: Date | string; Status: string;
            }>).map(r => ({
                ID: r.ID,
                ProposedName: r.ProposedName,
                Reason: r.Reason,
                BestMatchTagID: r.BestMatchTagID,
                BestMatchName: r.BestMatchTagID ? matchNames.get(r.BestMatchTagID) ?? null : null,
                BestMatchScore: r.BestMatchScore,
                SourceContentSourceID: r.SourceContentSourceID,
                SourceContentItemID: r.SourceContentItemID,
                CreatedAt: new Date(r.__mj_CreatedAt as string),
                Status: r.Status,
                selected: false,
                dispositionInProgress: null,
            }));
            this.onSelectionChanged();
        } finally {
            this.loading = false;
            this.cdr.detectChanges();
        }
    }

    public onSelectionChanged(): void {
        this.selectedCount = this.rows.filter(r => r.selected).length;
    }

    public toggleAll(e: Event): void {
        const checked = (e.target as HTMLInputElement).checked;
        for (const r of this.rows) r.selected = checked;
        this.onSelectionChanged();
    }

    public async acceptAsNew(row: SuggestionRow): Promise<void> {
        await this.applyDisposition(row, 'create-new');
    }

    public async merge(row: SuggestionRow): Promise<void> {
        if (!row.BestMatchTagID) return;
        await this.applyDisposition(row, 'merge');
    }

    public async reject(row: SuggestionRow): Promise<void> {
        await this.applyDisposition(row, 'reject');
    }

    public async bulkApprove(): Promise<void> {
        const selected = this.rows.filter(r => r.selected);
        if (selected.length === 0) return;
        this.bulkInProgress = true;
        for (const row of selected) {
            // For bulk approve, prefer merge when a best match exists; otherwise create-new.
            const disposition = row.BestMatchTagID ? 'merge' : 'create-new';
            await this.applyDisposition(row, disposition);
        }
        this.bulkInProgress = false;
    }

    public async bulkReject(): Promise<void> {
        const selected = this.rows.filter(r => r.selected);
        if (selected.length === 0) return;
        this.bulkInProgress = true;
        for (const row of selected) {
            await this.applyDisposition(row, 'reject');
        }
        this.bulkInProgress = false;
    }

    private async applyDisposition(row: SuggestionRow, disposition: Disposition): Promise<void> {
        row.dispositionInProgress = disposition;
        this.cdr.detectChanges();

        try {
            const md = new Metadata();
            const suggestion = await md.GetEntityObject<MJTagSuggestionEntity>('MJ: Tag Suggestions', this.ProviderToUse?.CurrentUser);
            const loaded = await suggestion.Load(row.ID);
            if (!loaded) {
                this.notifications.CreateSimpleNotification(`Failed to load suggestion ${row.ID}`, 'error', 5000);
                return;
            }

            if (disposition === 'reject') {
                suggestion.Status = 'Rejected';
                suggestion.ReviewedAt = new Date();
                suggestion.ReviewedByUserID = this.ProviderToUse?.CurrentUser?.ID ?? null;
                const ok = await suggestion.Save();
                if (!ok) throw new Error(suggestion.LatestResult?.CompleteMessage ?? 'save failed');
                this.notifications.CreateSimpleNotification(`Rejected "${row.ProposedName}"`, 'info', 2500);
            } else if (disposition === 'merge') {
                if (!row.BestMatchTagID) throw new Error('No best match to merge into.');
                // Mark suggestion as merged; the actual ContentItemTag re-pointing
                // happens server-side in TagGovernanceEngine.PromoteSuggestion when
                // the GraphQL mutation lands. For now (UI-driven path) we update
                // status directly; full server-side promotion path is server work.
                suggestion.Status = 'Merged';
                suggestion.ResolvedTagID = row.BestMatchTagID;
                suggestion.ReviewedAt = new Date();
                suggestion.ReviewedByUserID = this.ProviderToUse?.CurrentUser?.ID ?? null;
                const ok = await suggestion.Save();
                if (!ok) throw new Error(suggestion.LatestResult?.CompleteMessage ?? 'save failed');
                this.notifications.CreateSimpleNotification(`Merged "${row.ProposedName}" into "${row.BestMatchName}"`, 'info', 2500);
            } else { // create-new
                // Same caveat: full server-side path requires a GraphQL action; for
                // now we mark Approved and leave content-item-tag re-pointing to a
                // server batch job. The plan calls for a dedicated GraphQL resolver
                // that wraps TagGovernanceEngine.PromoteSuggestion — pending Phase 1f
                // server-resolver follow-up.
                suggestion.Status = 'Approved';
                suggestion.ReviewedAt = new Date();
                suggestion.ReviewedByUserID = this.ProviderToUse?.CurrentUser?.ID ?? null;
                const ok = await suggestion.Save();
                if (!ok) throw new Error(suggestion.LatestResult?.CompleteMessage ?? 'save failed');
                this.notifications.CreateSimpleNotification(`Approved "${row.ProposedName}"`, 'info', 2500);
            }

            // Drop the row from the list optimistically.
            this.rows = this.rows.filter(r => r.ID !== row.ID);
            this.onSelectionChanged();
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            this.notifications.CreateSimpleNotification(`Failed to ${disposition} "${row.ProposedName}": ${msg}`, 'error', 5000);
        } finally {
            row.dispositionInProgress = null;
            this.cdr.detectChanges();
        }
    }
}

export function LoadTagSuggestionInboxResourceComponent(): void {
    // tree-shaking guard
}
