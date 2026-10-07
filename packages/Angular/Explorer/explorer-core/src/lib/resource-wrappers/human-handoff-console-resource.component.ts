import { Component, OnInit } from '@angular/core';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { ResourceData } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import type { ConversationOfferAcceptedEvent } from '@memberjunction/ng-conversation-offers';

/**
 * Conversation Console: where a person receives conversations an AI agent hands over (a phone call that arrived through LiveKit SIP,
 * or a web room). This is the Explorer (L3) surface; the offers list itself is the generic `mj-conversation-offers` widget, and the
 * room is the generic `mj-livekit-agent-room` joined in `join` mode. This component only wires the two together and holds the
 * "which room am I in" state, so it contains no domain logic.
 *
 * Accepting an offer joins the person to the room under the same identity the server's handoff engine watches for; once the engine
 * sees the person in the room, the AI says goodbye and leaves. Leaving the call returns to the offers list.
 *
 * Registered via `@RegisterClass(BaseResourceComponent, 'HumanHandoffConsoleResource')`.
 */
@RegisterClass(BaseResourceComponent, 'HumanHandoffConsoleResource')
@Component({
  standalone: false,
  selector: 'mj-human-handoff-console-resource',
  template: `
    @switch (Phase) {
      @case ('live') {
        <mj-livekit-agent-room
          class="mj-hh-room"
          Mode="join"
          [RoomName]="JoinRoomName"
          [Provider]="ProviderToUse"
          [ShowAgentState]="true"
          [EnableLayoutSwitcher]="true"
          [EnableAgentManagement]="false"
          [EnableInvite]="false"
          (Disconnected)="OnRoomLeft()"
        ></mj-livekit-agent-room>
      }
      @default {
        <div class="mj-hh-offers">
          <mj-conversation-offers
            Heading="Incoming conversations"
            [Provider]="ProviderToUse"
            (OfferAccepted)="OnOfferAccepted($event)"
          ></mj-conversation-offers>
        </div>
      }
    }
  `,
  styles: [
    `
      :host {
        display: block;
        height: 100%;
        background: var(--mj-bg-page);
      }
      .mj-hh-offers {
        max-width: 48rem;
        margin: 0 auto;
        padding: var(--mj-space-6, 24px) var(--mj-space-4, 16px);
      }
      .mj-hh-room {
        display: block;
        height: 100%;
      }
    `,
  ],
})
export class HumanHandoffConsoleResource extends BaseResourceComponent implements OnInit {
  /** `offers` until a conversation is accepted, then `live` while in its room. */
  public Phase: 'offers' | 'live' = 'offers';

  /** The room the accepted conversation is in. */
  public JoinRoomName = '';

  override ngOnInit(): void {
    super.ngOnInit();
    // Nothing to resolve before first paint: the offers widget loads its own list and shows its own loading state.
    this.NotifyLoadComplete();
  }

  /** The person accepted an offer: join its room. */
  public OnOfferAccepted(event: ConversationOfferAcceptedEvent): void {
    if (!event.RoomName) {
      return;
    }
    this.JoinRoomName = event.RoomName;
    this.Phase = 'live';
  }

  /** The person left the call: back to the list. */
  public OnRoomLeft(): void {
    this.Phase = 'offers';
    this.JoinRoomName = '';
  }

  async GetResourceDisplayName(_data: ResourceData): Promise<string> {
    return 'Conversation Console';
  }

  async GetResourceIconClass(_data: ResourceData): Promise<string> {
    return 'fa-solid fa-headset';
  }
}
