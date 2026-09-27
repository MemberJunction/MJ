// Angular components in this package are partial-compiled — load the JIT compiler first
// (same convention as the whiteboard / delegation-card suites in this node test environment).
import '@angular/compiler';
import { describe, it, expect, vi } from 'vitest';
import { RealtimeSessionTimelineCardComponent } from '../lib/components/realtime/realtime-session-timeline-card.component';
import { RealtimeSessionTimelineGroup, RealtimeSessionTimelineMeta } from '../lib/utils/realtime-session-timeline';

/**
 * The session timeline card's contract: the labels the template renders (title, status, duration,
 * message count, who said the quoted line, the button) and the Open emission the message list
 * bubbles up to host the SESSION REVIEW overlay. Class-level tests (no TestBed), matching the
 * delegation-card suite's style.
 */

const VIEWER_ID = 'AAAA1111-0000-0000-0000-000000000001';
const OTHER_ID = 'BBBB2222-0000-0000-0000-000000000002';

function group(overrides: Partial<RealtimeSessionTimelineGroup> = {}): RealtimeSessionTimelineGroup {
  return {
    SessionID: 'SESSION-1',
    StartedAt: new Date(2026, 5, 1, 10, 0, 30),
    EndedAt: new Date(2026, 5, 1, 10, 12, 0),
    TurnCount: 7,
    DetailCount: 9,
    LastTurnRole: 'Assistant',
    LastTurnPreview: 'sure, done!',
    ...overrides
  };
}

function meta(overrides: Partial<RealtimeSessionTimelineMeta> = {}): RealtimeSessionTimelineMeta {
  return {
    SessionID: 'SESSION-1',
    AgentName: 'Voice Co-Agent',
    Status: 'Closed',
    CloseReason: 'Explicit',
    ClosedAt: new Date(2026, 5, 1, 10, 12, 5),
    StartedAt: new Date(2026, 5, 1, 10, 0, 0),
    UserID: VIEWER_ID,
    UserName: 'Amith Nagarajan',
    ...overrides
  };
}

function card(
  g = group(),
  m: RealtimeSessionTimelineMeta | null = null,
  currentUserID: string | null = null
): RealtimeSessionTimelineCardComponent {
  const component = new RealtimeSessionTimelineCardComponent();
  component.Group = g;
  component.Meta = m;
  component.CurrentUserID = currentUserID;
  return component;
}

describe('RealtimeSessionTimelineCardComponent — title', () => {
  it('says "Voice call" when no meta is available', () => {
    expect(card().Title).toBe('Voice call');
  });

  it('names the agent when the session meta carries one', () => {
    expect(card(group(), meta()).Title).toBe('Voice call with Voice Co-Agent');
  });

  it('falls back to "Voice call" for a blank agent name', () => {
    expect(card(group(), meta({ AgentName: '   ' })).Title).toBe('Voice call');
  });
});

describe('RealtimeSessionTimelineCardComponent — start time', () => {
  it('prefers the session row, which starts before the first caption', () => {
    expect(card(group(), meta()).StartedAt).toEqual(new Date(2026, 5, 1, 10, 0, 0));
  });

  it('falls back to the first caption without meta', () => {
    expect(card().StartedAt).toEqual(new Date(2026, 5, 1, 10, 0, 30));
  });
});

describe('RealtimeSessionTimelineCardComponent — status', () => {
  it('hides the status entirely when no meta is available', () => {
    expect(card().StatusChip).toBeNull();
    expect(card().StatusTone).toBeNull();
  });

  it('humanizes the close reason for closed sessions', () => {
    expect(card(group(), meta({ CloseReason: 'Explicit' })).StatusChip).toBe('Ended');
    expect(card(group(), meta({ CloseReason: 'Janitor' })).StatusChip).toBe('Timed out');
    expect(card(group(), meta({ CloseReason: 'Shutdown' })).StatusChip).toBe('Interrupted');
    expect(card(group(), meta({ CloseReason: 'Error' })).StatusChip).toBe('Error');
  });

  it('falls back to "Closed" for legacy closed rows without a close reason', () => {
    expect(card(group(), meta({ CloseReason: null })).StatusChip).toBe('Closed');
  });

  it('shows Live / Idle for open sessions', () => {
    expect(card(group(), meta({ Status: 'Active', CloseReason: null })).StatusChip).toBe('Live');
    expect(card(group(), meta({ Status: 'Idle', CloseReason: null })).StatusChip).toBe('Idle');
  });

  it('exposes the tone for styling, and flags error and live only for those tones', () => {
    expect(card(group(), meta({ CloseReason: 'Error' })).StatusTone).toBe('error');
    expect(card(group(), meta({ CloseReason: 'Error' })).IsErrorChip).toBe(true);
    expect(card(group(), meta({ CloseReason: 'Explicit' })).IsErrorChip).toBe(false);
    expect(card(group(), meta({ Status: 'Active', CloseReason: null })).IsLiveChip).toBe(true);
    expect(card(group(), meta({ Status: 'Idle', CloseReason: null })).StatusTone).toBe('idle');
  });
});

