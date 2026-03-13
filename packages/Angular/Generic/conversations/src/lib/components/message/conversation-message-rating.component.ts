import { Component, Input, OnInit } from '@angular/core';
import { Metadata, RunView, UserInfo } from '@memberjunction/core';
import { MJConversationDetailRatingEntity } from '@memberjunction/core-entities';
import { RatingJSON } from '../../models/conversation-complete-query.model';
import { UUIDsEqual } from '@memberjunction/global';

/**
 * Component for displaying and managing multi-user ratings on conversation messages.
 * Shows aggregate ratings and allows users to provide their own rating.
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
              (click)="RateThumbsUp()"
              title="This was helpful"
              type="button">
              👍
            </button>
            <button
              class="rating-button thumbs-down-btn"
              [class.active]="currentUserRating != null && currentUserRating <= 3"
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

        .rating-button:hover {
            opacity: 1;
            border-color: var(--mj-text-muted);
        }

        .rating-button.active {
            opacity: 1;
        }

        .thumbs-up-btn {
            color: var(--mj-status-success);
        }

        .thumbs-up-btn:hover {
            background: color-mix(in srgb, var(--mj-status-success) 8%, var(--mj-bg-surface));
        }

        .thumbs-up-btn.active {
            border-color: var(--mj-status-success);
            background: color-mix(in srgb, var(--mj-status-success) 15%, var(--mj-bg-surface));
        }

        .thumbs-down-btn {
            color: var(--mj-status-error);
        }

        .thumbs-down-btn:hover {
            background: color-mix(in srgb, var(--mj-status-error) 8%, var(--mj-bg-surface));
        }

        .thumbs-down-btn.active {
            border-color: var(--mj-status-error);
            background: color-mix(in srgb, var(--mj-status-error) 15%, var(--mj-bg-surface));
        }
    `]
})
export class ConversationMessageRatingComponent implements OnInit {
    @Input() conversationDetailId!: string;
    @Input() currentUser!: UserInfo;
    @Input() ratingsData?: RatingJSON[]; // Pre-loaded ratings from parent (RatingsJSON from query)

    thumbsUpCount = 0;
    thumbsDownCount = 0;
    totalRatings = 0;
    currentUserRating: number | null = null;
    allRatings: RatingJSON[] = [];

    private get currentUserId(): string {
        return this.currentUser?.ID || '';
    }

    async ngOnInit() {
        if (this.ratingsData) {
            // Use pre-loaded ratings (no database query needed)
            this.ProcessRatings(this.ratingsData);
        } else {
            // Fallback to loading ratings if not provided
            await this.LoadRatings();
        }
    }

    /**
     * Process ratings data (from query or API)
     */
    private ProcessRatings(ratings: RatingJSON[] | MJConversationDetailRatingEntity[]): void {
        this.allRatings = ratings as RatingJSON[];
        this.thumbsUpCount = ratings.filter(r => r.Rating ? r.Rating >= 8 : false).length;
        this.thumbsDownCount = ratings.filter(r => r.Rating ? r.Rating <= 3 : false).length;
        this.totalRatings = ratings.length;

        const currentUserRating = ratings.find(r => UUIDsEqual(r.UserID, this.currentUserId));
        this.currentUserRating = currentUserRating?.Rating ?? null;
    }

    /**
     * Get tooltip showing who rated this message
     */
    getRatingsTooltip(): string {
        if (this.allRatings.length === 0) return '';

        const thumbsUpUsers = this.allRatings
            .filter(r => r.Rating ? r.Rating >= 8 : false)
            .map(r => (r as RatingJSON).UserName || 'Unknown')
            .join(', ');

        const thumbsDownUsers = this.allRatings
            .filter(r => r.Rating ? r.Rating <= 3 : false)
            .map(r => (r as RatingJSON).UserName || 'Unknown')
            .join(', ');

        const parts: string[] = [];
        if (thumbsUpUsers) parts.push(`👍 ${thumbsUpUsers}`);
        if (thumbsDownUsers) parts.push(`👎 ${thumbsDownUsers}`);

        return parts.join('\n');
    }

    /**
     * Load all ratings for this message (fallback if not pre-loaded)
     */
    async LoadRatings(): Promise<void> {
        try {
            const rv = new RunView();
            const result = await rv.RunView<MJConversationDetailRatingEntity>({
                EntityName: 'MJ: Conversation Detail Ratings',
                ExtraFilter: `ConversationDetailID='${this.conversationDetailId}'`,
                ResultType: 'entity_object'
            });

            if (!result.Success || !result.Results) {
                return;
            }

            this.ProcessRatings(result.Results);

        } catch (error) {
            console.error('Failed to load ratings:', error);
        }
    }

    /**
     * Rate message as thumbs up (10/10)
     */
    async RateThumbsUp(): Promise<void> {
        await this.SaveRating(10);
    }

    /**
     * Rate message as thumbs down (1/10)
     */
    async RateThumbsDown(): Promise<void> {
        await this.SaveRating(1);
    }

    /**
     * Save or update user's rating for this message
     */
    private async SaveRating(rating: number): Promise<void> {
        try {
            const md = new Metadata();
            let ratingEntity: MJConversationDetailRatingEntity;

            // Try to load existing rating
            const rv = new RunView();
            const existing = await rv.RunView<MJConversationDetailRatingEntity>({
                EntityName: 'MJ: Conversation Detail Ratings',
                ExtraFilter: `ConversationDetailID='${this.conversationDetailId}' AND UserID='${this.currentUserId}'`,
                MaxRows: 1,
                ResultType: 'entity_object'
            });

            if (existing.Success && existing.Results && existing.Results.length > 0) {
                // Update existing
                ratingEntity = existing.Results[0];

                // If clicking same rating, remove it (toggle off)
                if (ratingEntity.Rating === rating) {
                    await ratingEntity.Delete();
                    await this.LoadRatings();
                    return;
                }

                ratingEntity.Rating = rating;
            } else {
                // Create new
                ratingEntity = await md.GetEntityObject<MJConversationDetailRatingEntity>('MJ: Conversation Detail Ratings');
                ratingEntity.ConversationDetailID = this.conversationDetailId;
                ratingEntity.UserID = this.currentUserId;
                ratingEntity.Rating = rating;
            }

            await ratingEntity.Save();
            await this.LoadRatings();

        } catch (error) {
            console.error('Failed to save rating:', error);
        }
    }
}
