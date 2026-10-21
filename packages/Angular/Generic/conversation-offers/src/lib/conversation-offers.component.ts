import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, OnDestroy, OnInit, Output, Input, inject } from '@angular/core';
import { Subscription } from 'rxjs';
import { LogError } from '@memberjunction/core';
import { GraphQLDataProvider, GraphQLHandoffClient, type HandoffOfferInfo } from '@memberjunction/graphql-dataprovider';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';
import { MJButtonDirective, MJEmptyStateComponent } from '@memberjunction/ng-ui-components';
import { ApplyOfferChange, BuildOfferRows, HasActionableOffer, WithOfferStatus, type ConversationOfferRow } from './offer-rows';

/** Raised when the person accepts an offer; the host joins the named room. */
export interface ConversationOfferAcceptedEvent {
  OfferID: string;
  RoomName: string;
  Offer: HandoffOfferInfo;
}

/** How often the countdowns redraw while an offer is waiting. */
export const OFFER_TICK_MS = 1000;

/** How many times in a row the live stream is re-opened after it ends without delivering anything (a token refresh ends it once). */
export const MAX_RESUBSCRIBES = 5;

/**
 * `mj-conversation-offers`: the person-at-a-console side of a room handoff. Lists the conversations an AI agent is offering the
 * signed-in user (a phone call that arrived through SIP, or a web room), with a countdown and Accept / Decline, kept live over the
 * handoff subscription.
 *
 * It is a generic (L2) widget: it never navigates and never joins a room. Accepting raises {@link OfferAccepted} with the room name,
 * and the host (an Explorer surface) decides how to join. Every call is scoped to the signed-in user on the server, so the list holds
 * only their own offers.
 *
 * Public members are PascalCase (MJ convention); private members are camelCase.
 */
