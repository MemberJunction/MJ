import '@angular/compiler';
import { describe, expect, it, vi } from 'vitest';
import { ChangeDetectorRef, createEnvironmentInjector, EnvironmentInjector, runInInjectionContext } from '@angular/core';
import type { MeetingInfo, MeetingParticipantInput } from '@memberjunction/graphql-dataprovider';
import { MJMeetingListComponent } from '../lib/meetings/meeting-list.component';
import { MJMeetingScheduleFormComponent } from '../lib/meetings/meeting-schedule-form.component';
import { MJMeetingParticipantPickerComponent } from '../lib/meetings/meeting-participant-picker.component';
import { MJMeetingLobbyComponent } from '../lib/meetings/meeting-lobby.component';

const cdrMock: ChangeDetectorRef = {
  markForCheck: vi.fn(),
  detach: vi.fn(),
  detectChanges: vi.fn(),
  checkNoChanges: vi.fn(),
  reattach: vi.fn(),
};

const injector = createEnvironmentInjector([
  { provide: ChangeDetectorRef, useValue: cdrMock },
], null as unknown as EnvironmentInjector);

function instantiate<T>(fn: () => T): T {
  return runInInjectionContext(injector, fn);
}

const SAMPLE_MEETING: MeetingInfo = {
  ID: 'mtg-1',
  Title: 'Sprint Planning',
  Description: 'Bi-weekly sprint planning',
  HostUserID: 'u-1',
  HostUserName: 'Alice Host',
  RoomName: 'mj-mtg-sample-1',
  Status: 'Scheduled',
  ScheduledStartAt: '2026-10-04T10:00:00.000Z',
  ScheduledEndAt: '2026-10-04T10:30:00.000Z',
  AllowPhoneDialIn: true,
  DialInPhoneNumber: '+15551234567',
  DialInCode: '123456',
  RecordingPolicy: 'Automatic',
  CreatedAt: '2026-10-03T10:00:00.000Z',
  UpdatedAt: '2026-10-03T10:00:00.000Z',
  Participants: [
    { ID: 'p-1', MeetingID: 'mtg-1', Role: 'Host', InviteStatus: 'Accepted', UserName: 'Alice Host' },
    { ID: 'p-2', MeetingID: 'mtg-1', Role: 'Attendee', InviteStatus: 'Invited', UserName: 'Bob Guest' },
  ],
};

describe('MJMeetingListComponent', () => {
  it('filters meetings by status and search query', () => {
    const comp = instantiate(() => new MJMeetingListComponent());
    Object.assign(comp, { cdr: cdrMock });

    comp.Meetings = [
      SAMPLE_MEETING,
      { ...SAMPLE_MEETING, ID: 'mtg-2', Title: 'Daily Standup', Status: 'Live' },
      { ...SAMPLE_MEETING, ID: 'mtg-3', Title: 'Old Retro', Status: 'Ended' },
    ];

    comp.SetFilter('live');
    expect(comp.FilteredMeetings.length).toBe(1);
    expect(comp.FilteredMeetings[0].ID).toBe('mtg-2');

    comp.SetFilter('scheduled');
    expect(comp.FilteredMeetings.length).toBe(1);
    expect(comp.FilteredMeetings[0].ID).toBe('mtg-1');

    comp.SetFilter('past');
    expect(comp.FilteredMeetings.length).toBe(1);
    expect(comp.FilteredMeetings[0].ID).toBe('mtg-3');

    comp.SetFilter('all');
    comp.SearchQuery = 'Daily';
    comp.OnSearchChange();
    expect(comp.FilteredMeetings.length).toBe(1);
    expect(comp.FilteredMeetings[0].Title).toBe('Daily Standup');
  });

  it('emits JoinMeeting and ScheduleRequested events', () => {
    const comp = instantiate(() => new MJMeetingListComponent());
    const joinSpy = vi.fn();
    const schedSpy = vi.fn();
    comp.JoinMeeting.subscribe(joinSpy);
    comp.ScheduleRequested.subscribe(schedSpy);

    comp.OnJoin(SAMPLE_MEETING);
    expect(joinSpy).toHaveBeenCalledWith(SAMPLE_MEETING);

    comp.OnSchedule();
    expect(schedSpy).toHaveBeenCalled();
  });
});

