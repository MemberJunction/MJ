/**
 * @fileoverview Classify · Suggestions Inbox tab.
 *
 * Self-contained sub-page that surfaces `MJ: Tag Suggestions` — the
 * human-in-the-loop review queue produced by the classifier when a tag lands in
 * the ambiguous band (BelowThreshold, ConstrainedMode, ParentFrozen, …) and by
 * the server-side TagHealthJob (merge / low-usage / wide-node candidates).
 *
 * 3-pane layout: (1) a filter rail by Reason (with counts) + Status,
 * (2) the suggestion list, (3) a reading pane with the proposed name/parent,
 * best-match score on a threshold-band gradient, the source-item link, and the
 * Approve / Merge / Reject action bar.
 *
 * Data is TRANSACTIONAL and can grow — it is loaded via RunView (NOT cached).
 * Status filtering re-queries the DB; Reason filtering is applied in-memory on
 * the loaded Pending set.
 *
 * The host owns the lightweight pending-count badge on the nav rail; this tab
 * emits `(Resolved)` after every action so the host can refresh that badge.
 */
import { Component, ChangeDetectorRef, EventEmitter, Output, inject } from '@angular/core';
import { RunView } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { MJTagSuggestionEntity, MJTagEntity } from '@memberjunction/core-entities';
import { TagEngineBase } from '@memberjunction/tag-engine-base';
import { formatShortDate } from '../shared/classify.format';

/** Reasons owned by the Health tab — excluded from the Inbox default view. */
const HEALTH_REASONS = ['MergeCandidate', 'LowUsage', 'WideNode'] as const;

/** Status filter options the Inbox supports (re-queries the DB on change). */
type InboxStatusFilter = 'Pending' | 'Approved' | 'Merged' | 'Rejected';

/** A counted Reason entry rendered in the filter rail. */
interface ReasonCount {
    Reason: string;
    Label: string;
    Count: number;
}

/** Dropdown option for the merge-target combobox. */
interface TagOption {
    ID: string;
    Label: string;
}

/** Human-readable labels + pill class for each Reason value. */
const REASON_META: Record<string, { label: string; pill: string }> = {
    ConstrainedMode:    { label: 'Constrained mode',     pill: 'gray' },
    BelowThreshold:     { label: 'Below threshold',      pill: 'amber' },
    ParentFrozen:       { label: 'Parent frozen',        pill: 'red' },
    AutoGrowDisabled:   { label: 'Auto-grow disabled',   pill: 'gray' },
    MaxChildrenExceeded:{ label: 'Max children',         pill: 'red' },
    MaxDepthExceeded:   { label: 'Max depth',            pill: 'red' },
    BelowMinWeight:     { label: 'Below min weight',     pill: 'amber' },
    RequiresReview:     { label: 'Requires review',      pill: 'amber' },
    MergeCandidate:     { label: 'Merge candidate',      pill: 'blue' },
    LowUsage:           { label: 'Low usage',            pill: 'gray' },
    WideNode:           { label: 'Wide node',            pill: 'blue' },
};

@Component({
    standalone: false,
    selector: 'classify-inbox-tab',
    templateUrl: './inbox-tab.component.html',
    styleUrls: ['./inbox-tab.component.css']
})
export class ClassifyInboxTabComponent extends BaseAngularComponent {
    private cdr = inject(ChangeDetectorRef);

    /** Threshold markers shown on the band gradient (match the server defaults). */
    public readonly SuggestThreshold = 0.70;
    public readonly MatchThreshold = 0.87;

    // ── Loaded data (NOT cached — transactional) ──
    private allSuggestions: MJTagSuggestionEntity[] = [];
    public FilteredSuggestions: MJTagSuggestionEntity[] = [];
    public ReasonCounts: ReasonCount[] = [];
    public Selected: MJTagSuggestionEntity | null = null;

    public IsLoading = false;
    private hasLoaded = false;

    // ── Filters ──
    public StatusFilter: InboxStatusFilter = 'Pending';
    public readonly StatusOptions: InboxStatusFilter[] = ['Pending', 'Approved', 'Merged', 'Rejected'];
    /** Active reason filter; '' = all (human-review reasons), 'all' = include health reasons. */
    public ReasonFilter: string = '';
    /** When true, include the 3 Health-owned reasons that the Health tab normally owns. */
    public IncludeHealthReasons = false;

