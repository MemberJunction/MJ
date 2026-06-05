/**
 * @fileoverview Classify · Tag Health tab.
 *
 * Self-contained sub-page that surfaces the REAL taxonomy-quality signals the
 * server-side TagHealthJob produces as `MJ: Tag Suggestions` rows with
 * `Reason ∈ {MergeCandidate, LowUsage, WideNode}`. The Suggestions Inbox tab
 * deliberately EXCLUDES these 3 reasons; the Health tab OWNS them.
 *
 * NOTE: the underlying signals (which tags are merge candidates, which are
 * low-usage, which are wide nodes) are computed SERVER-SIDE by the TagHealthJob
 * — this tab does not recompute them. It triages the resulting suggestion rows:
 * grouping them into the 3 signal buckets and applying human decisions
 * (Merge / Deprecate / Review-in-Taxonomy / Dismiss) as client-side entity
 * mutations on the suggestion (and, for Deprecate, on the subject Tag).
 *
 * Data is TRANSACTIONAL and grows over time — loaded via RunView (NOT cached),
 * grouped into the 3 buckets in memory. Loads lazily on first activation.
 */
import { Component, ChangeDetectorRef, EventEmitter, Output, inject } from '@angular/core';
import { RunView } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { MJTagSuggestionEntity, MJTagEntity } from '@memberjunction/core-entities';
import { TagEngineBase } from '@memberjunction/tag-engine-base';

/** The three health-signal reasons this tab owns. */
type HealthReason = 'MergeCandidate' | 'LowUsage' | 'WideNode';

/** Confidence floor for the "merge all high-confidence" bulk action. */
const HIGH_CONFIDENCE_THRESHOLD = 0.9;

/** Static descriptor for one of the 3 signal cards. */
interface SignalCardMeta {
    Reason: HealthReason;
    Title: string;
    Icon: string;
    /** Semantic status variant driving the card accent color. */
    Variant: 'info' | 'warning' | 'error';
    /** One-line explanation of what the signal means. */
    Explanation: string;
    /** Noun for the headline count (e.g. "pairs", "tags", "nodes"). */
    CountNoun: string;
}

/** A signal card's live view-model: its meta + the suggestions in its bucket. */
interface SignalCard {
    Meta: SignalCardMeta;
    Items: MJTagSuggestionEntity[];
}

/** Card descriptors in display order (merge → low-usage → wide-node). */
const SIGNAL_CARDS: SignalCardMeta[] = [
    {
        Reason: 'MergeCandidate',
        Title: 'Merge candidates',
        Icon: 'fa-solid fa-code-merge',
        Variant: 'info',
        Explanation: 'Near-duplicate tags with high embedding similarity — likely the same concept under two names.',
        CountNoun: 'pairs',
    },
    {
        Reason: 'LowUsage',
        Title: 'Low usage',
        Icon: 'fa-solid fa-arrow-trend-down',
        Variant: 'warning',
        Explanation: 'Tags applied to very few items recently — candidates to deprecate and keep the taxonomy lean.',
        CountNoun: 'tags',
    },
    {
        Reason: 'WideNode',
        Title: 'Wide nodes',
        Icon: 'fa-solid fa-arrows-left-right-to-line',
        Variant: 'error',
        Explanation: 'Tags with too many direct children — likely need splitting into sub-categories.',
        CountNoun: 'nodes',
    },
];

/** How many example items to surface per card before "show all". */
const PREVIEW_LIMIT = 5;

@Component({
    standalone: false,
    selector: 'classify-health-tab',
    templateUrl: './health-tab.component.html',
    styleUrls: ['./health-tab.component.css']
})
export class ClassifyHealthTabComponent extends BaseAngularComponent {
    private cdr = inject(ChangeDetectorRef);

    public readonly PreviewLimit = PREVIEW_LIMIT;
    public readonly HighConfidenceThreshold = HIGH_CONFIDENCE_THRESHOLD;

