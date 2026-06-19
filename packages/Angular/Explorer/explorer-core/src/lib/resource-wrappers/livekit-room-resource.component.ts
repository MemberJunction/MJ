import { Component, OnInit, OnDestroy, AfterViewInit, ChangeDetectorRef, inject } from '@angular/core';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { ResourceData } from '@memberjunction/core-entities';
import { RegisterClass, UUIDsEqual } from '@memberjunction/global';
import { AIEngineBase } from '@memberjunction/ai-engine-base';

/** A selectable target agent for the pre-join picker. */
interface TargetAgentChoice {
  ID: string;
  Name: string;
  Description: string | null;
}

/**
 * LiveKit Room Resource — hosts the MJ-native LiveKit room (`mj-livekit-agent-room`) as an Explorer tab
 * (the **Meet** app's "Live Room").
 *
 * Flow: resolve the Realtime **co-agent** (voice front-end), then show a **pre-join picker** to choose
 * the **target** agent you're "calling" (the co-agent voices it via `invoke-target-agent` — without a
 * target it sits idle). "Start call" joins the room. An explicit `ResourceRecordID` skips the picker and
 * calls that agent directly.
 *
 * Registered via `@RegisterClass(BaseResourceComponent, 'LiveKitRoomResource')`.
 */
@RegisterClass(BaseResourceComponent, 'LiveKitRoomResource')
@Component({
  standalone: false,
  selector: 'mj-livekit-room-resource',
  template: `
    @switch (phase) {
      @case ('live') {
        <mj-livekit-agent-room
          class="mj-livekit-room-resource"
          [Mode]="roomMode"
          [RoomName]="joinRoomName"
          [AgentID]="agentId"
          [TargetAgentID]="targetAgentId"
          [AgentName]="targetAgentName"
          [AvailableAgents]="agents"
          [Provider]="ProviderToUse"
          [ShowAgentState]="true"
          [ShowWhiteboard]="true"
          [EnableLayoutSwitcher]="true"
          [EnablePinning]="true"
          (Connected)="NotifyLoadComplete()"
          (ErrorOccurred)="NotifyLoadComplete()"
        ></mj-livekit-agent-room>
      }
      @case ('picking') {
        <div class="mj-lk-prejoin">
          <div class="mj-lk-prejoin__card">
            <div class="mj-lk-prejoin__icon"><i class="fa-solid fa-video"></i></div>
            <h2 class="mj-lk-prejoin__title">Start a call</h2>
            <p class="mj-lk-prejoin__subtitle">
              Choose the agent you want to talk to. You can add more agents (and invite people) once
              you're in the room.
            </p>
            <label class="mj-lk-prejoin__label" for="mj-lk-target">Agent</label>
            <select id="mj-lk-target" class="mj-input mj-lk-prejoin__select" (change)="onTargetChange($event)">
              @for (a of agents; track a.ID) {
                <option [value]="a.ID" [selected]="a.ID === selectedTargetId">{{ a.Name }}</option>
              }
            </select>
            @if (selectedDescription) {
              <p class="mj-lk-prejoin__desc">{{ selectedDescription }}</p>
            }
            <button type="button" class="mj-lk-prejoin__start" [disabled]="!selectedTargetId" (click)="startCall()">
              <i class="fa-solid fa-phone"></i> Start call
            </button>
          </div>
        </div>
      }
      @case ('error') {
        <div class="mj-livekit-room-resource__message">
          <i class="fa-solid fa-circle-exclamation"></i>
          <span>{{ resolveError }}</span>
        </div>
      }
      @default {
        <div class="mj-livekit-room-resource__message">Preparing room…</div>
      }
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
      .mj-lk-prejoin {
        display: flex;
        align-items: center;
        justify-content: center;
        height: 100%;
        padding: 1.5rem;
        background: var(--mj-bg-page);
      }
      .mj-lk-prejoin__card {
        width: 100%;
        max-width: 440px;
        padding: 2rem;
        border: 1px solid var(--mj-border-default);
        border-radius: var(--mj-radius-lg, 12px);
        background: var(--mj-bg-surface);
        box-shadow: var(--mj-shadow-md, 0 4px 16px rgba(0, 0, 0, 0.12));
        text-align: center;
      }
      .mj-lk-prejoin__icon {
        font-size: 1.75rem;
        color: var(--mj-brand-primary);
        margin-bottom: 0.75rem;
      }
      .mj-lk-prejoin__title {
        margin: 0 0 0.5rem;
        color: var(--mj-text-primary);
        font-size: 1.25rem;
      }
      .mj-lk-prejoin__subtitle {
        margin: 0 0 1.5rem;
        color: var(--mj-text-secondary);
        font-size: 0.875rem;
        line-height: 1.4;
      }
      .mj-lk-prejoin__label {
        display: block;
        text-align: left;
        margin-bottom: 0.35rem;
        color: var(--mj-text-secondary);
        font-size: 0.8125rem;
        font-weight: 600;
      }
      .mj-lk-prejoin__select {
        width: 100%;
        margin-bottom: 0.75rem;
      }
      .mj-lk-prejoin__desc {
        text-align: left;
        margin: 0 0 1.25rem;
        color: var(--mj-text-muted);
        font-size: 0.8125rem;
        line-height: 1.4;
      }
      .mj-lk-prejoin__start {
        width: 100%;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 0.5rem;
        padding: 0.625rem 1rem;
        border: none;
        border-radius: var(--mj-radius-md, 8px);
        background: var(--mj-brand-primary);
        color: var(--mj-text-inverse);
        font-size: 0.9375rem;
        font-weight: 600;
        cursor: pointer;
      }
      .mj-lk-prejoin__start:hover:not(:disabled) {
        background: var(--mj-brand-primary-hover);
      }
      .mj-lk-prejoin__start:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
    `,
  ],
})
export class LiveKitRoomResource extends BaseResourceComponent implements OnInit, OnDestroy, AfterViewInit {
  /** Render phase: spinner while resolving → pre-join picker → live room (or an error message). */
  public phase: 'loading' | 'picking' | 'live' | 'error' = 'loading';