    // ── Merge-target state ──
    public TagOptions: TagOption[] = [];
    /** Selected merge-target tag ID (defaults to BestMatchTagID on selection). */
    public MergeTargetID: string | null = null;
    public ReviewerNotes = '';

    public IsActing = false;

    /** Number of Pending suggestions currently in the loaded set (for the host badge). */
    public get PendingCount(): number {
        return this.StatusFilter === 'Pending' ? this.allSuggestions.length : 0;
    }

    /** Empty-state message for the suggestion list (reflects the active filters). */
    public get NoSuggestionsMessage(): string {
        const status = this.StatusFilter.toLowerCase();
        return `No ${status} suggestions${this.ReasonFilter ? ' for this reason' : ''}.`;
    }

    /** Total loaded suggestions (across all reasons) for the "All" filter count. */
    public get TotalLoadedCount(): number {
        return this.allSuggestions.length;
    }

    /** Template-facing formatter. */
    public readonly formatShortDate = formatShortDate;

    /** Emitted after any Approve/Merge/Reject so the host refreshes its pending badge. */
    @Output() Resolved = new EventEmitter<void>();

    // ════════════════════════════════════════════
    // ACTIVATION + LOAD
    // ════════════════════════════════════════════

    /** Lazy-load on first activation (host calls this when the tab becomes active). */
    public async EnsureLoaded(): Promise<void> {
        if (this.hasLoaded) return;
        this.hasLoaded = true;
        await Promise.all([this.loadSuggestions(), this.loadTagOptions()]);
    }

    /** Public refresh — re-pull suggestions for the current status filter. */
    public async Refresh(): Promise<void> {
        await this.loadSuggestions();
    }

    private buildStatusFilterClause(): string {
        // Health-reason suggestions (MergeCandidate / LowUsage / WideNode) are owned
        // by the Health tab. By default the Inbox shows only the human-review reasons
        // and EXCLUDES the 3 health reasons; the "include health reasons" toggle lifts
        // that exclusion so an operator can see everything in one place.
        const statusClause = `Status='${this.StatusFilter}'`;
        if (this.IncludeHealthReasons) return statusClause;
        const excluded = HEALTH_REASONS.map(r => `'${r}'`).join(',');
        return `${statusClause} AND Reason NOT IN (${excluded})`;
    }

    private async loadSuggestions(): Promise<void> {
        this.IsLoading = true;
        this.cdr.detectChanges();

        const rv = RunView.FromMetadataProvider(this.ProviderToUse);
        const result = await rv.RunView<MJTagSuggestionEntity>({
            EntityName: 'MJ: Tag Suggestions',
            ExtraFilter: this.buildStatusFilterClause(),
            OrderBy: '__mj_CreatedAt DESC',
            ResultType: 'entity_object',
        }, this.ProviderToUse.CurrentUser);

        this.allSuggestions = result.Success ? result.Results : [];
        this.buildReasonCounts();
        this.applyReasonFilter();

        this.IsLoading = false;
        this.cdr.detectChanges();
    }

    private async loadTagOptions(): Promise<void> {
        await TagEngineBase.Instance.Config(false, this.ProviderToUse.CurrentUser, this.ProviderToUse);
        this.TagOptions = TagEngineBase.Instance.Tags
            .filter(t => t.Status === 'Active')
            .map(t => ({ ID: t.ID, Label: t.DisplayName || t.Name }))
            .sort((a, b) => a.Label.localeCompare(b.Label));
    }

    // ════════════════════════════════════════════
    // FILTERING
    // ════════════════════════════════════════════

    private buildReasonCounts(): void {
        const counts = new Map<string, number>();
        for (const s of this.allSuggestions) {
            counts.set(s.Reason, (counts.get(s.Reason) ?? 0) + 1);
        }
        this.ReasonCounts = Array.from(counts.entries())
            .map(([Reason, Count]) => ({ Reason, Label: this.ReasonLabel(Reason), Count }))
            .sort((a, b) => b.Count - a.Count);
    }

