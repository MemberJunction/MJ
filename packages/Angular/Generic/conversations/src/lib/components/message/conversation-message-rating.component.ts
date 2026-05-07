import { Component, Input, OnInit, ChangeDetectorRef } from '@angular/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { Metadata, RunView, UserInfo } from '@memberjunction/core';
import { MJConversationDetailRatingEntity, RatingJSON } from '@memberjunction/core-entities';
import { UUIDsEqual } from '@memberjunction/global';

/**
 * Component for displaying and managing multi-user ratings on conversation messages.
 * Shows aggregate ratings and allows users to provide their own rating.
 * Uses optimistic updates — UI reflects the change immediately while DB saves in background.
 */
@Component({
  standalone: false,
    selector: 'mj-conversation-message-rating',
    template: `
        <div class="rating-container">
          @if (totalRatings > 0) {
            <div class="aggregate-rating" [title]="getRatingsTooltip()">
              <span class="thumbs-up" [class.has-votes]="thumbsUpCount > 0">
                👍 {{ thumbsUpCount }}
              </span>
              <span class="thumbs-down" [class.has-votes]="thumbsDownCount > 0">
                👎 {{ thumbsDownCount }}
              </span>
              <span class="total-count">({{ totalRatings }} {{ totalRatings === 1 ? 'rating' : 'ratings' }})</span>
            </div>
          }

          <div class="user-rating" [class.has-rated]="currentUserRating != null">
            <button
              class="rating-button thumbs-up-btn"
              [class.active]="currentUserRating != null && currentUserRating >= 8"
              [disabled]="isSaving"
              (click)="RateThumbsUp()"
              title="This was helpful"
              type="button">
              👍
            </button>
            <button
              class="rating-button thumbs-down-btn"
              [class.active]="currentUserRating != null && currentUserRating <= 3"
              [disabled]="isSaving"
              (click)="RateThumbsDown()"
              title="This was not helpful"
              type="button">
              👎
            </button>
          </div>
        </div>
        `,
    styles: [`
        .rating-container {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 4px 0;
        }

        .aggregate-rating {
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 13px;
            color: var(--mj-text-muted);
        }

        .thumbs-up, .thumbs-down {
            opacity: 0.5;
        }

        .thumbs-up.has-votes, .thumbs-down.has-votes {
            opacity: 1;
        }

        .total-count {
            font-size: 12px;
            color: var(--mj-text-disabled);
        }

        .user-rating {
            display: flex;
            gap: 4px;
            margin-left: auto;
        }

        .rating-button {
            background: var(--mj-bg-surface);
            border: 1px solid var(--mj-border-strong);
            border-radius: 6px;
            padding: 6px 10px;
            cursor: pointer;
            font-size: 16px;
            opacity: 0.6;
            transition: all 0.2s;
            min-width: 36px;
        }

        .rating-button:hover:not(:disabled) {
            opacity: 1;
            border-color: var(--mj-text-muted);
        }

        .rating-button:disabled {
            cursor: not-allowed;
            opacity: 0.4;
        }

        .rating-button.active {
            opacity: 1;
        }

        .thumbs-up-btn {
            color: var(--mj-status-success);
        }

        .thumbs-up-btn:hover:not(:disabled) {
            background: color-mix(in srgb, var(--mj-status-success) 8%, var(--mj-bg-surface));
        }

        .thumbs-up-btn.active {
            border-color: var(--mj-status-success);
            background: color-mix(in srgb, var(--mj-status-success) 15%, var(--mj-bg-surface));
        }

        .thumbs-down-btn {
            color: var(--mj-status-error);
        }

        .thumbs-down-btn:hover:not(:disabled) {
            background: color-mix(in srgb, var(--mj-status-error) 8%, var(--mj-bg-surface));
        }

        .thumbs-down-btn.active {
            border-color: var(--mj-status-error);
            background: color-mix(in srgb, var(--mj-status-error) 15%, var(--mj-bg-surface));
        }
    `]
})
export class ConversationMessageRatingComponent extends BaseAngularComponent implements OnInit  {
    @Input() conversationDetailId!: string;
    @Input() currentUser!: UserInfo;
    @Input() ratingsData?: RatingJSON[];

    thumbsUpCount = 0;
    thumbsDownCount = 0;
    totalRatings = 0;
    currentUserRating: number | null = null;
    isSaving = false;

    private allRatings: RatingJSON[] = [];
    private currentUserRatingId: string | null = null;

    private get currentUserId(): string {
        return this.currentUser?.ID || '';
    }

    constructor(private cdr: ChangeDetectorRef) {
    super();}

    async ngOnInit() {
        if (this.ratingsData) {
            this.processRatings(this.ratingsData);
        } else {
            await this.loadRatings();
        }
    }

