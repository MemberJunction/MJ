import { Component, OnInit, OnDestroy, AfterViewInit } from '@angular/core';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { ResourceData } from '@memberjunction/core-entities';
import { RegisterClass, UUIDsEqual } from '@memberjunction/global';
import { AIEngineBase } from '@memberjunction/ai-engine-base';

/**
 * LiveKit Room Resource — hosts the MJ-native LiveKit room (`mj-livekit-agent-room`) as an Explorer tab
 * (the **Meet** app's "Live Room"). The optional `ResourceRecordID` is the target AI Agent id; when it's
 * omitted (the common case — opened straight from the nav) we resolve a default **Realtime co-agent** so
 * the room always has an agent to bring in. Without that, the server's session factory throws
 * `no agent found for AgentID='' / AgentName=''`.
 *
 * Registered via `@RegisterClass(BaseResourceComponent, 'LiveKitRoomResource')` — surface it by adding a
 * nav item with `DriverClass = 'LiveKitRoomResource'` to an application's `DefaultNavItems`.
 */
@RegisterClass(BaseResourceComponent, 'LiveKitRoomResource')
@Component({
  standalone: false,
  selector: 'mj-livekit-room-resource',
  template: `
    @if (agentResolved) {
      <mj-livekit-agent-room
        class="mj-livekit-room-resource"
        [AgentID]="agentId"
        Mode="agent"
        [Provider]="ProviderToUse"
        [ShowAgentState]="true"
        [ShowWhiteboard]="true"
        [EnableLayoutSwitcher]="true"
        [EnablePinning]="true"
        (Connected)="NotifyLoadComplete()"
        (ErrorOccurred)="NotifyLoadComplete()"
      ></mj-livekit-agent-room>
    } @else if (resolveError) {
      <div class="mj-livekit-room-resource__message">
        <i class="fa-solid fa-circle-exclamation"></i>
        <span>{{ resolveError }}</span>
      </div>
    } @else {
      <div class="mj-livekit-room-resource__message">Preparing room…</div>
    }
  `,
  styles: [
    `
      :host {
        display: block;
        height: 100%;
      }
      .mj-livekit-room-resource {
        display: block;
        height: 100%;
      }
      .mj-livekit-room-resource__message {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.5rem;
        height: 100%;
        padding: 1.5rem;
        text-align: center;
        color: var(--mj-text-secondary);
      }
      .mj-livekit-room-resource__message i {
        color: var(--mj-status-warning);
      }
    `,
  ],
})
export class LiveKitRoomResource extends BaseResourceComponent implements OnInit, OnDestroy, AfterViewInit {
  /** The target AI Agent id (explicit record, or the resolved default Realtime co-agent). */
  public agentId: string | null = null;

  /** True once {@link resolveAgent} has an agent — gates the room render so it never connects with a null id. */
  public agentResolved = false;

  /** Set when no agent could be resolved — shown instead of the room (and instead of the cryptic server error). */
  public resolveError: string | null = null;

  override ngOnInit(): void {
    super.ngOnInit();
    void this.resolveAgent();
  }

  /**
   * Resolves the agent that joins the room: the explicit `ResourceRecordID` when present, otherwise the
   * default active **Realtime**-type agent (the voice co-agent). Gates the room render until resolved so
   * the child never starts an agent session with an empty AgentID.
   */
  private async resolveAgent(): Promise<void> {
    const explicit = this.Data?.ResourceRecordID ? String(this.Data.ResourceRecordID) : null;
    if (explicit) {
      this.agentId = explicit;
      this.agentResolved = true;
      return;
    }

    // No explicit agent (opened from the nav) — default to the first active Realtime-type agent (the
    // voice co-agent), read straight from the cached AI metadata. No query.
    await AIEngineBase.Instance.Config(false, undefined, this.ProviderToUse);
    const realtimeType = AIEngineBase.Instance.AgentTypes.find((t) => t.Name?.trim().toLowerCase() === 'realtime');
    const agent = realtimeType
      ? AIEngineBase.Instance.Agents.find((a) => a.Status === 'Active' && UUIDsEqual(a.TypeID, realtimeType.ID))
      : undefined;

    if (agent) {
      this.agentId = agent.ID;
      this.agentResolved = true;
    } else {
      this.resolveError =
        'No active Realtime agent is configured, so the Live Room has no agent to bring in. ' +
        'Create a Realtime-type AI Agent (e.g. "Realtime Co-Agent") and try again.';
      this.NotifyLoadComplete();
    }
  }

  ngAfterViewInit(): void {
    // Clear the shell loading screen even if connection is slow/unconfigured — the room (or the message
    // above) shows its own state, so the loader must not hang on direct URL navigation.
    this.NotifyLoadComplete();
  }

  override ngOnDestroy(): void {
    super.ngOnDestroy();
  }

  async GetResourceDisplayName(_data: ResourceData): Promise<string> {
    return 'Live Room';
  }

  async GetResourceIconClass(_data: ResourceData): Promise<string> {
    return 'fa-solid fa-video';
  }
}
