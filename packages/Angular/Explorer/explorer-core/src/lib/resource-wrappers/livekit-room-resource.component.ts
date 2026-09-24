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
            <button type="button" class="mj-lk-back" (click)="backToLanding()"><i class="fa-solid fa-arrow-left"></i> Back</button>
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
  public Phase: 'loading' | 'landing' | 'picking' | 'existing' | 'history' | 'live' | 'error' = 'loading';

  /** @deprecated Use {@link Phase}. */
  public get phase(): 'loading' | 'landing' | 'picking' | 'existing' | 'history' | 'live' | 'error' {
    return this.Phase;
  }
  /** @deprecated Use {@link Phase}. */
  public set phase(value: 'loading' | 'landing' | 'picking' | 'existing' | 'history' | 'live' | 'error') {
    this.Phase = value;
  }

  // ── "Join existing" state ─────────────────────────────────────────────────────────
  /** Currently-active rooms (a distinct `ExternalConnectionID` with ≥1 connected agent bridge). */
  public ActiveRooms: { RoomName: string; Label: string; AgentCount: number }[] = [];

  /** @deprecated Use {@link ActiveRooms}. */
  public get activeRooms(): { RoomName: string; Label: string; AgentCount: number }[] {
    return this.ActiveRooms;
  }
  /** @deprecated Use {@link ActiveRooms}. */
  public set activeRooms(value: { RoomName: string; Label: string; AgentCount: number }[]) {
    this.ActiveRooms = value;
  }
  /** True while loading the active-rooms list. */
  public LoadingActive = false;

  /** @deprecated Use {@link LoadingActive}. */
  public get loadingActive() {
    return this.LoadingActive;
  }
  /** @deprecated Use {@link LoadingActive}. */
  public set loadingActive(value) {
    this.LoadingActive = value;
  }
  /** Free-text room name to join directly (the "join by name/code" path). */
  public ManualRoomName = '';

  /** @deprecated Use {@link ManualRoomName}. */
  public get manualRoomName() {
    return this.ManualRoomName;
  }
  /** @deprecated Use {@link ManualRoomName}. */
  public set manualRoomName(value) {
    this.ManualRoomName = value;
  }

  // ── "History" (past meetings) state ───────────────────────────────────────────────
  /** Past meeting rooms (the `MJ: Conversations` of Type='Meeting Room' the bridge recorded). */
  public HistoryRooms: { ConversationID: string; Name: string; At: Date }[] = [];

  /** @deprecated Use {@link HistoryRooms}. */
  public get historyRooms(): { ConversationID: string; Name: string; At: Date }[] {
    return this.HistoryRooms;
  }
  /** @deprecated Use {@link HistoryRooms}. */
  public set historyRooms(value: { ConversationID: string; Name: string; At: Date }[]) {
    this.HistoryRooms = value;
  }
  /** True while loading the history list. */
  public LoadingHistory = false;

  /** @deprecated Use {@link LoadingHistory}. */
  public get loadingHistory() {
    return this.LoadingHistory;
  }
  /** @deprecated Use {@link LoadingHistory}. */
  public set loadingHistory(value) {
    this.LoadingHistory = value;
  }
  /** The history room whose transcript is open (drill-in), or null for the list. */
  public OpenHistoryRoom: { ConversationID: string; Name: string } | null = null;

  /** @deprecated Use {@link OpenHistoryRoom}. */
  public get openHistoryRoom(): { ConversationID: string; Name: string } | null {
    return this.OpenHistoryRoom;
  }
  /** @deprecated Use {@link OpenHistoryRoom}. */
  public set openHistoryRoom(value: { ConversationID: string; Name: string } | null) {
    this.OpenHistoryRoom = value;
  }
  /** The opened room's transcript lines. */
  public HistoryTranscript: { Kind: 'agent' | 'human' | 'error'; Speaker: string; Message: string }[] = [];

  /** @deprecated Use {@link HistoryTranscript}. */
  public get historyTranscript(): { Kind: 'agent' | 'human' | 'error'; Speaker: string; Message: string }[] {
    return this.HistoryTranscript;
  }
  /** @deprecated Use {@link HistoryTranscript}. */
  public set historyTranscript(value: { Kind: 'agent' | 'human' | 'error'; Speaker: string; Message: string }[]) {
    this.HistoryTranscript = value;
  }
  /** True while loading a room's transcript. */
  public LoadingTranscript = false;

  /** @deprecated Use {@link LoadingTranscript}. */
  public get loadingTranscript() {
    return this.LoadingTranscript;
  }
  /** @deprecated Use {@link LoadingTranscript}. */
  public set loadingTranscript(value) {
    this.LoadingTranscript = value;
  }

  /** `'agent'` to start/voice an agent (the default), or `'join'` when opened from an invite link. */
  public RoomMode: 'agent' | 'join' = 'agent';

  /** @deprecated Use {@link RoomMode}. */
  public get roomMode(): 'agent' | 'join' {
    return this.RoomMode;
  }
  /** @deprecated Use {@link RoomMode}. */
  public set roomMode(value: 'agent' | 'join') {
    this.RoomMode = value;
  }

  /** The room to JOIN when opened via an invite link (`?room=…`); null in agent mode. */
  public JoinRoomName: string | null = null;

  /** @deprecated Use {@link JoinRoomName}. */
  public get joinRoomName(): string | null {
    return this.JoinRoomName;
  }
  /** @deprecated Use {@link JoinRoomName}. */
  public set joinRoomName(value: string | null) {
    this.JoinRoomName = value;
  }

  /** The Realtime co-agent (voice front-end) id — the resolved default Realtime-type agent. */
  public AgentId: string | null = null;

  /** @deprecated Use {@link AgentId}. */
  public get agentId(): string | null {
    return this.AgentId;
  }
  /** @deprecated Use {@link AgentId}. */
  public set agentId(value: string | null) {
    this.AgentId = value;
  }

  /** The TARGET agent the co-agent voices (the one being "called"); the bot is named after it. */
  public TargetAgentId: string | null = null;

  /** @deprecated Use {@link TargetAgentId}. */
  public get targetAgentId(): string | null {
    return this.TargetAgentId;
  }
  /** @deprecated Use {@link TargetAgentId}. */
  public set targetAgentId(value: string | null) {
    this.TargetAgentId = value;
  }

  /** The target agent's display name — used as the bot name + addressing word ("Sage, …"). */
  public TargetAgentName: string | null = null;

  /** @deprecated Use {@link TargetAgentName}. */
  public get targetAgentName(): string | null {
    return this.TargetAgentName;
  }
  /** @deprecated Use {@link TargetAgentName}. */
  public set targetAgentName(value: string | null) {
    this.TargetAgentName = value;
  }

  /** The agents offered in the pre-join picker (active, excluding the Realtime co-agent itself). */
  public Agents: TargetAgentChoice[] = [];

  /** @deprecated Use {@link Agents}. */
  public get agents(): TargetAgentChoice[] {
    return this.Agents;
  }
  /** @deprecated Use {@link Agents}. */
  public set agents(value: TargetAgentChoice[]) {
    this.Agents = value;
  }

  /** The currently-selected target in the picker (defaults to "Sage" when present). */
  public SelectedTargetId: string | null = null;

  /** @deprecated Use {@link SelectedTargetId}. */
  public get selectedTargetId(): string | null {
    return this.SelectedTargetId;
  }
  /** @deprecated Use {@link SelectedTargetId}. */
  public set selectedTargetId(value: string | null) {
    this.SelectedTargetId = value;
  }

  // ── Dev model/voice override (gated by the `Realtime: Advanced Session Controls` authorization) ──────
  /** Whether the current user may override the realtime model/voice (drives the dev pickers). */
  public CanPickModelVoice = false;

  /** @deprecated Use {@link CanPickModelVoice}. */
  public get canPickModelVoice() {
    return this.CanPickModelVoice;
  }
  /** @deprecated Use {@link CanPickModelVoice}. */
  public set canPickModelVoice(value) {
    this.CanPickModelVoice = value;
  }
  /** Active Realtime models + their voices (loaded once when the user can override). */
  public RealtimeModels: RealtimeModelVoices[] = [];

  /** @deprecated Use {@link RealtimeModels}. */
  public get realtimeModels(): RealtimeModelVoices[] {
    return this.RealtimeModels;
  }
  /** @deprecated Use {@link RealtimeModels}. */
  public set realtimeModels(value: RealtimeModelVoices[]) {
    this.RealtimeModels = value;
  }
  /** The MODEL override chosen for the FIRST agent in the pre-join picker (null = default). */
  public SelectedModelId: string | null = null;

  /** @deprecated Use {@link SelectedModelId}. */
  public get selectedModelId(): string | null {
    return this.SelectedModelId;
  }
  /** @deprecated Use {@link SelectedModelId}. */
  public set selectedModelId(value: string | null) {
    this.SelectedModelId = value;
  }
  /** The VOICE override chosen for the FIRST agent in the pre-join picker (null = default). */
  public SelectedVoice: string | null = null;

  /** @deprecated Use {@link SelectedVoice}. */
  public get selectedVoice(): string | null {
    return this.SelectedVoice;
  }
  /** @deprecated Use {@link SelectedVoice}. */
  public set selectedVoice(value: string | null) {
    this.SelectedVoice = value;
  }

  /** Voices for the model chosen in the pre-join picker. */
  public get SelectedModelVoices(): RealtimeVoiceOption[] {
    return this.RealtimeModels.find((m) => UUIDsEqual(m.ModelID, this.SelectedModelId))?.Voices ?? [];
  }

  /** @deprecated Use {@link SelectedModelVoices}. */
  public get selectedModelVoices(): RealtimeVoiceOption[] {
    return this.SelectedModelVoices;
  }

  /** Records the pre-join MODEL choice; clears the voice so it can't outlive a model switch. */
  public OnModelChange(event: Event): void {
    this.SelectedModelId = (event.target as HTMLSelectElement).value || null;
    this.SelectedVoice = null;
  }

  /** @deprecated Use {@link OnModelChange}. */
  public onModelChange(event: Event): void {
    return this.OnModelChange(event);
  }

  /** Records the pre-join VOICE choice. */
  public OnVoiceChange(event: Event): void {
    this.SelectedVoice = (event.target as HTMLSelectElement).value || null;
  }

  /** @deprecated Use {@link OnVoiceChange}. */
  public onVoiceChange(event: Event): void {
    return this.OnVoiceChange(event);
  }

  /** Exposed for template use — platform-safe UUID equality (SQL upper vs PG lower). */
  public UUIDsEqual = UUIDsEqual;

  /** Set when no co-agent could be resolved — shown instead of the room. */
  public ResolveError: string | null = null;

  /** @deprecated Use {@link ResolveError}. */
  public get resolveError(): string | null {
    return this.ResolveError;
  }
  /** @deprecated Use {@link ResolveError}. */
  public set resolveError(value: string | null) {
    this.ResolveError = value;
  }

  // ── "Invite people" dialog state ─────────────────────────────────────────────────
  /** Whether the invite-people dialog is open. */
  public ShowInvite = false;

  /** @deprecated Use {@link ShowInvite}. */
  public get showInvite() {
    return this.ShowInvite;
  }
  /** @deprecated Use {@link ShowInvite}. */
  public set showInvite(value) {
    this.ShowInvite = value;
  }
  /** The room the invite targets (the live room name). */
  public InviteRoomName: string | null = null;

  /** @deprecated Use {@link InviteRoomName}. */
  public get inviteRoomName(): string | null {
    return this.InviteRoomName;
  }
  /** @deprecated Use {@link InviteRoomName}. */
  public set inviteRoomName(value: string | null) {
    this.InviteRoomName = value;
  }
  /** Current search text in the people search box. */
  public UserSearch = '';

  /** @deprecated Use {@link UserSearch}. */
  public get userSearch() {
    return this.UserSearch;
  }
  /** @deprecated Use {@link UserSearch}. */
  public set userSearch(value) {
    this.UserSearch = value;
  }
  /** People matching the last search (minus already-selected + the current user). */
  public UserResults: InviteeChoice[] = [];

  /** @deprecated Use {@link UserResults}. */
  public get userResults(): InviteeChoice[] {
    return this.UserResults;
  }
  /** @deprecated Use {@link UserResults}. */
  public set userResults(value: InviteeChoice[]) {
    this.UserResults = value;
  }
  /** People chosen to invite. */
  public SelectedInvitees: InviteeChoice[] = [];

  /** @deprecated Use {@link SelectedInvitees}. */
  public get selectedInvitees(): InviteeChoice[] {
    return this.SelectedInvitees;
  }
  /** @deprecated Use {@link SelectedInvitees}. */
  public set selectedInvitees(value: InviteeChoice[]) {
    this.SelectedInvitees = value;
  }
  /** True while a people search is running. */
  public Searching = false;

  /** @deprecated Use {@link Searching}. */
  public get searching() {
    return this.Searching;
  }
  /** @deprecated Use {@link Searching}. */
  public set searching(value) {
    this.Searching = value;
  }
  /** True once a search has run (drives the "no matches" empty state). */
  public Searched = false;

  /** @deprecated Use {@link Searched}. */
  public get searched() {
    return this.Searched;
  }
  /** @deprecated Use {@link Searched}. */
  public set searched(value) {
    this.Searched = value;
  }
  /** True while invites are being sent. */
  public Inviting = false;

  /** @deprecated Use {@link Inviting}. */
  public get inviting() {
    return this.Inviting;
  }
  /** @deprecated Use {@link Inviting}. */
  public set inviting(value) {
    this.Inviting = value;
  }
  /** Result/status message under the dialog. */
  public InviteMessage: string | null = null;

  /** @deprecated Use {@link InviteMessage}. */
  public get inviteMessage(): string | null {
    return this.InviteMessage;
  }
  /** @deprecated Use {@link InviteMessage}. */
  public set inviteMessage(value: string | null) {
    this.InviteMessage = value;
  }

  private readonly cdr = inject(ChangeDetectorRef);

  /** Description of the selected target, shown under the picker. */
  public get SelectedDescription(): string | null {
    return this.Agents.find((a) => UUIDsEqual(a.ID, this.SelectedTargetId))?.Description ?? null;
  }

  /** @deprecated Use {@link SelectedDescription}. */
  public get selectedDescription(): string | null {
    return this.SelectedDescription;
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
      this.RoomMode = 'join';
      this.JoinRoomName = invitedRoom;
      this.Phase = 'live';
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
      this.ResolveError =
        'No active Realtime agent is configured, so the Live Room has no voice to bring in. ' +
        'Create a Realtime-type AI Agent (e.g. "Realtime Co-Agent") and try again.';
      this.Phase = 'error';
      this.NotifyLoadComplete();
      return;
    }
    this.AgentId = coAgent.ID;

    // Dev model/voice override: gate on the `Realtime: Advanced Session Controls` authorization and, when
    // held, load the active models + their voices for the pickers (here and the in-room add-agent control).
    this.CanPickModelVoice = UserHoldsAuthorization(
      this.ProviderToUse?.CurrentUser, REALTIME_ADVANCED_SESSION_CONTROLS, this.ProviderToUse,
    );
    if (this.CanPickModelVoice) {
      void this.loadRealtimeModels();
    }

    // Target candidates: every active agent EXCEPT the Realtime co-agents (they voice a target, not themselves).
    this.Agents = AIEngineBase.Instance.Agents
      .filter((a) => a.Status === 'Active' && (!realtimeType || !UUIDsEqual(a.TypeID, realtimeType.ID)))
      .map((a) => ({ ID: a.ID, Name: a.Name ?? '(unnamed)', Description: a.Description ?? null }))
      .sort((a, b) => a.Name.localeCompare(b.Name));

    // An explicit record id (deep link to a specific agent) skips the picker and calls it directly.
    const explicit = this.Data?.ResourceRecordID ? String(this.Data.ResourceRecordID) : null;
    if (explicit) {
      this.SelectedTargetId = explicit;
      this.StartCall();
      return;
    }

    // Default the picker to the general assistant "Sage" when present, else the first candidate.
    this.SelectedTargetId =
      this.Agents.find((a) => a.Name.trim().toLowerCase() === 'sage')?.ID ?? this.Agents[0]?.ID ?? null;
    // Land on the Meet home (start new / join existing / history) rather than jumping straight into the picker.
    this.Phase = 'landing';
    this.NotifyLoadComplete();
  }

  // ── Meet landing navigation ─────────────────────────────────────────────────────────

  /**
   * The room disconnected (the user clicked **Leave** or **End meeting**, or the room dropped). Return to the
   * Meet landing so they can start a new room, join another, or review history — rather than being stranded
   * on a dead room. Resets the join state so the next "New room" / "Join existing" starts clean.
   */
  public OnRoomLeft(): void {
    this.RoomMode = 'agent';
    this.JoinRoomName = null;
    this.Phase = 'landing';
    this.cdr.detectChanges();
  }

  /** @deprecated Use {@link OnRoomLeft}. */
  public onRoomLeft(): void {
    return this.OnRoomLeft();
  }

  /** Go to the "start a new room" picker. */
  public StartNewRoom(): void {
    this.Phase = 'picking';
  }

  /** @deprecated Use {@link StartNewRoom}. */
  public startNewRoom(): void {
    return this.StartNewRoom();
  }

  /** Open the "join existing room" view and load the active rooms. */
  public OpenExisting(): void {
    this.Phase = 'existing';
    void this.loadActiveRooms();
  }

  /** @deprecated Use {@link OpenExisting}. */
  public openExisting(): void {
    return this.OpenExisting();
  }

  /** Open the "past meetings" history view and load the list. */
  public OpenHistory(): void {
    this.Phase = 'history';
    this.OpenHistoryRoom = null;
    void this.loadHistory();
  }

  /** @deprecated Use {@link OpenHistory}. */
  public openHistory(): void {
    return this.OpenHistory();
  }

  /** Back to the Meet home. */
  public BackToLanding(): void {
    this.Phase = 'landing';
  }

  /** @deprecated Use {@link BackToLanding}. */
  public backToLanding(): void {
    return this.BackToLanding();
  }

  /** Joins an existing room by its LiveKit room name (the bridge `ExternalConnectionID`). */
  public JoinExistingRoom(roomName: string): void {
    const name = roomName.trim();
    if (!name) {
      return;
    }
    this.RoomMode = 'join';
    this.JoinRoomName = name;
    this.Phase = 'live';
  }

  /** @deprecated Use {@link JoinExistingRoom}. */
  public joinExistingRoom(roomName: string): void {
    return this.JoinExistingRoom(roomName);
  }

  /** Loads currently-active rooms: distinct rooms that have a Connected/Connecting agent bridge. */
  private async loadActiveRooms(): Promise<void> {
    this.LoadingActive = true;
    this.ActiveRooms = [];
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
        this.ActiveRooms = [...byRoom.entries()].map(([room, info]) => ({
          RoomName: room,
          Label: info.agents.size ? [...info.agents].join(', ') : room,
          AgentCount: info.count,
        }));
      }
    } finally {
      this.LoadingActive = false;
      this.cdr.detectChanges();
    }
  }

  /** Loads past meetings: the `Meeting Room` conversations the bridge recorded, newest first. */
  private async loadHistory(): Promise<void> {
    this.LoadingHistory = true;
    this.HistoryRooms = [];
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
        this.HistoryRooms = res.Results.map((r) => ({
          ConversationID: String(r['ID']),
          Name: String(r['Name'] ?? 'Meeting'),
          At: new Date(String(r['__mj_UpdatedAt'] ?? '')),
        }));
      }
    } finally {
      this.LoadingHistory = false;
      this.cdr.detectChanges();
    }
  }

  /** Opens a past meeting's transcript (drill-in). */
  public async OpenTranscript(room: { ConversationID: string; Name: string }): Promise<void> {
    this.OpenHistoryRoom = room;
    this.HistoryTranscript = [];
    this.LoadingTranscript = true;
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
        this.HistoryTranscript = res.Results.map((d) => {
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
      this.LoadingTranscript = false;
      this.cdr.detectChanges();
    }
  }

  /** @deprecated Use {@link OpenTranscript}. */
  public async openTranscript(room: { ConversationID: string; Name: string }): Promise<void> {
    return this.OpenTranscript(room);
  }

  /** Back to the history list from a transcript drill-in. */
  public CloseTranscript(): void {
    this.OpenHistoryRoom = null;
  }

  /** @deprecated Use {@link CloseTranscript}. */
  public closeTranscript(): void {
    return this.CloseTranscript();
  }

  /** Formats a meeting timestamp for the history list (avoids a `date` pipe / CommonModule dependency). */
  public FormatTime(d: Date): string {
    return d && !isNaN(d.getTime()) ? d.toLocaleString() : '';
  }

  /** @deprecated Use {@link FormatTime}. */
  public formatTime(d: Date): string {
    return this.FormatTime(d);
  }

  /** Picker selection handler (native select; avoids a FormsModule dependency). */
  public OnTargetChange(event: Event): void {
    this.SelectedTargetId = (event.target as HTMLSelectElement).value || null;
  }

  /** @deprecated Use {@link OnTargetChange}. */
  public onTargetChange(event: Event): void {
    return this.OnTargetChange(event);
  }

  /** Loads active Realtime models + their voices for the dev pickers (best-effort; empty on failure). */
  private async loadRealtimeModels(): Promise<void> {
    try {
      const client = new GraphQLLiveKitClient(this.ProviderToUse as unknown as GraphQLDataProvider);
      this.RealtimeModels = await client.GetRealtimeModelVoices();
    } catch {
      this.RealtimeModels = [];
    }
    this.cdr.markForCheck();
  }

  /** Commits the chosen target and switches to the live room. */
  public StartCall(): void {
    if (!this.SelectedTargetId) {
      return;
    }
    this.TargetAgentId = this.SelectedTargetId;
    this.TargetAgentName = this.Agents.find((a) => UUIDsEqual(a.ID, this.SelectedTargetId))?.Name ?? null;
    this.Phase = 'live';
  }

  /** @deprecated Use {@link StartCall}. */
  public startCall(): void {
    return this.StartCall();
  }

  /** Opens the invite-people dialog for the given room. */
  public OpenInvite(roomName: string): void {
    this.InviteRoomName = roomName || null;
    this.UserSearch = '';
    this.UserResults = [];
    this.SelectedInvitees = [];
    this.Searched = false;
    this.InviteMessage = null;
    this.ShowInvite = true;
  }

  /** @deprecated Use {@link OpenInvite}. */
  public openInvite(roomName: string): void {
    return this.OpenInvite(roomName);
  }

  /** Searches `MJ: Users` by name/email, excluding the current user + already-selected people. */
  public async SearchUsers(): Promise<void> {
    const term = this.UserSearch.trim();
    if (!term) {
      return;
    }
    this.Searching = true;
    this.cdr.markForCheck();
    try {
      const p = this.ProviderToUse;
      const escaped = term.replace(/'/g, "''");
      const excluded = [p.CurrentUser?.ID, ...this.SelectedInvitees.map((u) => u.ID)].filter(Boolean) as string[];
      const excludeFilter = excluded.length ? ` AND ID NOT IN (${excluded.map((id) => `'${id}'`).join(',')})` : '';
      const result = await RunView.FromMetadataProvider(p).RunView<{ ID: string; Name: string; Email: string }>({
        EntityName: 'Users',
        ExtraFilter: `IsActive = 1 AND (Name LIKE '%${escaped}%' OR Email LIKE '%${escaped}%')${excludeFilter}`,
        OrderBy: 'Name',
        Fields: ['ID', 'Name', 'Email'],
        MaxRows: 20,
        ResultType: 'simple',
      });
      this.UserResults = (result.Success ? result.Results : []).map((u) => ({
        ID: u.ID,
        Name: u.Name || u.Email || '(unnamed)',
        Email: u.Email ?? null,
      }));
    } finally {
      this.Searching = false;
      this.Searched = true;
      this.cdr.markForCheck();
    }
  }

  /** @deprecated Use {@link SearchUsers}. */
  public async searchUsers(): Promise<void> {
    return this.SearchUsers();
  }

  /** Adds a person to the invite list (and out of the results). */
  public AddInvitee(user: InviteeChoice): void {
    if (!this.SelectedInvitees.some((u) => UUIDsEqual(u.ID, user.ID))) {
      this.SelectedInvitees = [...this.SelectedInvitees, user];
    }
    this.UserResults = this.UserResults.filter((u) => !UUIDsEqual(u.ID, user.ID));
  }

  /** @deprecated Use {@link AddInvitee}. */
  public addInvitee(user: InviteeChoice): void {
    return this.AddInvitee(user);
  }

  /** Removes a person from the invite list. */
  public RemoveInvitee(userId: string): void {
    this.SelectedInvitees = this.SelectedInvitees.filter((u) => !UUIDsEqual(u.ID, userId));
  }

  /** @deprecated Use {@link RemoveInvitee}. */
  public removeInvitee(userId: string): void {
    return this.RemoveInvitee(userId);
  }

  /** Sends the invites — the server notifies each person (in-app + Comms when configured). */
  public async SendInvites(): Promise<void> {
    if (!this.SelectedInvitees.length || !this.InviteRoomName || this.Inviting) {
      return;
    }
    this.Inviting = true;
    this.InviteMessage = null;
    this.cdr.markForCheck();
    try {
      const client = new GraphQLLiveKitClient(this.ProviderToUse as unknown as GraphQLDataProvider);
      const ok = await client.InviteUsers(this.InviteRoomName, this.SelectedInvitees.map((u) => u.ID));
      if (ok) {
        this.InviteMessage = `Invited ${this.SelectedInvitees.length} ${this.SelectedInvitees.length === 1 ? 'person' : 'people'}.`;
        this.SelectedInvitees = [];
        setTimeout(() => {
          this.ShowInvite = false;
          this.cdr.markForCheck();
        }, 900);
      } else {
        this.InviteMessage = 'Could not send the invites. Please try again.';
      }
    } catch (err) {
      this.InviteMessage = err instanceof Error ? err.message : String(err);
    } finally {
      this.Inviting = false;
      this.cdr.markForCheck();
    }
  }

  /** @deprecated Use {@link SendInvites}. */
  public async sendInvites(): Promise<void> {
    return this.SendInvites();
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