    // ── Loaded data (NOT cached — transactional) ──
    private allSuggestions: MJTagSuggestionEntity[] = [];
    public Cards: SignalCard[] = [];

    public IsLoading = false;
    private hasLoaded = false;
    /** ID of the suggestion currently being acted on (disables its row controls). */
    public ActingID: string | null = null;
    /** True while a bulk action is in flight. */
    public IsBulkActing = false;

    /** Emitted after any action so the host can refresh its pending/health badge. */
    @Output() Resolved = new EventEmitter<void>();

    /** Emitted with a tag ID so the host can switch to the Taxonomy tab for review. */
    @Output() OpenInTaxonomyRequested = new EventEmitter<string>();

    // ════════════════════════════════════════════
    // ACTIVATION + LOAD
    // ════════════════════════════════════════════

    /** Lazy-load on first activation (host calls this when the tab becomes active). */
    public async EnsureLoaded(): Promise<void> {
        if (this.hasLoaded) return;
        this.hasLoaded = true;
        await Promise.all([this.loadSuggestions(), this.ensureTagEngine()]);
    }

    /** Public refresh — re-pull the health suggestions and rebuild buckets. */
    public async Refresh(): Promise<void> {
        await this.loadSuggestions();
    }

    private async ensureTagEngine(): Promise<void> {
        await TagEngineBase.Instance.Config(false, this.ProviderToUse.CurrentUser, this.ProviderToUse);
    }

    private async loadSuggestions(): Promise<void> {
        this.IsLoading = true;
        this.cdr.detectChanges();

        const rv = RunView.FromMetadataProvider(this.ProviderToUse);
        const result = await rv.RunView<MJTagSuggestionEntity>({
            EntityName: 'MJ: Tag Suggestions',
            ExtraFilter: `Status='Pending' AND Reason IN ('MergeCandidate','LowUsage','WideNode')`,
            OrderBy: 'BestMatchScore DESC',
            ResultType: 'entity_object',
        }, this.ProviderToUse.CurrentUser);

        this.allSuggestions = result.Success ? result.Results : [];
        this.buildCards();

        this.IsLoading = false;
        this.cdr.detectChanges();
    }

    /** Group the loaded suggestions into the 3 signal buckets, preserving card order. */
    private buildCards(): void {
        this.Cards = SIGNAL_CARDS.map(meta => ({
            Meta: meta,
            Items: this.allSuggestions.filter(s => s.Reason === meta.Reason),
        }));
    }

    // ════════════════════════════════════════════
    // DISPLAY HELPERS
    // ════════════════════════════════════════════

    public FormatScore(score: number | null): string {
        return score == null ? '—' : score.toFixed(2);
    }

    /** Count of high-confidence merge candidates eligible for the bulk merge. */
    public HighConfidenceCount(card: SignalCard): number {
        if (card.Meta.Reason !== 'MergeCandidate') return 0;
        return card.Items.filter(s => (s.BestMatchScore ?? 0) >= HIGH_CONFIDENCE_THRESHOLD).length;
    }

    /** Whether a given suggestion's row controls should be disabled. */
    public IsRowBusy(suggestion: MJTagSuggestionEntity): boolean {
        return this.IsBulkActing || (this.ActingID != null && UUIDsEqual(this.ActingID, suggestion.ID));
    }

    // ════════════════════════════════════════════
    // ACTIONS — entity-level mutations on the client
    // ════════════════════════════════════════════
    //
    // NOTE: the health signals themselves are computed server-side by the
    // TagHealthJob. These handlers triage the resulting suggestion rows by
    // stamping reviewer fields + resolving status (and, for Deprecate, flipping
    // the subject Tag's Status). Full downstream re-pointing of content-item
    // tags onto the resolved tag is handled by the server-side promotion job.

    private stampReviewFields(suggestion: MJTagSuggestionEntity): void {
        suggestion.ReviewedByUserID = this.ProviderToUse.CurrentUser.ID;
        suggestion.ReviewedAt = new Date();
    }