@Component({
  selector: 'mj-conversation-offers',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MJButtonDirective, MJEmptyStateComponent, SharedGenericModule],
  template: `
    <section class="mj-co" aria-live="polite">
      <header class="mj-co__head">
        <h3 class="mj-co__title">{{ Heading }}</h3>
        @if (PendingCount > 0) {
          <span class="mj-co__count" [attr.aria-label]="PendingCount + ' waiting'">{{ PendingCount }}</span>
        }
      </header>

      @if (ErrorMessage) {
        <div class="mj-co__error" role="alert">{{ ErrorMessage }}</div>
      }

      @if (IsLoading) {
        <mj-loading Text="Looking for conversations..." Size="small"></mj-loading>
      } @else if (Rows.length === 0) {
        <mj-empty-state
          Icon="fa-solid fa-headset"
          Title="Nothing waiting"
          Message="When an agent needs a person, the conversation shows up here."
          Size="compact"
        ></mj-empty-state>
      } @else {
        <ul class="mj-co__list">
          @for (row of Rows; track row.Offer.OfferID) {
            <li class="mj-co__row" [class.mj-co__row--pending]="row.IsActionable">
              <div class="mj-co__main">
                <div class="mj-co__who">
                  <i class="fa-solid fa-phone-volume" aria-hidden="true"></i>
                  <span class="mj-co__caller">{{ row.Offer.CallerLabel }}</span>
                  <span class="mj-co__mode">{{ row.Offer.Mode === 'blind' ? 'Direct transfer' : 'Introduced by ' + row.Offer.AgentName }}</span>
                </div>
                @if (row.Offer.Summary) {
                  <p class="mj-co__summary">{{ row.Offer.Summary }}</p>
                }
              </div>
              <div class="mj-co__side">
                @if (row.IsActionable) {
                  <span class="mj-co__countdown" [attr.aria-label]="row.SecondsRemaining + ' seconds left'">{{ row.CountdownLabel }}</span>
                  <div class="mj-co__actions">
                    <button mjButton variant="primary" size="sm" type="button" [disabled]="BusyOfferID !== null" (click)="Accept(row)">
                      <i class="fa-solid fa-check" aria-hidden="true"></i> Accept
                    </button>
                    <button mjButton variant="outline" size="sm" type="button" [disabled]="BusyOfferID !== null" (click)="Decline(row)">
                      <i class="fa-solid fa-xmark" aria-hidden="true"></i> Decline
                    </button>
                  </div>
                } @else {
                  <span class="mj-co__status">{{ row.StatusLabel }}</span>
                }
              </div>
            </li>
          }
        </ul>
      }
    </section>
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .mj-co {
        display: flex;
        flex-direction: column;
        gap: var(--mj-space-3, 12px);
        color: var(--mj-text-primary);
      }
      .mj-co__head {
        display: flex;
        align-items: center;
        gap: var(--mj-space-2, 8px);
      }
      .mj-co__title {
        margin: 0;
        font-size: var(--mj-text-lg, 1.125rem);
        font-weight: 600;
        color: var(--mj-text-primary);
      }
      .mj-co__count {
        min-width: 1.5rem;
        padding: 0 var(--mj-space-2, 8px);
        border-radius: 999px;
        text-align: center;
        font-size: var(--mj-text-sm, 0.875rem);
        font-weight: 600;
        color: var(--mj-text-inverse);
        background: var(--mj-brand-primary);
      }
      .mj-co__error {
        padding: var(--mj-space-2, 8px) var(--mj-space-3, 12px);
        border: 1px solid var(--mj-status-error-border);
        border-radius: var(--mj-radius-md, 6px);
        color: var(--mj-status-error-text);
        background: var(--mj-status-error-bg);
      }
      .mj-co__list {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: var(--mj-space-2, 8px);
      }
      .mj-co__row {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: var(--mj-space-3, 12px);
        padding: var(--mj-space-3, 12px);
        border: 1px solid var(--mj-border-default);
        border-radius: var(--mj-radius-md, 6px);
        background: var(--mj-bg-surface);
      }
      .mj-co__row--pending {
        border-color: var(--mj-brand-primary);
        background: color-mix(in srgb, var(--mj-brand-primary) 6%, var(--mj-bg-surface));
      }
      .mj-co__main {
        flex: 1 1 14rem;
        min-width: 0;
      }
      .mj-co__who {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--mj-space-2, 8px);
      }
      .mj-co__caller {
        font-weight: 600;
      }
      .mj-co__mode {
        font-size: var(--mj-text-sm, 0.875rem);
        color: var(--mj-text-muted);
      }
      .mj-co__summary {
        margin: var(--mj-space-1, 4px) 0 0;
        font-size: var(--mj-text-sm, 0.875rem);
        color: var(--mj-text-secondary);
      }
      .mj-co__side {
        display: flex;
        align-items: center;
        gap: var(--mj-space-3, 12px);
      }
      .mj-co__countdown {
        font-variant-numeric: tabular-nums;
        font-weight: 600;
        color: var(--mj-status-warning-text);
      }
      .mj-co__actions {
        display: flex;
        gap: var(--mj-space-2, 8px);
      }
      .mj-co__status {
        font-size: var(--mj-text-sm, 0.875rem);
        color: var(--mj-text-muted);
      }
    `,
  ],
})
export class MJConversationOffersComponent extends BaseAngularComponent implements OnInit, OnDestroy {
  private readonly cdr = inject(ChangeDetectorRef);

  /** Heading shown above the list. */
  @Input() public Heading = 'Incoming conversations';

  /** Raised when an offer was accepted; the host joins `RoomName`. */
  @Output() public OfferAccepted = new EventEmitter<ConversationOfferAcceptedEvent>();

  /** The rows on screen. */
  public Rows: ConversationOfferRow[] = [];
  /** True until the first list has arrived. */
  public IsLoading = true;
  /** The last problem worth telling the person about; cleared on the next successful action. */
  public ErrorMessage: string | null = null;
  /** The offer an accept/decline is in flight for; buttons are disabled meanwhile so two cannot race. */
  public BusyOfferID: string | null = null;
  /** How many offers can still be answered. */
  public PendingCount = 0;

  private offers: HandoffOfferInfo[] = [];
  private client: GraphQLHandoffClient | null = null;
  private subscription: Subscription | null = null;
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private resubscribes = 0;
  private destroyed = false;

  /** A pre-built transport client, for a host that already holds one (and for tests). By default one is built over the component's provider. */
  @Input() public Client: GraphQLHandoffClient | null = null;