    private applyReasonFilter(): void {
        this.FilteredSuggestions = this.ReasonFilter
            ? this.allSuggestions.filter(s => s.Reason === this.ReasonFilter)
            : this.allSuggestions;

        // Keep selection valid; otherwise select the first row.
        if (!this.Selected || !this.FilteredSuggestions.some(s => UUIDsEqual(s.ID, this.Selected!.ID))) {
            this.SelectSuggestion(this.FilteredSuggestions[0] ?? null);
        }
    }

    public SetReasonFilter(reason: string): void {
        this.ReasonFilter = reason;
        this.applyReasonFilter();
        this.cdr.detectChanges();
    }

    public async SetStatusFilter(status: InboxStatusFilter): Promise<void> {
        if (status === this.StatusFilter) return;
        this.StatusFilter = status;
        this.ReasonFilter = '';
        this.Selected = null;
        await this.loadSuggestions();
    }

    public async ToggleHealthReasons(): Promise<void> {
        this.IncludeHealthReasons = !this.IncludeHealthReasons;
        this.ReasonFilter = '';
        await this.loadSuggestions();
    }

    public SelectSuggestion(suggestion: MJTagSuggestionEntity | null): void {
        this.Selected = suggestion;
        this.MergeTargetID = suggestion?.BestMatchTagID ?? null;
        this.ReviewerNotes = '';
        this.cdr.detectChanges();
    }

    public OnMergeTargetChange(value: unknown): void {
        this.MergeTargetID = (value as string) ?? null;
    }

    // ════════════════════════════════════════════
    // DISPLAY HELPERS
    // ════════════════════════════════════════════

    public ReasonLabel(reason: string): string {
        return REASON_META[reason]?.label ?? reason;
    }

    public ReasonPill(reason: string): string {
        return REASON_META[reason]?.pill ?? 'gray';
    }

    /** Score as a 0..100 percent for band/marker positioning. */
    public ScorePct(score: number | null): number {
        if (score == null) return 0;
        return Math.round(Math.min(1, Math.max(0, score)) * 100);
    }

    public FormatScore(score: number | null): string {
        return score == null ? '—' : score.toFixed(2);
    }

    /** Resolve the merge-target tag's display label for confirmation copy. */
    public get MergeTargetLabel(): string {
        if (!this.MergeTargetID) return '';
        return this.TagOptions.find(t => UUIDsEqual(t.ID, this.MergeTargetID!))?.Label ?? 'selected tag';
    }

    // ════════════════════════════════════════════
    // ACTIONS — entity-level mutations on the client
    // ════════════════════════════════════════════
    //
    // NOTE: full content-item-tag re-pointing (moving every ContentItemTag from the
    // suggested name onto the resolved tag) is handled by the server-side promotion
    // job. This UI performs the CORE promotion: it creates/links the tag and stamps
    // the suggestion's Status / ResolvedTagID / reviewer fields. The server-only
    // TagGovernanceEngine is intentionally NOT used here (it is server-side).

    private stampReviewFields(suggestion: MJTagSuggestionEntity): void {
        suggestion.ReviewedByUserID = this.ProviderToUse.CurrentUser.ID;
        suggestion.ReviewedAt = new Date();
        if (this.ReviewerNotes.trim()) {
            suggestion.ReviewerNotes = this.ReviewerNotes.trim();
        }
    }

    /** Approve as a brand-new tag: create the MJTagEntity, then resolve the suggestion. */
    public async ApproveAsNewTag(): Promise<void> {
        const suggestion = this.Selected;
        if (!suggestion || this.IsActing) return;
        this.IsActing = true;
        this.cdr.detectChanges();

        try {
            const p = this.ProviderToUse;
            const tag = await p.GetEntityObject<MJTagEntity>('MJ: Tags', p.CurrentUser);
            tag.NewRecord();
            tag.Name = suggestion.ProposedName;
            tag.DisplayName = suggestion.ProposedName;
            tag.ParentID = suggestion.ProposedParentID;

            const tagSaved = await tag.Save();
            if (!tagSaved) {
                this.notifyFailure('Failed to create tag', tag.LatestResult?.CompleteMessage);
                return;
            }

            this.stampReviewFields(suggestion);
            suggestion.Status = 'Approved';
            suggestion.ResolvedTagID = tag.ID;
            const sugSaved = await suggestion.Save();
            if (!sugSaved) {
                this.notifyFailure('Tag created but failed to resolve suggestion', suggestion.LatestResult?.CompleteMessage);
                return;
            }

            MJNotificationService.Instance.CreateSimpleNotification(
                `Approved "${suggestion.ProposedName}" as a new tag`, 'success', 3000
            );
            this.finishAction(suggestion);
        } catch (error) {
            this.notifyError(error);
        } finally {
            this.IsActing = false;
            this.cdr.detectChanges();
        }
    }

