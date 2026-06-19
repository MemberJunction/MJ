import { Component, OnInit, OnDestroy, AfterViewInit, ChangeDetectorRef, inject } from '@angular/core';
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

  private readonly cdr = inject(ChangeDetectorRef);

  override ngOnInit(): void {
    super.ngOnInit();
    this.resolveAgent();
  }

  /**
   * Resolves the agent that joins the room: the explicit `ResourceRecordID` when present, otherwise the
   * default active **Realtime**-type agent (the voice co-agent). Resolves SYNCHRONOUSLY whenever possible
   * (explicit id, or the AI engine already loaded — the common case, it bootstraps at startup) so the
   * first render is already settled — an async branch-flip after the view is checked throws NG0100 under
   * the app's frequent change-detection. Only a cold engine takes the async path, which flushes the view.
   */
  private resolveAgent(): void {
    const explicit = this.Data?.ResourceRecordID ? String(this.Data.ResourceRecordID) : null;
    if (explicit) {
      this.agentId = explicit;
      this.agentResolved = true;
      return;
    }

    if (AIEngineBase.Instance.Loaded) {
      this.applyDefaultRealtimeAgent();
      return;
    }

    // Cold engine: load the cached AI metadata, then apply + flush our view so the branch flip commits
    // cleanly (avoids NG0100 from changing the @if after it was checked in a foreign CD cycle).
    void AIEngineBase.Instance.Config(false, undefined, this.ProviderToUse).then(() => {
      this.applyDefaultRealtimeAgent();
      this.cdr.detectChanges();
    });
  }

  /** Picks the first active Realtime-type agent from the cached AI metadata, or sets the no-agent message. */
  private applyDefaultRealtimeAgent(): void {
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
