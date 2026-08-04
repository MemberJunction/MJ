// Angular components in this package are partial-compiled — load the JIT compiler first
// (same convention as the whiteboard / delegation-card suites in this node test environment).
import '@angular/compiler';
import { describe, it, expect, vi } from 'vitest';
import { RealtimeSessionTimelineCardComponent } from '../lib/components/realtime/realtime-session-timeline-card.component';
import { RealtimeSessionTimelineGroup, RealtimeSessionTimelineMeta } from '../lib/utils/realtime-session-timeline';

/**
 * The session timeline card's contract: the title/chip derivations the template renders,
 * and the Open emission the message list bubbles up to host the SESSION REVIEW overlay.
 * Class-level tests (no TestBed), matching the delegation-card suite's style.
 */

function group(overrides: Partial<RealtimeSessionTimelineGroup> = {}): RealtimeSessionTimelineGroup {
  return {
    SessionID: 'SESSION-1',
    StartedAt: new Date(2026, 5, 1, 10, 0, 0),
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
    ...overrides
  };
}

function card(g = group(), m: RealtimeSessionTimelineMeta | null = null): RealtimeSessionTimelineCardComponent {
  const component = new RealtimeSessionTimelineCardComponent();
  component.Group = g;
  component.Meta = m;
  return component;
}

describe('RealtimeSessionTimelineCardComponent — title', () => {
  it('shows the generic label when no meta is available', () => {
    expect(card().Title).toBe('Realtime session');
  });

  it('appends the agent name when the session meta carries one', () => {
    expect(card(group(), meta()).Title).toBe('Realtime session · Voice Co-Agent');
  });

  it('falls back to the generic label for a blank agent name', () => {
    expect(card(group(), meta({ AgentName: '   ' })).Title).toBe('Realtime session');
  });
});

describe('RealtimeSessionTimelineCardComponent — status chip', () => {
  it('hides the chip entirely when no meta is available', () => {
    expect(card().StatusChip).toBeNull();
  });

  it('humanizes the close reason for closed sessions', () => {
    expect(card(group(), meta({ CloseReason: 'Explicit' })).StatusChip).toBe('Ended');
    expect(card(group(), meta({ CloseReason: 'Janitor' })).StatusChip).toBe('Timed out');
    expect(card(group(), meta({ CloseReason: 'Shutdown' })).StatusChip).toBe('Server shutdown');
    expect(card(group(), meta({ CloseReason: 'Error' })).StatusChip).toBe('Error');
  });

  it('falls back to "Closed" for legacy closed rows without a close reason', () => {
    expect(card(group(), meta({ CloseReason: null })).StatusChip).toBe('Closed');
  });

  it('shows Live / Idle for open sessions', () => {
    expect(card(group(), meta({ Status: 'Active', CloseReason: null })).StatusChip).toBe('Live');
    expect(card(group(), meta({ Status: 'Idle', CloseReason: null })).StatusChip).toBe('Idle');
  });

  it('flags the error chip styling only for Error closes', () => {
    expect(card(group(), meta({ CloseReason: 'Error' })).IsErrorChip).toBe(true);
    expect(card(group(), meta({ CloseReason: 'Explicit' })).IsErrorChip).toBe(false);
    expect(card(group(), meta({ Status: 'Active', CloseReason: null })).IsLiveChip).toBe(true);
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

describe('RealtimeSessionTimelineCardComponent — time range formatting hint', () => {
  it('reports a same-day range for start/end on the same calendar day', () => {
    expect(card().SameDayRange).toBe(true);
  });

  it('reports a cross-day range when the session spans midnight', () => {
    const g = group({
      StartedAt: new Date(2026, 5, 1, 23, 50, 0),
      EndedAt: new Date(2026, 5, 2, 0, 10, 0)
    });
    expect(card(g).SameDayRange).toBe(false);
  });

  it('defaults to same-day when either end of the range is unknown', () => {
    expect(card(group({ EndedAt: null })).SameDayRange).toBe(true);
  });
});