    /** Merge candidate → Merge: resolve the suggestion onto its best-match tag. */
    public async Merge(suggestion: MJTagSuggestionEntity): Promise<void> {
        if (this.IsRowBusy(suggestion)) return;
        if (!suggestion.BestMatchTagID) {
            MJNotificationService.Instance.CreateSimpleNotification(
                'No best-match tag to merge into', 'warning', 3000);
            return;
        }
        this.ActingID = suggestion.ID;
        this.cdr.detectChanges();

        try {
            const saved = await this.resolveMerge(suggestion);
            if (saved) {
                MJNotificationService.Instance.CreateSimpleNotification(
                    `Merged "${suggestion.ProposedName}" into "${suggestion.BestMatchTag ?? 'best match'}"`, 'success', 3000);
                this.finishAction(suggestion);
            }
        } catch (error) {
            this.notifyError(error);
        } finally {
            this.ActingID = null;
            this.cdr.detectChanges();
        }
    }

    /** Bulk: merge every high-confidence (score ≥ 0.9) merge candidate at once. */
    public async MergeAllHighConfidence(card: SignalCard): Promise<void> {
        if (card.Meta.Reason !== 'MergeCandidate' || this.IsBulkActing) return;
        const targets = card.Items.filter(s =>
            (s.BestMatchScore ?? 0) >= HIGH_CONFIDENCE_THRESHOLD && s.BestMatchTagID);
        if (targets.length === 0) return;

        this.IsBulkActing = true;
        this.cdr.detectChanges();

        let succeeded = 0;
        try {
            for (const suggestion of targets) {
                const saved = await this.resolveMerge(suggestion);
                if (saved) {
                    this.allSuggestions = this.allSuggestions.filter(s => !UUIDsEqual(s.ID, suggestion.ID));
                    succeeded++;
                }
            }
            this.buildCards();
            MJNotificationService.Instance.CreateSimpleNotification(
                `Merged ${succeeded} high-confidence candidate${succeeded === 1 ? '' : 's'}`, 'success', 3000);
            if (succeeded > 0) this.Resolved.emit();
        } catch (error) {
            this.notifyError(error);
        } finally {
            this.IsBulkActing = false;
            this.cdr.detectChanges();
        }
    }

    /** Stamp + resolve a single merge suggestion. Returns Save() success. */
    private async resolveMerge(suggestion: MJTagSuggestionEntity): Promise<boolean> {
        this.stampReviewFields(suggestion);
        suggestion.Status = 'Merged';
        suggestion.ResolvedTagID = suggestion.BestMatchTagID;
        const saved = await suggestion.Save();
        if (!saved) {
            this.notifyFailure('Failed to merge suggestion', suggestion.LatestResult?.CompleteMessage);
        }
        return saved;
    }

    /** Low usage → Deprecate: flip the subject Tag to Deprecated, then resolve. */
    public async Deprecate(suggestion: MJTagSuggestionEntity): Promise<void> {
        if (this.IsRowBusy(suggestion)) return;
        this.ActingID = suggestion.ID;
        this.cdr.detectChanges();

        try {
            const tag = await this.resolveSubjectTag(suggestion);
            if (!tag) {
                this.notifyFailure('Could not find the tag to deprecate', 'no matching MJ: Tags record');
                return;
            }

            tag.Status = 'Deprecated';
            const tagSaved = await tag.Save();
            if (!tagSaved) {
                this.notifyFailure('Failed to deprecate tag', tag.LatestResult?.CompleteMessage);
                return;
            }

            this.stampReviewFields(suggestion);
            suggestion.Status = 'Approved';
            suggestion.ResolvedTagID = tag.ID;
            const sugSaved = await suggestion.Save();
            if (!sugSaved) {
                this.notifyFailure('Tag deprecated but failed to resolve suggestion', suggestion.LatestResult?.CompleteMessage);
                return;
            }

            MJNotificationService.Instance.CreateSimpleNotification(
                `Deprecated "${tag.DisplayName || tag.Name}"`, 'success', 3000);
            this.finishAction(suggestion);
        } catch (error) {
            this.notifyError(error);
        } finally {
            this.ActingID = null;
            this.cdr.detectChanges();
        }
    }

