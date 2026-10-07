import { Component, OnInit } from '@angular/core';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { ResourceData } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import {
  GraphQLDataProvider,
  GraphQLMeetingClient,
  type MeetingInfo,
} from '@memberjunction/graphql-dataprovider';

/**
 * Meetings Resource — multi-party scheduled and ad-hoc meeting hub in Explorer (the Meet app's "Meetings").
 *
 * Coordinates:
 * - Meeting list view (`mj-meeting-list`)
 * - Scheduling / editing form (`mj-meeting-schedule-form`)
 * - Pre-join lobby with AV checks & dial-in info (`mj-meeting-lobby`)
 * - Active multi-party call (`mj-livekit-agent-room` in join mode)
 *
 * Registered via `@RegisterClass(BaseResourceComponent, 'MeetingsResource')`.
 */
@RegisterClass(BaseResourceComponent, 'MeetingsResource')
@Component({
  standalone: false,
  selector: 'mj-meetings-resource',
  template: `
    @switch (Phase) {
      @case ('live') {
        <div class="mj-mtg-live-container">
          <mj-livekit-agent-room
            class="mj-mtg-room"
            Mode="join"
            [RoomName]="LiveRoomName"
            [Provider]="ProviderToUse"
            [StartWithMicrophone]="StartWithMic"
            [StartWithCamera]="StartWithCam"
            [ShowAgentState]="true"
            [EnableLayoutSwitcher]="true"
            [EnableLeaveControl]="true"
            (Disconnected)="OnLiveRoomLeft()"
          ></mj-livekit-agent-room>
        </div>
      }
      @case ('lobby') {
        @if (ActiveMeeting) {
          <div class="mj-mtg-resource-wrapper">
            <button type="button" class="mj-mtg-back-btn" (click)="OnLobbyCancelled()">
              <i class="fa-solid fa-arrow-left"></i> Back to Meetings
            </button>
            <mj-meeting-lobby
              [Meeting]="ActiveMeeting"
              [Provider]="ProviderToUse"
              (JoinConfirmed)="OnJoinConfirmed($event)"
              (Cancelled)="OnLobbyCancelled()"
            ></mj-meeting-lobby>
          </div>
        }
      }
      @case ('schedule') {
        <div class="mj-mtg-resource-wrapper">
          <button type="button" class="mj-mtg-back-btn" (click)="OnScheduleCancelled()">
            <i class="fa-solid fa-arrow-left"></i> Back to Meetings
          </button>
          <mj-meeting-schedule-form
            [Provider]="ProviderToUse"
            [Meeting]="EditingMeeting || undefined"
            (MeetingSaved)="OnMeetingSaved($event)"
            (Cancelled)="OnScheduleCancelled()"
          ></mj-meeting-schedule-form>
        </div>
      }
      @default {
        <div class="mj-mtg-resource-wrapper">
          <mj-meeting-list
            [Provider]="ProviderToUse"
            (JoinMeeting)="OnJoinMeetingFromList($event)"
            (ScheduleRequested)="OnScheduleRequested()"
            (EditMeetingRequested)="OnEditMeetingRequested($event)"
          ></mj-meeting-list>
        </div>
      }
    }
  `,
  styles: [
    `
      :host {
        display: block;
        height: 100%;
        overflow-y: auto;
        background: var(--mj-bg-page, #f8fafc);
      }
      .mj-mtg-resource-wrapper {
        padding: var(--mj-space-4, 16px);
      }
      .mj-mtg-live-container {
        height: 100%;
        display: flex;
        flex-direction: column;
      }
      .mj-mtg-room {
        display: block;
        height: 100%;
      }
      .mj-mtg-back-btn {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        border: none;
        background: none;
        color: var(--mj-brand-primary, #0076b6);
        font-size: 0.875rem;
        font-weight: 500;
        cursor: pointer;
        padding: 8px 12px;
        margin-bottom: 12px;
        border-radius: 6px;
      }
      .mj-mtg-back-btn:hover {
        background: rgba(0, 118, 182, 0.08);
      }
    `,
  ],
})
export class MeetingsResource extends BaseResourceComponent implements OnInit {
  public Phase: 'list' | 'schedule' | 'lobby' | 'live' = 'list';
  public ActiveMeeting: MeetingInfo | null = null;
  public EditingMeeting: MeetingInfo | null = null;
  public LiveRoomName: string = '';
  public StartWithMic: boolean = true;
  public StartWithCam: boolean = false;

  override ngOnInit(): void {
    super.ngOnInit();
    void this.initialize();
  }

  private async initialize(): Promise<void> {
    const config = this.Data?.Configuration as { MeetingID?: string } | undefined;
    const initialMeetingId = config?.MeetingID || this.Data?.ResourceRecordID;
    if (initialMeetingId) {
      try {
        const client = new GraphQLMeetingClient(this.ProviderToUse || GraphQLDataProvider.Instance);
        const meeting = await client.GetMeeting(initialMeetingId);
        if (meeting) {
          this.ActiveMeeting = meeting;
          this.Phase = 'lobby';
        }
      } catch (err) {
        console.warn('MeetingsResource: unable to resolve initial meeting deep-link', err);
      }
    }
    this.NotifyLoadComplete();
  }

  public OnScheduleRequested(): void {
    this.EditingMeeting = null;
    this.Phase = 'schedule';
  }

  public OnEditMeetingRequested(meeting: MeetingInfo): void {
    this.EditingMeeting = meeting;
    this.Phase = 'schedule';
  }

  public OnMeetingSaved(meeting: MeetingInfo): void {
    this.ActiveMeeting = meeting;
    this.EditingMeeting = null;
    this.Phase = 'lobby';
  }

  public OnScheduleCancelled(): void {
    this.EditingMeeting = null;
    this.Phase = 'list';
  }

  public OnJoinMeetingFromList(meeting: MeetingInfo): void {
    this.ActiveMeeting = meeting;
    this.Phase = 'lobby';
  }

  public OnJoinConfirmed(prefs: { startWithAudio: boolean; startWithVideo: boolean }): void {
    this.StartWithMic = prefs.startWithAudio;
    this.StartWithCam = prefs.startWithVideo;
    this.LiveRoomName = this.ActiveMeeting?.RoomName || '';
    this.Phase = 'live';
  }

  public OnLobbyCancelled(): void {
    this.ActiveMeeting = null;
    this.Phase = 'list';
  }

  public OnLiveRoomLeft(): void {
    this.LiveRoomName = '';
    this.ActiveMeeting = null;
    this.Phase = 'list';
  }

  async GetResourceDisplayName(_data: ResourceData): Promise<string> {
    return this.ActiveMeeting?.Title || 'Meetings';
  }

  async GetResourceIconClass(_data: ResourceData): Promise<string> {
    return 'fa-solid fa-calendar-users';
  }
}