    private processRatings(ratings: RatingJSON[] | MJConversationDetailRatingEntity[]): void {
        this.allRatings = ratings as RatingJSON[];
        this.thumbsUpCount = ratings.filter(r => r.Rating != null && r.Rating >= 8).length;
        this.thumbsDownCount = ratings.filter(r => r.Rating != null && r.Rating <= 3).length;
        this.totalRatings = ratings.length;

        const mine = ratings.find(r => UUIDsEqual(r.UserID, this.currentUserId));
        this.currentUserRating = mine?.Rating ?? null;
        this.currentUserRatingId = mine ? (mine as RatingJSON).ID ?? null : null;
    }

    getRatingsTooltip(): string {
        if (this.allRatings.length === 0) return '';

        const upUsers = this.allRatings
            .filter(r => r.Rating != null && r.Rating >= 8)
            .map(r => (r as RatingJSON).UserName || 'Unknown')
            .join(', ');

        const downUsers = this.allRatings
            .filter(r => r.Rating != null && r.Rating <= 3)
            .map(r => (r as RatingJSON).UserName || 'Unknown')
            .join(', ');

        const parts: string[] = [];
        if (upUsers) parts.push(`👍 ${upUsers}`);
        if (downUsers) parts.push(`👎 ${downUsers}`);
        return parts.join('\n');
    }

    async RateThumbsUp(): Promise<void> {
        await this.saveRating(10);
    }

    async RateThumbsDown(): Promise<void> {
        await this.saveRating(1);
    }

    private async loadRatings(): Promise<void> {
        try {
            const rv = RunView.FromMetadataProvider(this.ProviderToUse);
            const result = await rv.RunView<MJConversationDetailRatingEntity>({
                EntityName: 'MJ: Conversation Detail Ratings',
                ExtraFilter: `ConversationDetailID='${this.conversationDetailId}'`,
                ResultType: 'entity_object'
            });
            if (result.Success && result.Results) {
                this.processRatings(result.Results);
                this.cdr.detectChanges();
            }
        } catch (error) {
            console.error('Failed to load ratings:', error);
        }
    }

    private applyOptimisticUpdate(rating: number): void {
        const wasThumbsUp = this.currentUserRating != null && this.currentUserRating >= 8;
        const wasThumbsDown = this.currentUserRating != null && this.currentUserRating <= 3;

        // Adjust counts when switching from an existing rating
        if (wasThumbsUp) this.thumbsUpCount--;
        if (wasThumbsDown) this.thumbsDownCount--;
        if (!wasThumbsUp && !wasThumbsDown) this.totalRatings++;

        this.currentUserRating = rating;
        if (rating >= 8) this.thumbsUpCount++;
        else this.thumbsDownCount++;
    }

    private async saveRating(rating: number): Promise<void> {
        if (this.isSaving) return;

        // Ignore if user clicks the same rating they already have
        if (this.currentUserRating === rating) return;

        // Snapshot for rollback
        const prevRating = this.currentUserRating;
        const prevRatingId = this.currentUserRatingId;
        const prevThumbsUp = this.thumbsUpCount;
        const prevThumbsDown = this.thumbsDownCount;
        const prevTotal = this.totalRatings;

        // Optimistic update — UI reflects change instantly
        this.isSaving = true;
        this.applyOptimisticUpdate(rating);
        this.cdr.detectChanges();

        try {
            await this.persistRating(rating, prevRatingId);
        } catch (error) {
            // Roll back to previous state on failure
            console.error('Failed to save rating:', error);
            this.currentUserRating = prevRating;
            this.currentUserRatingId = prevRatingId;
            this.thumbsUpCount = prevThumbsUp;
            this.thumbsDownCount = prevThumbsDown;
            this.totalRatings = prevTotal;
            this.cdr.detectChanges();
        } finally {
            this.isSaving = false;
            this.cdr.detectChanges();
        }
    }

    private async persistRating(rating: number, prevRatingId: string | null): Promise<void> {
        if (prevRatingId) {
            // Update existing rating (switch thumbs up ↔ down)
            const md = this.ProviderToUse;
            const entity = await md.GetEntityObject<MJConversationDetailRatingEntity>('MJ: Conversation Detail Ratings');
            const loaded = await entity.Load(prevRatingId);
            if (loaded) {
                entity.Rating = rating;
                await entity.Save();
            }
        } else {
            // Create new rating
            const md = this.ProviderToUse;
            const entity = await md.GetEntityObject<MJConversationDetailRatingEntity>('MJ: Conversation Detail Ratings');
            entity.ConversationDetailID = this.conversationDetailId;
            entity.UserID = this.currentUserId;
            entity.Rating = rating;
            await entity.Save();
            this.currentUserRatingId = entity.ID;
        }
    }
}
