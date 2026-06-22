import { Component, OnInit, OnDestroy, AfterViewInit, ChangeDetectorRef, inject } from '@angular/core';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { ResourceData } from '@memberjunction/core-entities';
import { RegisterClass, UUIDsEqual } from '@memberjunction/global';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import { RunView } from '@memberjunction/core';
import { GraphQLLiveKitClient, GraphQLDataProvider, RealtimeModelVoices, RealtimeVoiceOption } from '@memberjunction/graphql-dataprovider';
import { UserHoldsAuthorization, REALTIME_ADVANCED_SESSION_CONTROLS } from '@memberjunction/ng-conversations';

/** A selectable target agent for the pre-join picker. */
interface TargetAgentChoice {
  ID: string;
  Name: string;
  Description: string | null;
}

/** A user shown in the "Invite people" search/selection. */
interface InviteeChoice {
  ID: string;
  Name: string;
  Email: string | null;
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
          [RealtimeModelID]="selectedModelId"
          [RealtimeVoice]="selectedVoice"
          [CanPickModelVoice]="canPickModelVoice"
          [AvailableModels]="realtimeModels"
          [Provider]="ProviderToUse"
          [ShowAgentState]="true"
          [ShowWhiteboard]="true"
          [EnableLayoutSwitcher]="true"
          [EnablePinning]="true"
          (Connected)="NotifyLoadComplete()"
          (Disconnected)="onRoomLeft()"
          (ErrorOccurred)="NotifyLoadComplete()"
          (InvitePeopleRequested)="openInvite($event)"
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
                <option [value]="a.ID" [selected]="UUIDsEqual(a.ID, selectedTargetId)">{{ a.Name }}</option>
              }
            </select>
            @if (selectedDescription) {
              <p class="mj-lk-prejoin__desc">{{ selectedDescription }}</p>
            }
            @if (canPickModelVoice && realtimeModels.length) {
              <label class="mj-lk-prejoin__label" for="mj-lk-model">Model <span class="mj-lk-prejoin__dev">dev</span></label>
              <select id="mj-lk-model" class="mj-input mj-lk-prejoin__select" (change)="onModelChange($event)">
                <option value="">Default model</option>
                @for (m of realtimeModels; track m.ModelID) {
                  <option [value]="m.ModelID" [selected]="UUIDsEqual(m.ModelID, selectedModelId)">{{ m.ModelName }}</option>
                }
              </select>
              @if (selectedModelVoices.length) {
                <label class="mj-lk-prejoin__label" for="mj-lk-voice">Voice <span class="mj-lk-prejoin__dev">dev</span></label>
                <select id="mj-lk-voice" class="mj-input mj-lk-prejoin__select" (change)="onVoiceChange($event)">
                  <option value="">Default voice</option>
                  @for (v of selectedModelVoices; track v.ID) {
                    <option [value]="v.ID" [selected]="v.ID === selectedVoice">{{ v.Name }}</option>
                  }
                </select>
              }
            }
            <button type="button" class="mj-lk-prejoin__start" [disabled]="!selectedTargetId" (click)="startCall()">
              <i class="fa-solid fa-phone"></i> Start call
            </button>
          </div>
        </div>
      }
      @case ('landing') {
        <div class="mj-lk-prejoin">
          <div class="mj-lk-prejoin__card mj-lk-prejoin__card--wide">
            <div class="mj-lk-prejoin__icon"><i class="fa-solid fa-video"></i></div>
            <h2 class="mj-lk-prejoin__title">Meet</h2>
            <p class="mj-lk-prejoin__subtitle">Start a live room with agents and people, join one that's in progress, or review a past meeting.</p>
            <div class="mj-lk-cards">
              <button type="button" class="mj-lk-card" (click)="startNewRoom()">
                <i class="fa-solid fa-circle-plus"></i>
                <span class="mj-lk-card__t">New room</span>
                <span class="mj-lk-card__d">Pick an agent and start a fresh call.</span>
              </button>
              <button type="button" class="mj-lk-card" (click)="openExisting()">
                <i class="fa-solid fa-door-open"></i>
                <span class="mj-lk-card__t">Join existing</span>
                <span class="mj-lk-card__d">Hop into a room that's live right now.</span>
              </button>
              <button type="button" class="mj-lk-card" (click)="openHistory()">
                <i class="fa-solid fa-clock-rotate-left"></i>
                <span class="mj-lk-card__t">History</span>
                <span class="mj-lk-card__d">Read transcripts of past meetings.</span>
              </button>
            </div>
          </div>
        </div>
      }
      @case ('existing') {
        <div class="mj-lk-prejoin">
          <div class="mj-lk-prejoin__card mj-lk-prejoin__card--wide">
            <button type="button" class="mj-lk-back" (click)="backToLanding()"><i class="fa-solid fa-arrow-left"></i> Back</button>
            <h2 class="mj-lk-prejoin__title">Join a room</h2>
            @if (loadingActive) {
              <div class="mj-lk-listmsg"><i class="fa-solid fa-spinner fa-spin"></i> Finding active rooms…</div>
            } @else if (activeRooms.length) {
              <div class="mj-lk-list">
                @for (r of activeRooms; track r.RoomName) {
                  <button type="button" class="mj-lk-list__row" (click)="joinExistingRoom(r.RoomName)">
                    <span class="mj-lk-list__name"><i class="fa-solid fa-circle mj-lk-livedot"></i> {{ r.Label }}</span>
                    <span class="mj-lk-list__meta">{{ r.AgentCount }} agent{{ r.AgentCount === 1 ? '' : 's' }} · Join</span>
                  </button>
                }
              </div>
            } @else {
              <p class="mj-lk-prejoin__desc">No rooms are active right now.</p>
            }
            <label class="mj-lk-prejoin__label" for="mj-lk-room">Or join by name</label>
            <div class="mj-lk-joinrow">
              <input id="mj-lk-room" class="mj-input mj-lk-joinrow__input" type="text" placeholder="Room name…" [value]="manualRoomName"
                (input)="manualRoomName = $any($event.target).value" (keydown.enter)="joinExistingRoom(manualRoomName)" />
              <button type="button" class="mj-lk-prejoin__start mj-lk-joinrow__btn" [disabled]="!manualRoomName.trim()" (click)="joinExistingRoom(manualRoomName)">Join</button>
            </div>
          </div>
        </div>
      }
      @case ('history') {
        <div class="mj-lk-prejoin">
          <div class="mj-lk-prejoin__card mj-lk-prejoin__card--wide">
            @if (!openHistoryRoom) {
              <button type="button" class="mj-lk-back" (click)="backToLanding()"><i class="fa-solid fa-arrow-left"></i> Back</button>
              <h2 class="mj-lk-prejoin__title">Past meetings</h2>
              @if (loadingHistory) {
                <div class="mj-lk-listmsg"><i class="fa-solid fa-spinner fa-spin"></i> Loading…</div>
              } @else if (historyRooms.length) {
                <div class="mj-lk-list">
                  @for (h of historyRooms; track h.ConversationID) {
                    <button type="button" class="mj-lk-list__row" (click)="openTranscript(h)">
                      <span class="mj-lk-list__name"><i class="fa-solid fa-comments"></i> {{ h.Name }}</span>
                      <span class="mj-lk-list__meta">{{ formatTime(h.At) }}</span>
                    </button>
                  }
                </div>
              } @else {
                <p class="mj-lk-prejoin__desc">No past meetings yet.</p>
              }
            } @else {
              <button type="button" class="mj-lk-back" (click)="closeTranscript()"><i class="fa-solid fa-arrow-left"></i> All meetings</button>
              <h2 class="mj-lk-prejoin__title">{{ openHistoryRoom.Name }}</h2>
              @if (loadingTranscript) {
                <div class="mj-lk-listmsg"><i class="fa-solid fa-spinner fa-spin"></i> Loading transcript…</div>
              } @else if (historyTranscript.length) {
                <div class="mj-lk-transcript">
                  @for (line of historyTranscript; track $index) {
                    <div class="mj-lk-tline" [class.mj-lk-tline--agent]="line.Kind === 'agent'" [class.mj-lk-tline--error]="line.Kind === 'error'">
                      <span class="mj-lk-tline__who">{{ line.Speaker }}</span>
                      <span class="mj-lk-tline__msg">{{ line.Message }}</span>
                    </div>
                  }
                </div>
              } @else {
                <p class="mj-lk-prejoin__desc">No transcript was captured for this meeting.</p>
              }
            }
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

    @if (showInvite) {
      <mj-dialog [Visible]="showInvite" (Close)="showInvite = false" Title="Invite people" Size="auto" [Width]="440">
        <div class="mj-lk-invite">
          <p class="mj-lk-invite__hint">They'll get an in-app notification (and an email if Comms is set up) to join this room.</p>
          <div class="mj-lk-invite__search">
            <input class="mj-input" type="text" [value]="userSearch" placeholder="Search people by name or email…"
              (input)="userSearch = $any($event.target).value" (keydown.enter)="searchUsers()" />
            <button type="button" class="mj-lk-invite__searchbtn" [disabled]="searching" (click)="searchUsers()">
              <i class="fa-solid" [class.fa-magnifying-glass]="!searching" [class.fa-spinner]="searching" [class.fa-spin]="searching"></i>
            </button>
          </div>

          @if (selectedInvitees.length) {
            <div class="mj-lk-invite__chips">
              @for (u of selectedInvitees; track u.ID) {
                <span class="mj-lk-invite__chip">
                  {{ u.Name }}
                  <button type="button" class="mj-lk-invite__chipx" (click)="removeInvitee(u.ID)"><i class="fa-solid fa-xmark"></i></button>
                </span>
              }
            </div>
          }

          @if (userResults.length) {
            <div class="mj-lk-invite__results">
              @for (u of userResults; track u.ID) {
                <button type="button" class="mj-lk-invite__result" (click)="addInvitee(u)">
                  <span class="mj-lk-invite__rname">{{ u.Name }}</span>
                  @if (u.Email) { <span class="mj-lk-invite__remail">{{ u.Email }}</span> }
                </button>
              }
            </div>
          } @else if (searched && !searching) {
            <div class="mj-lk-invite__empty">No matching people.</div>
          }

          @if (inviteMessage) {
            <div class="mj-lk-invite__msg">{{ inviteMessage }}</div>
          }

          <div class="mj-lk-invite__actions">
            <button type="button" class="mj-lk-invite__send" [disabled]="!selectedInvitees.length || inviting" (click)="sendInvites()">
              <i class="fa-solid" [class.fa-paper-plane]="!inviting" [class.fa-spinner]="inviting" [class.fa-spin]="inviting"></i>
              Invite {{ selectedInvitees.length || '' }}
            </button>
            <button type="button" class="mj-lk-invite__cancel" (click)="showInvite = false">Cancel</button>
          </div>
        </div>
      </mj-dialog>
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
      .mj-lk-prejoin__dev {
        margin-left: 0.35rem;
        padding: 0 0.35rem;
        border-radius: 999px;
        font-size: 0.625rem;
        font-weight: 700;
        text-transform: uppercase;
        color: var(--mj-text-inverse);
        background: var(--mj-brand-primary);
        vertical-align: middle;
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
      .mj-lk-prejoin__card--wide {
        max-width: 560px;
        text-align: left;
      }
      .mj-lk-back {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        margin-bottom: 0.75rem;
        padding: 4px 8px;
        border: none;
        background: none;
        cursor: pointer;
        color: var(--mj-text-secondary);
        font-size: 0.8125rem;
      }
      .mj-lk-back:hover { color: var(--mj-text-primary); }
      .mj-lk-cards {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 0.75rem;
        margin-top: 1.25rem;
      }
      .mj-lk-card {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 6px;
        padding: 1.25rem 0.75rem;
        border: 1px solid var(--mj-border-default);
        border-radius: var(--mj-radius-lg, 12px);
        background: var(--mj-bg-surface-card);
        cursor: pointer;
        text-align: center;
      }
      .mj-lk-card:hover {
        border-color: var(--mj-brand-primary);
        background: var(--mj-bg-surface-hover, var(--mj-bg-surface-card));
      }
      .mj-lk-card > i { font-size: 1.4rem; color: var(--mj-brand-primary); }
      .mj-lk-card__t { font-weight: 600; color: var(--mj-text-primary); font-size: 0.9rem; }
      .mj-lk-card__d { color: var(--mj-text-muted); font-size: 0.78rem; line-height: 1.3; }
      .mj-lk-list {
        display: flex;
        flex-direction: column;
        gap: 6px;
        margin: 0.5rem 0 1rem;
        max-height: 320px;
        overflow-y: auto;
      }
      .mj-lk-list__row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.75rem;
        padding: 10px 12px;
        border: 1px solid var(--mj-border-default);
        border-radius: 10px;
        background: var(--mj-bg-surface-card);
        cursor: pointer;
        text-align: left;
      }
      .mj-lk-list__row:hover { border-color: var(--mj-brand-primary); background: var(--mj-bg-surface-hover, var(--mj-bg-surface-card)); }
      .mj-lk-list__name { color: var(--mj-text-primary); font-size: 0.875rem; display: inline-flex; align-items: center; gap: 8px; }
      .mj-lk-list__meta { color: var(--mj-text-muted); font-size: 0.78rem; white-space: nowrap; }
      .mj-lk-livedot { color: var(--mj-status-success); font-size: 0.5rem; }
      .mj-lk-listmsg { padding: 1rem; color: var(--mj-text-secondary); text-align: center; }
      .mj-lk-joinrow { display: flex; gap: 8px; }
      .mj-lk-joinrow__input { flex: 1; }
      .mj-lk-joinrow__btn { white-space: nowrap; }
      .mj-lk-transcript {
        display: flex;
        flex-direction: column;
        gap: 8px;
        margin-top: 0.5rem;
        max-height: 60vh;
        overflow-y: auto;
      }
      .mj-lk-tline {
        display: flex;
        flex-direction: column;
        gap: 2px;
        padding: 8px 10px;
        border-radius: 8px;
        background: var(--mj-bg-surface-card);
      }
      .mj-lk-tline--agent { background: color-mix(in srgb, var(--mj-brand-primary) 8%, var(--mj-bg-surface)); }
      .mj-lk-tline--error { background: var(--mj-status-error-bg, color-mix(in srgb, var(--mj-status-error) 8%, var(--mj-bg-surface))); }
      .mj-lk-tline__who { font-size: 0.72rem; font-weight: 600; color: var(--mj-text-secondary); }
      .mj-lk-tline__msg { font-size: 0.875rem; color: var(--mj-text-primary); }
      .mj-lk-invite {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
        min-width: 360px;
        padding: 0.25rem;
      }
      .mj-lk-invite__hint {
        margin: 0;
        color: var(--mj-text-muted);
        font-size: 0.8125rem;
      }
      .mj-lk-invite__search {
        display: flex;
        gap: 0.5rem;
      }
      .mj-lk-invite__search .mj-input {
        flex: 1;
      }
      .mj-lk-invite__searchbtn,
      .mj-lk-invite__send,
      .mj-lk-invite__cancel {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 0.4rem;
        padding: 0.5rem 0.85rem;
        border: 1px solid var(--mj-border-default);
        border-radius: var(--mj-radius-md, 8px);
        cursor: pointer;
        font-size: 0.875rem;
        background: var(--mj-bg-surface);
        color: var(--mj-text-primary);
      }
      .mj-lk-invite__send {
        border: none;
        background: var(--mj-brand-primary);
        color: var(--mj-text-inverse);
      }
      .mj-lk-invite__send:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      .mj-lk-invite__chips {
        display: flex;
        flex-wrap: wrap;
        gap: 0.4rem;
      }
      .mj-lk-invite__chip {
        display: inline-flex;
        align-items: center;
        gap: 0.35rem;
        padding: 0.2rem 0.5rem;
        border-radius: 999px;
        font-size: 0.8125rem;
        color: var(--mj-text-primary);
        background: var(--mj-bg-surface-card);
        border: 1px solid var(--mj-border-default);
      }
      .mj-lk-invite__chipx {
        border: none;
        background: transparent;
        cursor: pointer;
        color: var(--mj-text-muted);
        padding: 0;
      }
      .mj-lk-invite__results {
        max-height: 220px;
        overflow-y: auto;
        border: 1px solid var(--mj-border-default);
        border-radius: var(--mj-radius-md, 8px);
      }
      .mj-lk-invite__result {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 0.1rem;
        width: 100%;
        padding: 0.5rem 0.75rem;
        border: none;
        border-bottom: 1px solid var(--mj-border-subtle, var(--mj-border-default));
        background: transparent;
        cursor: pointer;
        text-align: left;
      }
      .mj-lk-invite__result:hover {
        background: var(--mj-bg-surface-hover);
      }
      .mj-lk-invite__rname {
        color: var(--mj-text-primary);
        font-size: 0.875rem;
      }
      .mj-lk-invite__remail {
        color: var(--mj-text-muted);
        font-size: 0.75rem;
      }
      .mj-lk-invite__empty {
        color: var(--mj-text-muted);
        font-size: 0.8125rem;
        padding: 0.25rem;
      }
      .mj-lk-invite__msg {
        color: var(--mj-text-secondary);
        font-size: 0.8125rem;
      }
      .mj-lk-invite__actions {
        display: flex;
        gap: 0.5rem;
        margin-top: 0.25rem;
      }
    `,
  ],
})
export class LiveKitRoomResource extends BaseResourceComponent implements OnInit, OnDestroy, AfterViewInit {
  /** Render phase: spinner while resolving → landing (new/existing/history) → picker/existing/history → live room. */
  public phase: 'loading' | 'landing' | 'picking' | 'existing' | 'history' | 'live' | 'error' = 'loading';

  // ── "Join existing" state ─────────────────────────────────────────────────────────
  /** Currently-active rooms (a distinct `ExternalConnectionID` with ≥1 connected agent bridge). */
  public activeRooms: { RoomName: string; Label: string; AgentCount: number }[] = [];
  /** True while loading the active-rooms list. */
  public loadingActive = false;
  /** Free-text room name to join directly (the "join by name/code" path). */
  public manualRoomName = '';

  // ── "History" (past meetings) state ───────────────────────────────────────────────
  /** Past meeting rooms (the `MJ: Conversations` of Type='Meeting Room' the bridge recorded). */
  public historyRooms: { ConversationID: string; Name: string; At: Date }[] = [];
  /** True while loading the history list. */
  public loadingHistory = false;
  /** The history room whose transcript is open (drill-in), or null for the list. */
  public openHistoryRoom: { ConversationID: string; Name: string } | null = null;
  /** The opened room's transcript lines. */
  public historyTranscript: { Kind: 'agent' | 'human' | 'error'; Speaker: string; Message: string }[] = [];
  /** True while loading a room's transcript. */
  public loadingTranscript = false;

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

  // ── Dev model/voice override (gated by the `Realtime: Advanced Session Controls` authorization) ──────
  /** Whether the current user may override the realtime model/voice (drives the dev pickers). */
  public canPickModelVoice = false;
  /** Active Realtime models + their voices (loaded once when the user can override). */
  public realtimeModels: RealtimeModelVoices[] = [];
  /** The MODEL override chosen for the FIRST agent in the pre-join picker (null = default). */
  public selectedModelId: string | null = null;
  /** The VOICE override chosen for the FIRST agent in the pre-join picker (null = default). */
  public selectedVoice: string | null = null;

  /** Voices for the model chosen in the pre-join picker. */
  public get selectedModelVoices(): RealtimeVoiceOption[] {
    return this.realtimeModels.find((m) => UUIDsEqual(m.ModelID, this.selectedModelId))?.Voices ?? [];
  }

  /** Records the pre-join MODEL choice; clears the voice so it can't outlive a model switch. */
  public onModelChange(event: Event): void {
    this.selectedModelId = (event.target as HTMLSelectElement).value || null;
    this.selectedVoice = null;
  }

  /** Records the pre-join VOICE choice. */
  public onVoiceChange(event: Event): void {
    this.selectedVoice = (event.target as HTMLSelectElement).value || null;
  }

  /** Exposed for template use — platform-safe UUID equality (SQL upper vs PG lower). */
  public UUIDsEqual = UUIDsEqual;

  /** Set when no co-agent could be resolved — shown instead of the room. */
  public resolveError: string | null = null;

  // ── "Invite people" dialog state ─────────────────────────────────────────────────
  /** Whether the invite-people dialog is open. */
  public showInvite = false;
  /** The room the invite targets (the live room name). */
  public inviteRoomName: string | null = null;
  /** Current search text in the people search box. */
  public userSearch = '';
  /** People matching the last search (minus already-selected + the current user). */
  public userResults: InviteeChoice[] = [];
  /** People chosen to invite. */
  public selectedInvitees: InviteeChoice[] = [];
  /** True while a people search is running. */
  public searching = false;
  /** True once a search has run (drives the "no matches" empty state). */
  public searched = false;
  /** True while invites are being sent. */
  public inviting = false;
  /** Result/status message under the dialog. */
  public inviteMessage: string | null = null;

  private readonly cdr = inject(ChangeDetectorRef);

  /** Description of the selected target, shown under the picker. */
  public get selectedDescription(): string | null {
    return this.agents.find((a) => UUIDsEqual(a.ID, this.selectedTargetId))?.Description ?? null;
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

    // Dev model/voice override: gate on the `Realtime: Advanced Session Controls` authorization and, when
    // held, load the active models + their voices for the pickers (here and the in-room add-agent control).
    this.canPickModelVoice = UserHoldsAuthorization(
      this.ProviderToUse?.CurrentUser, REALTIME_ADVANCED_SESSION_CONTROLS, this.ProviderToUse,
    );
    if (this.canPickModelVoice) {
      void this.loadRealtimeModels();
    }

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
    // Land on the Meet home (start new / join existing / history) rather than jumping straight into the picker.
    this.phase = 'landing';
    this.NotifyLoadComplete();
  }

  // ── Meet landing navigation ─────────────────────────────────────────────────────────

  /**
   * The room disconnected (the user clicked **Leave** or **End meeting**, or the room dropped). Return to the
   * Meet landing so they can start a new room, join another, or review history — rather than being stranded
   * on a dead room. Resets the join state so the next "New room" / "Join existing" starts clean.
   */
  public onRoomLeft(): void {
    this.roomMode = 'agent';
    this.joinRoomName = null;
    this.phase = 'landing';
    this.cdr.detectChanges();
  }

  /** Go to the "start a new room" picker. */
  public startNewRoom(): void {
    this.phase = 'picking';
  }

  /** Open the "join existing room" view and load the active rooms. */
  public openExisting(): void {
    this.phase = 'existing';
    void this.loadActiveRooms();
  }

  /** Open the "past meetings" history view and load the list. */
  public openHistory(): void {
    this.phase = 'history';
    this.openHistoryRoom = null;
    void this.loadHistory();
  }

  /** Back to the Meet home. */
  public backToLanding(): void {
    this.phase = 'landing';
  }

  /** Joins an existing room by its LiveKit room name (the bridge `ExternalConnectionID`). */
  public joinExistingRoom(roomName: string): void {
    const name = roomName.trim();
    if (!name) {
      return;
    }
    this.roomMode = 'join';
    this.joinRoomName = name;
    this.phase = 'live';
  }

  /** Loads currently-active rooms: distinct rooms that have a Connected/Connecting agent bridge. */
  private async loadActiveRooms(): Promise<void> {
    this.loadingActive = true;
    this.activeRooms = [];
    try {
      const rv = RunView.FromMetadataProvider(this.ProviderToUse);
      const res = await rv.RunView<{ ExternalConnectionID: string; Agent: string }>(
        {
          EntityName: 'MJ: AI Agent Session Bridges',
          ExtraFilter: `Status IN ('Connected','Connecting') AND ExternalConnectionID IS NOT NULL`,
          Fields: ['ExternalConnectionID', 'Agent'],
          OrderBy: '__mj_CreatedAt DESC',
          MaxRows: 500,
          ResultType: 'simple',
        },
        this.ProviderToUse.CurrentUser,
      );
      if (res.Success) {
        const byRoom = new Map<string, { count: number; agents: Set<string> }>();
        for (const r of res.Results) {
          const room = String(r['ExternalConnectionID'] ?? '');
          if (!room) {
            continue;
          }
          const entry = byRoom.get(room) ?? { count: 0, agents: new Set<string>() };
          entry.count += 1;
          if (r['Agent']) {
            entry.agents.add(String(r['Agent']));
          }
          byRoom.set(room, entry);
        }
        this.activeRooms = [...byRoom.entries()].map(([room, info]) => ({
          RoomName: room,
          Label: info.agents.size ? [...info.agents].join(', ') : room,
          AgentCount: info.count,
        }));
      }
    } finally {
      this.loadingActive = false;
      this.cdr.detectChanges();
    }
  }

  /** Loads past meetings: the `Meeting Room` conversations the bridge recorded, newest first. */
  private async loadHistory(): Promise<void> {
    this.loadingHistory = true;
    this.historyRooms = [];
    try {
      const rv = RunView.FromMetadataProvider(this.ProviderToUse);
      const res = await rv.RunView<{ ID: string; Name: string; __mj_UpdatedAt: string }>(
        {
          EntityName: 'MJ: Conversations',
          ExtraFilter: `Type='Meeting Room'`,
          Fields: ['ID', 'Name', '__mj_UpdatedAt'],
          OrderBy: '__mj_UpdatedAt DESC',
          MaxRows: 200,
          ResultType: 'simple',
        },
        this.ProviderToUse.CurrentUser,
      );
      if (res.Success) {
        this.historyRooms = res.Results.map((r) => ({
          ConversationID: String(r['ID']),
          Name: String(r['Name'] ?? 'Meeting'),
          At: new Date(String(r['__mj_UpdatedAt'] ?? '')),
        }));
      }
    } finally {
      this.loadingHistory = false;
      this.cdr.detectChanges();
    }
  }

  /** Opens a past meeting's transcript (drill-in). */
  public async openTranscript(room: { ConversationID: string; Name: string }): Promise<void> {
    this.openHistoryRoom = room;
    this.historyTranscript = [];
    this.loadingTranscript = true;
    this.cdr.detectChanges();
    try {
      const rv = RunView.FromMetadataProvider(this.ProviderToUse);
      const res = await rv.RunView<{ Role: string; Message: string; AgentID: string; Error: string }>(
        {
          EntityName: 'MJ: Conversation Details',
          ExtraFilter: `ConversationID='${room.ConversationID.replace(/'/g, "''")}'`,
          Fields: ['Role', 'Message', 'AgentID', 'Error', '__mj_CreatedAt'],
          OrderBy: '__mj_CreatedAt ASC',
          MaxRows: 5000,
          ResultType: 'simple',
        },
        this.ProviderToUse.CurrentUser,
      );
      if (res.Success) {
        this.historyTranscript = res.Results.map((d) => {
          const role = String(d['Role'] ?? 'User');
          if (role === 'Error') {
            return { Kind: 'error' as const, Speaker: 'Error', Message: String(d['Error'] ?? d['Message'] ?? '') };
          }
          if (role === 'AI') {
            const agentId = String(d['AgentID'] ?? '').toLowerCase();
            const name = AIEngineBase.Instance.Agents.find((a) => a.ID.toLowerCase() === agentId)?.Name ?? 'Agent';
            return { Kind: 'agent' as const, Speaker: name, Message: String(d['Message'] ?? '') };
          }
          return { Kind: 'human' as const, Speaker: 'Participant', Message: String(d['Message'] ?? '') };
        });
      }
    } finally {
      this.loadingTranscript = false;
      this.cdr.detectChanges();
    }
  }

  /** Back to the history list from a transcript drill-in. */
  public closeTranscript(): void {
    this.openHistoryRoom = null;
  }

  /** Formats a meeting timestamp for the history list (avoids a `date` pipe / CommonModule dependency). */
  public formatTime(d: Date): string {
    return d && !isNaN(d.getTime()) ? d.toLocaleString() : '';
  }

  /** Picker selection handler (native select; avoids a FormsModule dependency). */
  public onTargetChange(event: Event): void {
    this.selectedTargetId = (event.target as HTMLSelectElement).value || null;
  }

  /** Loads active Realtime models + their voices for the dev pickers (best-effort; empty on failure). */
  private async loadRealtimeModels(): Promise<void> {
    try {
      const client = new GraphQLLiveKitClient(this.ProviderToUse as unknown as GraphQLDataProvider);
      this.realtimeModels = await client.GetRealtimeModelVoices();
    } catch {
      this.realtimeModels = [];
    }
    this.cdr.markForCheck();
  }

  /** Commits the chosen target and switches to the live room. */
  public startCall(): void {
    if (!this.selectedTargetId) {
      return;
    }
    this.targetAgentId = this.selectedTargetId;
    this.targetAgentName = this.agents.find((a) => UUIDsEqual(a.ID, this.selectedTargetId))?.Name ?? null;
    this.phase = 'live';
  }

  /** Opens the invite-people dialog for the given room. */
  public openInvite(roomName: string): void {
    this.inviteRoomName = roomName || null;
    this.userSearch = '';
    this.userResults = [];
    this.selectedInvitees = [];
    this.searched = false;
    this.inviteMessage = null;
    this.showInvite = true;
  }

  /** Searches `MJ: Users` by name/email, excluding the current user + already-selected people. */
  public async searchUsers(): Promise<void> {
    const term = this.userSearch.trim();
    if (!term) {
      return;
    }
    this.searching = true;
    this.cdr.markForCheck();
    try {
      const p = this.ProviderToUse;
      const escaped = term.replace(/'/g, "''");
      const excluded = [p.CurrentUser?.ID, ...this.selectedInvitees.map((u) => u.ID)].filter(Boolean) as string[];
      const excludeFilter = excluded.length ? ` AND ID NOT IN (${excluded.map((id) => `'${id}'`).join(',')})` : '';
      const result = await RunView.FromMetadataProvider(p).RunView<{ ID: string; Name: string; Email: string }>({
        EntityName: 'Users',
        ExtraFilter: `IsActive = 1 AND (Name LIKE '%${escaped}%' OR Email LIKE '%${escaped}%')${excludeFilter}`,
        OrderBy: 'Name',
        Fields: ['ID', 'Name', 'Email'],
        MaxRows: 20,
        ResultType: 'simple',
      });
      this.userResults = (result.Success ? result.Results : []).map((u) => ({
        ID: u.ID,
        Name: u.Name || u.Email || '(unnamed)',
        Email: u.Email ?? null,
      }));
    } finally {
      this.searching = false;
      this.searched = true;
      this.cdr.markForCheck();
    }
  }

  /** Adds a person to the invite list (and out of the results). */
  public addInvitee(user: InviteeChoice): void {
    if (!this.selectedInvitees.some((u) => UUIDsEqual(u.ID, user.ID))) {
      this.selectedInvitees = [...this.selectedInvitees, user];
    }
    this.userResults = this.userResults.filter((u) => !UUIDsEqual(u.ID, user.ID));
  }

  /** Removes a person from the invite list. */
  public removeInvitee(userId: string): void {
    this.selectedInvitees = this.selectedInvitees.filter((u) => !UUIDsEqual(u.ID, userId));
  }

  /** Sends the invites — the server notifies each person (in-app + Comms when configured). */
  public async sendInvites(): Promise<void> {
    if (!this.selectedInvitees.length || !this.inviteRoomName || this.inviting) {
      return;
    }
    this.inviting = true;
    this.inviteMessage = null;
    this.cdr.markForCheck();
    try {
      const client = new GraphQLLiveKitClient(this.ProviderToUse as unknown as GraphQLDataProvider);
      const ok = await client.InviteUsers(this.inviteRoomName, this.selectedInvitees.map((u) => u.ID));
      if (ok) {
        this.inviteMessage = `Invited ${this.selectedInvitees.length} ${this.selectedInvitees.length === 1 ? 'person' : 'people'}.`;
        this.selectedInvitees = [];
        setTimeout(() => {
          this.showInvite = false;
          this.cdr.markForCheck();
        }, 900);
      } else {
        this.inviteMessage = 'Could not send the invites. Please try again.';
      }
    } catch (err) {
      this.inviteMessage = err instanceof Error ? err.message : String(err);
    } finally {
      this.inviting = false;
      this.cdr.markForCheck();
    }
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