  private createClient(): GraphQLHandoffClient {
    return this.Client ?? new GraphQLHandoffClient(this.ProviderToUse as unknown as GraphQLDataProvider);
  }

  public async ngOnInit(): Promise<void> {
    this.client = this.createClient();
    this.openLiveStream();
    await this.Refresh();
  }

  public ngOnDestroy(): void {
    this.destroyed = true;
    this.subscription?.unsubscribe();
    this.subscription = null;
    this.stopTicking();
  }

  /** Reloads the list from the server. */
  public async Refresh(): Promise<void> {
    if (!this.client) {
      return;
    }
    this.offers = await this.client.GetMyOffers();
    this.IsLoading = false;
    this.redraw();
  }

  /** Accepts the offer; on success raises {@link OfferAccepted}. A refusal (gone, expired, not yours) is shown, and the list is reloaded. */
  public async Accept(row: ConversationOfferRow): Promise<void> {
    if (!this.client || this.BusyOfferID !== null) {
      return;
    }
    this.BusyOfferID = row.Offer.OfferID;
    this.ErrorMessage = null;
    this.cdr.markForCheck();
    try {
      const result = await this.client.AcceptOffer(row.Offer.OfferID);
      if (!result.Success) {
        this.ErrorMessage = result.ErrorMessage || 'This conversation can no longer be accepted.';
        await this.Refresh();
        return;
      }
      this.offers = WithOfferStatus(this.offers, row.Offer.OfferID, 'Accepted');
      this.OfferAccepted.emit({ OfferID: row.Offer.OfferID, RoomName: result.RoomName, Offer: result.Offer ?? row.Offer });
    } finally {
      this.BusyOfferID = null;
      this.redraw();
    }
  }

  /** Declines the offer so the agent can fall back. */
  public async Decline(row: ConversationOfferRow): Promise<void> {
    if (!this.client || this.BusyOfferID !== null) {
      return;
    }
    this.BusyOfferID = row.Offer.OfferID;
    this.ErrorMessage = null;
    this.cdr.markForCheck();
    try {
      const result = await this.client.DeclineOffer(row.Offer.OfferID);
      if (!result.Success) {
        this.ErrorMessage = result.ErrorMessage || 'This conversation can no longer be declined.';
        await this.Refresh();
        return;
      }
      this.offers = WithOfferStatus(this.offers, row.Offer.OfferID, 'Declined');
    } finally {
      this.BusyOfferID = null;
      this.redraw();
    }
  }

  /** Opens (or re-opens) the live change stream. The stream ends when the session token is refreshed, so it is re-opened a few times. */
  private openLiveStream(): void {
    if (!this.client || this.destroyed) {
      return;
    }
    this.subscription?.unsubscribe();
    this.subscription = this.client.ObserveOfferChanges().subscribe({
      next: (change) => {
        this.resubscribes = 0;
        this.offers = ApplyOfferChange(this.offers, change);
        this.IsLoading = false;
        this.redraw();
      },
      error: (error: unknown) => LogError(`mj-conversation-offers: the live offer stream failed: ${error instanceof Error ? error.message : String(error)}`),
      complete: () => this.reopenAfterCompletion(),
    });
  }

  private reopenAfterCompletion(): void {
    if (this.destroyed || this.resubscribes >= MAX_RESUBSCRIBES) {
      return;
    }
    this.resubscribes += 1;
    this.openLiveStream();
    void this.Refresh();
  }

  /** Recomputes the rows from the current offers and time, and starts or stops the countdown tick to match. */
  private redraw(): void {
    const nowMs = Date.now();
    this.Rows = BuildOfferRows(this.offers, nowMs);
    this.PendingCount = this.Rows.filter((row) => row.IsActionable).length;
    if (HasActionableOffer(this.offers, nowMs)) {
      this.startTicking();
    } else {
      this.stopTicking();
    }
    this.cdr.markForCheck();
  }

  private startTicking(): void {
    if (this.tickTimer !== null || this.destroyed) {
      return;
    }
    this.tickTimer = setInterval(() => this.redraw(), OFFER_TICK_MS);
  }

  private stopTicking(): void {
    if (this.tickTimer !== null) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
  }
}