  /** `'agent'` to start/voice an agent (the default), or `'join'` when opened from an invite link. */
  public roomMode: 'agent' | 'join' = 'agent';

  /** The room to JOIN when opened via an invite link (`?room=…`); null in agent mode. */
  public joinRoomName: string | null = null;

  /** The Realtime co-agent (voice front-end) id — the resolved default Realtime-type agent. */
  public agentId: string | null = null;

  /** The TARGET agent the co-agent voices (the one being "called"); the bot is named after it. */
  public targetAgentId: string | null = null;

  /** The target agent's display name — used as the bot name + addressing word ("Sage, …"). */
  public targetAgentName: string | null = null;

  /** The agents offered in the pre-join picker (active, excluding the Realtime co-agent itself). */
  public agents: TargetAgentChoice[] = [];

  /** The currently-selected target in the picker (defaults to "Sage" when present). */
  public selectedTargetId: string | null = null;

  /** Set when no co-agent could be resolved — shown instead of the room. */
  public resolveError: string | null = null;

  private readonly cdr = inject(ChangeDetectorRef);

  /** Description of the selected target, shown under the picker. */
  public get selectedDescription(): string | null {
    return this.agents.find((a) => a.ID === this.selectedTargetId)?.Description ?? null;
  }

  override ngOnInit(): void {
    super.ngOnInit();
    this.resolve();
  }

  /**
   * Resolves the co-agent + target choices. Synchronous when the AI engine is already loaded (the common
   * case — it bootstraps at startup) so the first render is settled (avoids NG0100 from an async branch
   * flip under the app's frequent change-detection); a cold engine takes the async path and flushes.
   */
  private resolve(): void {
    // Invite link (?room=…): join that existing room directly — no agent resolution / picker needed.
    const invitedRoom = this.GetQueryParams()?.['room']?.trim();
    if (invitedRoom) {
      this.roomMode = 'join';
      this.joinRoomName = invitedRoom;
      this.phase = 'live';
      this.NotifyLoadComplete();
      return;
    }

    if (AIEngineBase.Instance.Loaded) {
      this.applyResolution();
      return;
    }
    void AIEngineBase.Instance.Config(false, undefined, this.ProviderToUse).then(() => {
      this.applyResolution();
      this.cdr.detectChanges();
    });
  }

  /** Resolves the co-agent, builds the target list, and chooses the next phase (live for an explicit record, else picker). */
  private applyResolution(): void {
    const realtimeType = AIEngineBase.Instance.AgentTypes.find((t) => t.Name?.trim().toLowerCase() === 'realtime');
    const coAgent = realtimeType
      ? AIEngineBase.Instance.Agents.find((a) => a.Status === 'Active' && UUIDsEqual(a.TypeID, realtimeType.ID))
      : undefined;

    if (!coAgent) {
      this.resolveError =
        'No active Realtime agent is configured, so the Live Room has no voice to bring in. ' +
        'Create a Realtime-type AI Agent (e.g. "Realtime Co-Agent") and try again.';
      this.phase = 'error';
      this.NotifyLoadComplete();
      return;
    }
    this.agentId = coAgent.ID;

    // Target candidates: every active agent EXCEPT the Realtime co-agents (they voice a target, not themselves).
    this.agents = AIEngineBase.Instance.Agents
      .filter((a) => a.Status === 'Active' && (!realtimeType || !UUIDsEqual(a.TypeID, realtimeType.ID)))
      .map((a) => ({ ID: a.ID, Name: a.Name ?? '(unnamed)', Description: a.Description ?? null }))
      .sort((a, b) => a.Name.localeCompare(b.Name));

    // An explicit record id (deep link to a specific agent) skips the picker and calls it directly.
    const explicit = this.Data?.ResourceRecordID ? String(this.Data.ResourceRecordID) : null;
    if (explicit) {
      this.selectedTargetId = explicit;
      this.startCall();
      return;
    }

    // Default the picker to the general assistant "Sage" when present, else the first candidate.
    this.selectedTargetId =
      this.agents.find((a) => a.Name.trim().toLowerCase() === 'sage')?.ID ?? this.agents[0]?.ID ?? null;
    this.phase = 'picking';
    this.NotifyLoadComplete();
  }

  /** Picker selection handler (native select; avoids a FormsModule dependency). */
  public onTargetChange(event: Event): void {
    this.selectedTargetId = (event.target as HTMLSelectElement).value || null;
  }

  /** Commits the chosen target and switches to the live room. */
  public startCall(): void {
    if (!this.selectedTargetId) {
      return;
    }
    this.targetAgentId = this.selectedTargetId;
    this.targetAgentName = this.agents.find((a) => a.ID === this.selectedTargetId)?.Name ?? null;
    this.phase = 'live';
  }

  ngAfterViewInit(): void {
    // Clear the shell loading screen even if resolution is slow — the picker/room/message shows its own
    // state, so the loader must not hang on direct URL navigation.
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