describe('MJMeetingScheduleFormComponent', () => {
  it('populates fields when an existing meeting is provided for edit', () => {
    const comp = instantiate(() => new MJMeetingScheduleFormComponent());
    Object.assign(comp, { cdr: cdrMock });
    comp.Meeting = SAMPLE_MEETING;
    comp.ngOnInit();

    expect(comp.Title).toBe('Sprint Planning');
    expect(comp.Description).toBe('Bi-weekly sprint planning');
    expect(comp.AllowPhoneDialIn).toBe(true);
    expect(comp.RecordingPolicy).toBe('Automatic');
    expect(comp.Participants.length).toBe(2);
  });

  it('emits Cancelled event on cancel', () => {
    const comp = instantiate(() => new MJMeetingScheduleFormComponent());
    const cancelSpy = vi.fn();
    comp.Cancelled.subscribe(cancelSpy);
    comp.OnCancel();
    expect(cancelSpy).toHaveBeenCalled();
  });
});

describe('MJMeetingParticipantPickerComponent', () => {
  it('adds and removes participants and emits changes', () => {
    const comp = instantiate(() => new MJMeetingParticipantPickerComponent());
    Object.assign(comp, { cdr: cdrMock });

    const emitSpy = vi.fn();
    comp.ParticipantsChange.subscribe(emitSpy);

    // Add agent
    comp.SelectedAgentID = 'agent-1';
    comp.AddAgentParticipant();

    expect(comp.Participants.length).toBe(1);
    expect(comp.Participants[0].AgentID).toBe('agent-1');
    expect(comp.Participants[0].Role).toBe('Agent');
    expect(emitSpy).toHaveBeenCalledTimes(1);

    // Add guest
    comp.GuestName = 'David Guest';
    comp.GuestEmail = 'david@example.com';
    comp.AddGuestParticipant();

    expect(comp.Participants.length).toBe(2);
    expect(comp.Participants[1].ExternalName).toBe('David Guest');
    expect(emitSpy).toHaveBeenCalledTimes(2);

    // Remove first
    comp.RemoveParticipant(0);
    expect(comp.Participants.length).toBe(1);
    expect(comp.Participants[0].ExternalName).toBe('David Guest');
    expect(emitSpy).toHaveBeenCalledTimes(3);
  });

  it('switches active tabs', () => {
    const comp = instantiate(() => new MJMeetingParticipantPickerComponent());
    Object.assign(comp, { cdr: cdrMock });

    expect(comp.ActiveTab).toBe('user');
    comp.SetActiveTab('agent');
    expect(comp.ActiveTab).toBe('agent');
    comp.SetActiveTab('guest');
    expect(comp.ActiveTab).toBe('guest');
  });
});

describe('MJMeetingLobbyComponent', () => {
  it('toggles audio and video settings and emits JoinConfirmed', () => {
    const comp = instantiate(() => new MJMeetingLobbyComponent());
    Object.assign(comp, { cdr: cdrMock });
    comp.Meeting = SAMPLE_MEETING;

    expect(comp.StartWithAudio).toBe(true);
    expect(comp.StartWithVideo).toBe(false);

    comp.ToggleAudio();
    expect(comp.StartWithAudio).toBe(false);

    comp.ToggleVideo();
    expect(comp.StartWithVideo).toBe(true);

    const joinSpy = vi.fn();
    comp.JoinConfirmed.subscribe(joinSpy);
    comp.OnJoin();

    expect(joinSpy).toHaveBeenCalledWith({
      startWithAudio: false,
      startWithVideo: true,
    });
  });

  it('emits Cancelled when navigating back', () => {
    const comp = instantiate(() => new MJMeetingLobbyComponent());
    const cancelSpy = vi.fn();
    comp.Cancelled.subscribe(cancelSpy);
    comp.OnBack();
    expect(cancelSpy).toHaveBeenCalled();
  });
});