    /**
     * Resolve the subject Tag for a low-usage suggestion: prefer the best-match
     * tag (that IS the low-usage tag here), else fall back to the already-resolved
     * tag, else look up by proposed name via the cached TagEngineBase tags.
     */
    private async resolveSubjectTag(suggestion: MJTagSuggestionEntity): Promise<MJTagEntity | null> {
        const tagID = suggestion.BestMatchTagID ?? suggestion.ResolvedTagID ?? this.lookupTagIDByName(suggestion.ProposedName);
        if (!tagID) return null;

        const p = this.ProviderToUse;
        const tag = await p.GetEntityObject<MJTagEntity>('MJ: Tags', p.CurrentUser);
        const loaded = await tag.Load(tagID);
        return loaded ? tag : null;
    }

    /** Case-insensitive name → tag ID lookup against the cached tag set. */
    private lookupTagIDByName(name: string): string | null {
        const lower = name.trim().toLowerCase();
        const match = TagEngineBase.Instance.Tags.find(t =>
            (t.DisplayName || t.Name).trim().toLowerCase() === lower ||
            t.Name.trim().toLowerCase() === lower);
        return match?.ID ?? null;
    }

    /**
     * Wide node → Review in Taxonomy: bubble the tag ID up so the host can switch
     * to the Taxonomy tab. The suggestion stays Pending — review happens there.
     */
    public ReviewInTaxonomy(suggestion: MJTagSuggestionEntity): void {
        const tagID = suggestion.BestMatchTagID ?? suggestion.ResolvedTagID ?? this.lookupTagIDByName(suggestion.ProposedName);
        if (tagID) {
            this.OpenInTaxonomyRequested.emit(tagID);
        } else {
            // No resolvable tag — still let the host open the taxonomy surface.
            this.OpenInTaxonomyRequested.emit('');
        }
    }

    /** Dismiss any signal: mark the suggestion Rejected. */
    public async Dismiss(suggestion: MJTagSuggestionEntity): Promise<void> {
        if (this.IsRowBusy(suggestion)) return;
        this.ActingID = suggestion.ID;
        this.cdr.detectChanges();

        try {
            this.stampReviewFields(suggestion);
            suggestion.Status = 'Rejected';
            const saved = await suggestion.Save();
            if (!saved) {
                this.notifyFailure('Failed to dismiss suggestion', suggestion.LatestResult?.CompleteMessage);
                return;
            }
            MJNotificationService.Instance.CreateSimpleNotification(
                `Dismissed "${suggestion.ProposedName}"`, 'success', 2500);
            this.finishAction(suggestion);
        } catch (error) {
            this.notifyError(error);
        } finally {
            this.ActingID = null;
            this.cdr.detectChanges();
        }
    }

    /** Remove a resolved suggestion, rebuild buckets, notify the host. */
    private finishAction(resolved: MJTagSuggestionEntity): void {
        this.allSuggestions = this.allSuggestions.filter(s => !UUIDsEqual(s.ID, resolved.ID));
        this.buildCards();
        this.Resolved.emit();
        this.cdr.detectChanges();
    }

    private notifyFailure(prefix: string, detail: string | undefined): void {
        MJNotificationService.Instance.CreateSimpleNotification(`${prefix}: ${detail ?? 'unknown error'}`, 'error', 5000);
    }

    private notifyError(error: unknown): void {
        const msg = error instanceof Error ? error.message : String(error);
        MJNotificationService.Instance.CreateSimpleNotification(`Error: ${msg}`, 'error', 5000);
    }
}