    /** Merge into an existing tag (default target = BestMatchTagID, override via dropdown). */
    public async MergeIntoExisting(): Promise<void> {
        const suggestion = this.Selected;
        if (!suggestion || this.IsActing) return;
        if (!this.MergeTargetID) {
            MJNotificationService.Instance.CreateSimpleNotification('Select a tag to merge into first', 'warning', 3000);
            return;
        }
        this.IsActing = true;
        this.cdr.detectChanges();

        try {
            this.stampReviewFields(suggestion);
            suggestion.Status = 'Merged';
            suggestion.ResolvedTagID = this.MergeTargetID;
            const saved = await suggestion.Save();
            if (!saved) {
                this.notifyFailure('Failed to merge suggestion', suggestion.LatestResult?.CompleteMessage);
                return;
            }

            MJNotificationService.Instance.CreateSimpleNotification(
                `Merged "${suggestion.ProposedName}" into "${this.MergeTargetLabel}"`, 'success', 3000
            );
            this.finishAction(suggestion);
        } catch (error) {
            this.notifyError(error);
        } finally {
            this.IsActing = false;
            this.cdr.detectChanges();
        }
    }

    /** Reject the suggestion. */
    public async Reject(): Promise<void> {
        const suggestion = this.Selected;
        if (!suggestion || this.IsActing) return;
        this.IsActing = true;
        this.cdr.detectChanges();

        try {
            this.stampReviewFields(suggestion);
            suggestion.Status = 'Rejected';
            const saved = await suggestion.Save();
            if (!saved) {
                this.notifyFailure('Failed to reject suggestion', suggestion.LatestResult?.CompleteMessage);
                return;
            }

            MJNotificationService.Instance.CreateSimpleNotification(
                `Rejected "${suggestion.ProposedName}"`, 'success', 2500
            );
            this.finishAction(suggestion);
        } catch (error) {
            this.notifyError(error);
        } finally {
            this.IsActing = false;
            this.cdr.detectChanges();
        }
    }

    /** Remove a resolved row, advance selection, rebuild counts, notify the host. */
    private finishAction(resolved: MJTagSuggestionEntity): void {
        const idx = this.FilteredSuggestions.findIndex(s => UUIDsEqual(s.ID, resolved.ID));
        this.allSuggestions = this.allSuggestions.filter(s => !UUIDsEqual(s.ID, resolved.ID));
        this.buildReasonCounts();
        this.applyReasonFilterAfterRemoval(idx);
        this.Resolved.emit();
        this.cdr.detectChanges();
    }

    /** Rebuild the filtered list and advance selection to the next sensible row. */
    private applyReasonFilterAfterRemoval(removedIndex: number): void {
        this.FilteredSuggestions = this.ReasonFilter
            ? this.allSuggestions.filter(s => s.Reason === this.ReasonFilter)
            : this.allSuggestions;

        const next = this.FilteredSuggestions[removedIndex] ?? this.FilteredSuggestions[removedIndex - 1] ?? null;
        this.SelectSuggestion(next);
    }

    private notifyFailure(prefix: string, detail: string | undefined): void {
        MJNotificationService.Instance.CreateSimpleNotification(`${prefix}: ${detail ?? 'unknown error'}`, 'error', 5000);
    }

    private notifyError(error: unknown): void {
        const msg = error instanceof Error ? error.message : String(error);
        MJNotificationService.Instance.CreateSimpleNotification(`Error: ${msg}`, 'error', 5000);
    }
}
