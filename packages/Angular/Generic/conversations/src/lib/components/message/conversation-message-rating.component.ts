import { Component, Input, OnInit, ChangeDetectorRef } from '@angular/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { BaseEntity, CompositeKey, RunView, UserInfo } from '@memberjunction/core';
import { RatingJSON, UserInfoEngine } from '@memberjunction/core-entities';
import { DialogService } from '../../services/dialog.service';

const FEEDBACK_CONSENT_KEY = 'agent-feedback-share-consent';
const CONVERSATIONS_RESOURCE_TYPE_ID = '81D4BC3D-9FEB-EF11-B01A-286B35C04427';
const FEEDBACK_ROLE_IDS = [
  'deafccec-6a37-ef11-86d4-000d3a4e707e', // Developer
  'dfafccec-6a37-ef11-86d4-000d3a4e707e'  // Integration
];

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
        @if (canEdit) {
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
        } @else if (currentUserRating != null) {
          <span class="rating-readonly"
                title="Rating left by the conversation owner — read-only">
            <i class="fa-solid fa-comment-dots"></i>
            <span>Rated {{ currentUserRating }}/10</span>
          </span>
        }
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

    .rating-readonly {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 10px;
      border: 1px solid var(--mj-border-default);
      border-radius: 6px;
      font-size: 12px;
      color: var(--mj-text-secondary);
      background: var(--mj-bg-surface-sunken);
      cursor: default;
    }
  `]
})
export class ConversationMessageRatingComponent extends BaseAngularComponent implements OnInit {
  @Input() ConversationDetailId!: string;

  /** @deprecated Use {@link ConversationDetailId}. */
  @Input() set conversationDetailId(value: string) {
    this.ConversationDetailId = value;
  }
  /** @deprecated Use {@link ConversationDetailId}. */
  get conversationDetailId(): string {
    return this.ConversationDetailId;
  }
  @Input() CurrentUser!: UserInfo;

  /** @deprecated Use {@link CurrentUser}. */
  @Input() set currentUser(value: UserInfo) {
    this.CurrentUser = value;
  }
  /** @deprecated Use {@link CurrentUser}. */
  get currentUser(): UserInfo {
    return this.CurrentUser;
  }

  /**
   * When false, the rating UI renders as a read-only badge instead of an editable
   * button. Set by the parent (MessageItemComponent) to `false` when the current
   * user is not the conversation owner — the rating storage is a single field on
   * the ConversationDetail row, so only the owner is allowed to mutate it.
   */
  @Input() canEdit: boolean = true;

  /**
   * Entity name to load/update for the rating. Defaults to MJ's
   * `MJ: Conversation Details` (which has `UserRating`/`UserFeedback`).
   * Skip-Brain hosts pass `'Conversation Details__Skip'`.
   */
  @Input() RatingEntityName: string = 'MJ: Conversation Details';

  /** @deprecated Use {@link RatingEntityName}. */
  @Input() set ratingEntityName(value: string) {
    this.RatingEntityName = value;
  }
  /** @deprecated Use {@link RatingEntityName}. */
  get ratingEntityName(): string {
    return this.RatingEntityName;
  }

  /** Column on the entity that stores the 1-10 rating. */
  @Input() RatingField: string = 'UserRating';

  /** @deprecated Use {@link RatingField}. */
  @Input() set ratingField(value: string) {
    this.RatingField = value;
  }
  /** @deprecated Use {@link RatingField}. */
  get ratingField(): string {
    return this.RatingField;
  }

  /** Column on the entity that stores the free-form feedback. */
  @Input() RatingCommentField: string = 'UserFeedback';

  /** @deprecated Use {@link RatingCommentField}. */
  @Input() set ratingCommentField(value: string) {
    this.RatingCommentField = value;
  }
  /** @deprecated Use {@link RatingCommentField}. */
  get ratingCommentField(): string {
    return this.RatingCommentField;
  }

  /**
   * Optional: legacy pre-loaded ratings array (no longer used by storage; kept
   * to preserve the input shape used by existing call sites like
   * MessageItemComponent).
   */
  @Input() RatingsData?: RatingJSON[];

  /** @deprecated Use {@link RatingsData}. */
  @Input() set ratingsData(value: RatingJSON[] | undefined) {
    this.RatingsData = value;
  }
  /** @deprecated Use {@link RatingsData}. */
  get ratingsData(): RatingJSON[] | undefined {
    return this.RatingsData;
  }

  CurrentUserRating: number | null = null;

  /** @deprecated Use {@link CurrentUserRating}. */
  get currentUserRating(): number | null {
    return this.CurrentUserRating;
  }
  /** @deprecated Use {@link CurrentUserRating}. */
  set currentUserRating(value: number | null) {
    this.CurrentUserRating = value;
  }
  CurrentUserComments: string = '';

  /** @deprecated Use {@link CurrentUserComments}. */
  get currentUserComments(): string {
    return this.CurrentUserComments;
  }
  /** @deprecated Use {@link CurrentUserComments}. */
  set currentUserComments(value: string) {
    this.CurrentUserComments = value;
  }
  IsSaving = false;

  /** @deprecated Use {@link IsSaving}. */
  get isSaving() {
    return this.IsSaving;
  }
  /** @deprecated Use {@link IsSaving}. */
  set isSaving(value) {
    this.IsSaving = value;
  }

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
    if (this.IsSaving) return;
    if (!this.canEdit) return;

    let consentAcknowledged = false;
    try {
      await UserInfoEngine.Instance.Config();
      consentAcknowledged = UserInfoEngine.Instance.GetSetting(FEEDBACK_CONSENT_KEY) === 'true';
    } catch (e) {
      console.warn('[Rating] Could not read consent flag, will require acknowledgement', e);
    }

    const result = await this.dialogService.rating({
      title: this.CurrentUserRating != null ? 'Edit your rating' : 'Rate this response',
      message: 'Rate the response on a 1-10 scale and (optionally) describe what was good or bad.',
      initialRating: this.CurrentUserRating,
      initialComments: this.CurrentUserComments,
      okText: 'Submit',
      requireConsent: !consentAcknowledged
    });

    if (result == null) return;

    const conversationID = await this.saveRating(result.rating, result.comments);

    if (result.consentNewlyAcknowledged) {
      try {
        const saved = await UserInfoEngine.Instance.SetSetting(FEEDBACK_CONSENT_KEY, 'true');
        if (!saved) {
          console.error(
            `[Rating] Failed to persist consent acknowledgement under key "${FEEDBACK_CONSENT_KEY}" — ` +
            `the dialog will re-prompt on next rating. Likely cause: the current user lacks ` +
            `create/update permission on the "MJ: User Settings" entity.`
          );
        }
      } catch (e) {
        console.error('[Rating] Could not persist consent flag', e);
      }
    }

    if (conversationID) {
      await this.grantConversationAccess(conversationID);
    }
  }

  /**
   * Grants the Integrations and Developer roles View access to the parent
   * Conversation via `MJ: Resource Permissions`. Idempotent — existing
   * permissions for the same role are not duplicated. Best-effort; any error
   * is logged but does not roll back the rating itself.
   */
  private async grantConversationAccess(conversationID: string): Promise<void> {
    try {
      const md = this.ProviderToUse;
      const rv = RunView.FromMetadataProvider(md);
      const existing = await rv.RunView({
        EntityName: 'MJ: Resource Permissions',
        ExtraFilter:
          `ResourceTypeID='${CONVERSATIONS_RESOURCE_TYPE_ID}' AND ` +
          `ResourceRecordID='${conversationID}' AND Type='Role' AND ` +
          `RoleID IN ('${FEEDBACK_ROLE_IDS.join("','")}')`
      });

      const granted = new Set<string>(
        (existing.Results || []).map((r: any) => (r.RoleID || '').toLowerCase())
      );

      for (const roleID of FEEDBACK_ROLE_IDS) {
        if (granted.has(roleID.toLowerCase())) continue;
        const perm = await md.GetEntityObject('MJ: Resource Permissions');
        perm.NewRecord();
        perm.Set('ResourceTypeID', CONVERSATIONS_RESOURCE_TYPE_ID);
        perm.Set('ResourceRecordID', conversationID);
        perm.Set('Type', 'Role');
        perm.Set('RoleID', roleID);
        perm.Set('PermissionLevel', 'View');
        perm.Set('Status', 'Approved');
        const ok = await perm.Save();
        if (!ok) {
          console.warn('[Rating] Failed to create ResourcePermission for role', roleID, (perm as any).LatestResult);
        }
      }
    } catch (e) {
      console.warn('[Rating] grantConversationAccess failed:', e);
    }
  }

  private async loadRating(): Promise<void> {
    if (!this.ConversationDetailId) return;
    try {
      const md = this.ProviderToUse;
      const entity = (await md.GetEntityObject(this.RatingEntityName)) as LoadableEntity;
      const loaded = await entity.Load(this.ConversationDetailId);
      if (loaded) {
        const rating = entity.Get(this.RatingField);
        this.CurrentUserRating = rating != null ? Number(rating) : null;
        this.CurrentUserComments = (entity.Get(this.RatingCommentField) ?? '') as string;
        this.cdr.detectChanges();
      }
    } catch (error) {
      // Silently swallow — message may not be persisted yet, or entity lookup failed.
      console.warn('[ConversationMessageRating] Could not load existing rating:', error);
    }
  }

  private async saveRating(rating: number, comments: string): Promise<string | null> {
    if (this.IsSaving) return null;
    if (rating < 1 || rating > 10) return null;
    if (!this.ConversationDetailId) return null;

    const prevRating = this.CurrentUserRating;
    const prevComments = this.CurrentUserComments;

    this.IsSaving = true;
    this.CurrentUserRating = rating;
    this.CurrentUserComments = comments;
    this.cdr.detectChanges();

    try {
      const md = this.ProviderToUse;
      const entity = (await md.GetEntityObject(this.RatingEntityName)) as LoadableEntity;
      const loaded = await entity.Load(this.ConversationDetailId);
      if (!loaded) {
        throw new Error(`ConversationDetail ${this.ConversationDetailId} not found in ${this.RatingEntityName}`);
      }
      entity.Set(this.RatingField, rating);
      entity.Set(this.RatingCommentField, comments || null);
      const saveResult = await entity.Save();
      if (!saveResult) {
        throw new Error(`Save failed: ${(entity as any).LatestResult?.Message ?? 'unknown'}`);
      }
      const conversationID = entity.Get('ConversationID');
      return typeof conversationID === 'string' ? conversationID : null;
    } catch (error) {
      console.error('[Rating] save failed:', error);
      this.CurrentUserRating = prevRating;
      this.CurrentUserComments = prevComments;
      this.cdr.detectChanges();
      return null;
    } finally {
      this.IsSaving = false;
      this.cdr.detectChanges();
    }
  }
}