describe('RealtimeSessionTimelineCardComponent — duration and message count', () => {
  it('measures from the session row when it has a start and a close', () => {
    // 10:00:00 → 10:12:05 on the row, against 10:00:30 → 10:12:00 in the transcript.
    expect(card(group(), meta()).DurationLabel).toBe('12 min');
  });

  it('falls back to the transcript span without meta', () => {
    expect(card(group({ StartedAt: new Date(2026, 5, 1, 10, 0, 0), EndedAt: new Date(2026, 5, 1, 10, 0, 40) })).DurationLabel)
      .toBe('Under a minute');
  });

  it('has no duration while the call is live', () => {
    expect(card(group(), meta({ Status: 'Active', CloseReason: null, ClosedAt: null })).DurationLabel).toBeNull();
  });

  it('counts messages in plain words', () => {
    expect(card(group({ TurnCount: 0 })).MessageCountLabel).toBe('No messages');
    expect(card(group({ TurnCount: 1 })).MessageCountLabel).toBe('1 message');
    expect(card(group({ TurnCount: 7 })).MessageCountLabel).toBe('7 messages');
  });
});

describe('RealtimeSessionTimelineCardComponent — who said the quoted line', () => {
  it('names the agent on an agent line', () => {
    expect(card(group(), meta()).SpeakerLabel).toBe('Voice Co-Agent');
    expect(card().SpeakerLabel).toBe('Agent');
  });

  it('says "You" on the viewer\'s own call, however the database cased the id', () => {
    const userLine = group({ LastTurnRole: 'User' });
    expect(card(userLine, meta(), VIEWER_ID.toLowerCase()).SpeakerLabel).toBe('You');
  });

  it('names the caller on someone else\'s call', () => {
    const userLine = group({ LastTurnRole: 'User' });
    expect(card(userLine, meta({ UserID: OTHER_ID, UserName: 'Dana Lee' }), VIEWER_ID).SpeakerLabel).toBe('Dana Lee');
  });

  it('uses the UserName input when whose call it was is unknown', () => {
    const component = card(group({ LastTurnRole: 'User' }), null, VIEWER_ID);
    expect(component.SpeakerLabel).toBe('You');
    component.UserName = 'Amith';
    expect(component.SpeakerLabel).toBe('Amith');
  });
});

describe('RealtimeSessionTimelineCardComponent — button and summary', () => {
  it('reviews a finished call and views a live one', () => {
    expect(card(group(), meta()).ActionLabel).toBe('Review call');
    expect(card().ActionLabel).toBe('Review call');
    expect(card(group(), meta({ Status: 'Active', CloseReason: null, ClosedAt: null })).ActionLabel).toBe('View call');
  });

  it('summarizes the row in one sentence for screen readers, skipping what it does not know', () => {
    expect(card(group(), meta()).AccessibleSummary).toBe('Voice call with Voice Co-Agent, Ended, 12 min, 7 messages');
    expect(card(group({ StartedAt: null, EndedAt: null })).AccessibleSummary).toBe('Voice call, 7 messages');
  });
});

describe('RealtimeSessionTimelineCardComponent — Open emission', () => {
  it('emits OpenRequested with the session id and stops event propagation', () => {
    const component = card(group({ SessionID: 'SESSION-42' }));
    const emitted: string[] = [];
    component.OpenRequested.subscribe((id: string) => emitted.push(id));

    const event = { stopPropagation: vi.fn() } as unknown as MouseEvent & { stopPropagation: ReturnType<typeof vi.fn> };
    component.Open(event);

    expect(emitted).toEqual(['SESSION-42']);
    expect(event.stopPropagation).toHaveBeenCalled();
  });

  it('does not emit when the group has no session id', () => {
    const component = card(group({ SessionID: '' }));
    const emitted: string[] = [];
    component.OpenRequested.subscribe((id: string) => emitted.push(id));

    component.Open();

    expect(emitted).toEqual([]);
  });
});
