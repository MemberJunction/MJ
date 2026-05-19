import { Component, Input, OnInit, ChangeDetectorRef } from '@angular/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { BaseEntity, CompositeKey, UserInfo } from '@memberjunction/core';
import { RatingJSON } from '@memberjunction/core-entities';
import { DialogService } from '../../services/dialog.service';

/** Minimal shape we use against the loaded entity. All MJ entity subclasses
 *  implement `Load(ID)` via codegen but the base `BaseEntity<unknown>` type
 *  doesn't expose it, so we narrow here to keep the call generic across
 *  entity names without resorting to `any`. */
type LoadableEntity = BaseEntity<unknown> & {
  Load(KeyValuePairs: CompositeKey | string, EntityRelationshipsToLoad?: string[]): Promise<boolean>;
};

/**
 * Single-rating-per-message rating UI for an AI conversation response.
 *
 * Storage model: the rating + free-form comment live directly on the
 * ConversationDetail row, in `UserRating` (1-10, nullable) and `UserFeedback`
 * (nvarchar(max), nullable). This matches MJ's own pattern on
 * `__mj.ConversationDetail` and Skip's matching columns on
 * `Skip.ConversationDetail`. The host app picks the entity via @Input.
 */
@Component({
  standalone: false,
  selector: 'mj-conversation-message-rating',
  template: `
    <div class="rating-container">
      <div class="user-rating">
        <button
          class="rating-button"
          [class.has-rated]="currentUserRating != null"
          [disabled]="isSaving"
          (click)="OpenRatingDialog()"
          [title]="currentUserRating != null ? 'Edit your rating' : 'Rate this response'"
          type="button">
          @if (currentUserRating != null) {
            <i class="fa-solid fa-pen-to-square"></i>
            <span class="my-rating">My rating: {{ currentUserRating }}/10</span>
          } @else {
            <i class="fa-regular fa-comment-dots"></i>
            <span>Rate response</span>
          }
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

    .user-rating {
      display: flex;
      gap: 4px;
      margin-left: auto;
    }

    .rating-button {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: var(--mj-bg-surface);
      border: 1px solid var(--mj-border-strong);
      border-radius: 6px;
      padding: 6px 12px;
      cursor: pointer;
      font-size: 13px;
      color: var(--mj-text-primary);
      opacity: 0.85;
      transition: all 0.15s ease;
    }

    .rating-button:hover:not(:disabled) {
      opacity: 1;
      border-color: var(--mj-brand-primary);
      background: color-mix(in srgb, var(--mj-brand-primary) 6%, var(--mj-bg-surface));
    }

    .rating-button:disabled {
      cursor: not-allowed;
      opacity: 0.5;
    }

    .rating-button.has-rated {
      border-color: var(--mj-brand-primary);
      background: color-mix(in srgb, var(--mj-brand-primary) 10%, var(--mj-bg-surface));
    }

    .my-rating {
      font-weight: 500;
    }
  `]
})
export class ConversationMessageRatingComponent extends BaseAngularComponent implements OnInit {
  @Input() conversationDetailId!: string;
  @Input() currentUser!: UserInfo;

  /**
   * Entity name to load/update for the rating. Defaults to MJ's
   * `MJ: Conversation Details` (which has `UserRating`/`UserFeedback`).
   * Skip-Brain hosts pass `'Conversation Details__Skip'`.
   */
  @Input() ratingEntityName: string = 'MJ: Conversation Details';

  /** Column on the entity that stores the 1-10 rating. */
  @Input() ratingField: string = 'UserRating';

  /** Column on the entity that stores the free-form feedback. */
  @Input() ratingCommentField: string = 'UserFeedback';

  /**
   * Optional: legacy pre-loaded ratings array (no longer used by storage; kept
   * to preserve the input shape used by existing call sites like
   * MessageItemComponent).
   */
  @Input() ratingsData?: RatingJSON[];

  currentUserRating: number | null = null;
  currentUserComments: string = '';
  isSaving = false;

  constructor(
    private cdr: ChangeDetectorRef,
    private dialogService: DialogService
  ) {
    super();
  }

  async ngOnInit() {
    await this.loadRating();
  }

  async OpenRatingDialog(): Promise<void> {
    if (this.isSaving) return;

    const result = await this.dialogService.rating({
      title: this.currentUserRating != null ? 'Edit your rating' : 'Rate this response',
      message: 'Rate the response on a 1-10 scale and (optionally) describe what was good or bad.',
      initialRating: this.currentUserRating,
      initialComments: this.currentUserComments,
      okText: 'Submit'
    });

    if (result == null) return;
    await this.saveRating(result.rating, result.comments);
  }

  private async loadRating(): Promise<void> {
    if (!this.conversationDetailId) return;
    try {
      const md = this.ProviderToUse;
      const entity = (await md.GetEntityObject(this.ratingEntityName)) as LoadableEntity;
      const loaded = await entity.Load(this.conversationDetailId);
      if (loaded) {
        const rating = entity.Get(this.ratingField);
        this.currentUserRating = rating != null ? Number(rating) : null;
        this.currentUserComments = (entity.Get(this.ratingCommentField) ?? '') as string;
        this.cdr.detectChanges();
      }
    } catch (error) {
      // Silently swallow — message may not be persisted yet, or entity lookup failed.
      console.warn('[ConversationMessageRating] Could not load existing rating:', error);
    }
  }

  private async saveRating(rating: number, comments: string): Promise<void> {
    if (this.isSaving) return;
    if (rating < 1 || rating > 10) return;
    if (!this.conversationDetailId) return;

    const prevRating = this.currentUserRating;
    const prevComments = this.currentUserComments;

    // Optimistic update — UI reflects change instantly.
    this.isSaving = true;
    this.currentUserRating = rating;
    this.currentUserComments = comments;
    this.cdr.detectChanges();

    try {
      const md = this.ProviderToUse;
      const entity = (await md.GetEntityObject(this.ratingEntityName)) as LoadableEntity;
      const loaded = await entity.Load(this.conversationDetailId);
      if (!loaded) {
        throw new Error(`ConversationDetail ${this.conversationDetailId} not found in ${this.ratingEntityName}`);
      }
      entity.Set(this.ratingField, rating);
      entity.Set(this.ratingCommentField, comments || null);
      await entity.Save();
    } catch (error) {
      console.error('Failed to save rating:', error);
      // Roll back UI to previous state.
      this.currentUserRating = prevRating;
      this.currentUserComments = prevComments;
      this.cdr.detectChanges();
    } finally {
      this.isSaving = false;
      this.cdr.detectChanges();
    }
  }
}
