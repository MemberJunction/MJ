import { describe, it, expect } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RunViewParams } from '@memberjunction/core';
import { createFakeProvider, useFakeGlobalProvider, query, queryAll, StubEmptyStateComponent, StubLoadingComponent } from '@memberjunction/ng-test-utils';
import { AnalyticsRealtimeTranscriptsComponent } from './realtime-transcripts.component';

/**
 * DOM coverage for <app-analytics-realtime-transcripts> — the master-detail meeting-transcript browser.
 * `reload()` calls `AIEngineBase.Instance.EnsureLoaded()` (harmless against the fake GLOBAL provider)
 * then loads `MJ: Conversations` (Type='Meeting Room') via `LoadMeetingRooms(this.ProviderToUse)`.
 * A `createFakeProvider` returns room rows for the conversations query. No rooms → the "No meeting
 * transcripts yet" empty state; rooms → a clickable room button list, and no room selected → the
 * "Select a meeting" transcript-pane placeholder. `selectRoom()` loads that room's transcript lines
 * (`MJ: Conversation Details`) and renders one `.line` per utterance. `mj-loading`/`mj-empty-state` stubbed.
 */

const ROOMS = [
  { ID: 'c1', Name: 'Standup', ExternalID: 'room-1', __mj_CreatedAt: '2026-01-05T09:00:00Z', __mj_UpdatedAt: '2026-01-05T09:30:00Z' },
  { ID: 'c2', Name: 'Design Review', ExternalID: 'room-2', __mj_CreatedAt: '2026-01-04T09:00:00Z', __mj_UpdatedAt: '2026-01-04T10:00:00Z' },
];
const LINES = [
  { ID: 'd1', Role: 'AI', Message: 'Hello everyone', AgentID: 'ag1', ExternalID: '', Error: null, __mj_CreatedAt: '2026-01-05T09:00:05Z' },
  { ID: 'd2', Role: 'User', Message: 'Hi there', AgentID: null, ExternalID: 'spk-1', Error: null, __mj_CreatedAt: '2026-01-05T09:00:10Z' },
];

const roomsProviderRows = (p: RunViewParams): unknown[] => (p.EntityName === 'MJ: Conversations' ? ROOMS : []);
const transcriptRows = (p: RunViewParams): unknown[] =>
  p.EntityName === 'MJ: Conversations' ? ROOMS : p.EntityName === 'MJ: Conversation Details' ? LINES : [];

async function render(rows: (p: RunViewParams) => unknown[]): Promise<ComponentFixture<AnalyticsRealtimeTranscriptsComponent>> {
  TestBed.configureTestingModule({ declarations: [AnalyticsRealtimeTranscriptsComponent], imports: [StubLoadingComponent, StubEmptyStateComponent] });
  const fixture = TestBed.createComponent(AnalyticsRealtimeTranscriptsComponent);
  fixture.componentRef.setInput('Provider', createFakeProvider({ runViewResults: rows }));
  fixture.detectChanges(false);
  await new Promise((r) => setTimeout(r, 20));
  fixture.componentRef.changeDetectorRef.markForCheck();
  fixture.detectChanges(false);
  return fixture;
}

describe('AnalyticsRealtimeTranscriptsComponent (DOM)', () => {
  const installProvider = useFakeGlobalProvider();

  it('shows the "no transcripts" empty state when there are no rooms', async () => {
    installProvider({ runViewResults: [] });
    const fixture = await render(() => []);
    const emptyTitles = queryAll(fixture, '.stub-empty').map((e) => e.textContent?.trim());
    expect(emptyTitles).toContain('No meeting transcripts yet');
    expect(queryAll(fixture, '.room').length).toBe(0);
  });

  it('renders one room button per meeting and the count header', async () => {
    installProvider({ runViewResults: [] });
    const fixture = await render(roomsProviderRows);
    expect(queryAll(fixture, '.room').length).toBe(2);
    expect(query(fixture, '.room-list__head')?.textContent).toContain('2 meetings');
    const names = queryAll(fixture, '.room__name').map((e) => e.textContent?.trim());
    expect(names).toEqual(expect.arrayContaining(['Standup', 'Design Review']));
  });

  it('shows the "select a meeting" placeholder while no room is selected', async () => {
    installProvider({ runViewResults: [] });
    const fixture = await render(roomsProviderRows);
    const emptyTitles = queryAll(fixture, '.stub-empty').map((e) => e.textContent?.trim());
    expect(emptyTitles).toContain('Select a meeting');
  });

  it('renders the transcript lines after a room is selected', async () => {
    installProvider({ runViewResults: [] });
    const fixture = await render(transcriptRows);
    await fixture.componentInstance.selectRoom(fixture.componentInstance.Rooms[0]);
    fixture.componentRef.changeDetectorRef.markForCheck();
    fixture.detectChanges(false);
    expect(query(fixture, '.transcript-pane__head h3')?.textContent?.trim()).toBe('Standup');
    expect(queryAll(fixture, '.line').length).toBe(LINES.length);
    const messages = queryAll(fixture, '.line__bubble').map((e) => e.textContent?.trim());
    expect(messages).toEqual(expect.arrayContaining(['Hello everyone', 'Hi there']));
  });
});
