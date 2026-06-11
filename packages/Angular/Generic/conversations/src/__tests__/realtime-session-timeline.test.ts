import { describe, it, expect } from 'vitest';
import {
  BuildConversationTimeline,
  ConversationTimelineItem,
  RealtimeTimelineSourceDetail
} from '../lib/utils/realtime-session-timeline';

/**
 * The PURE grouping pass behind the conversation timeline's realtime SESSION BLOCKS:
 * details stamped with an `AgentSessionID` must NOT render as normal chat bubbles —
 * they collapse into ONE block per session at the session's chronological position,
 * while every unstamped message passes through untouched and in order.
 */

let nextId = 0;

function detail(overrides: Partial<RealtimeTimelineSourceDetail> = {}): RealtimeTimelineSourceDetail {
  nextId++;
  return {
    ID: `D-${nextId}`,
    AgentSessionID: null,
    Role: 'User',
    Message: `message ${nextId}`,
    HiddenToUser: false,
    __mj_CreatedAt: new Date(2026, 5, 1, 10, 0, nextId),
    ...overrides
  };
}

function kinds(items: ConversationTimelineItem<RealtimeTimelineSourceDetail>[]): string[] {
  return items.map(i => i.Kind);
}

describe('BuildConversationTimeline — passthrough of normal messages', () => {
  it('returns an empty timeline for no details', () => {
    expect(BuildConversationTimeline([])).toEqual([]);
  });

  it('passes unstamped messages through unchanged, in order, by identity', () => {
    const a = detail();
    const b = detail({ Role: 'AI' });
    const items = BuildConversationTimeline([a, b]);

    expect(kinds(items)).toEqual(['message', 'message']);
    expect(items[0].Kind === 'message' && items[0].Detail).toBe(a);
    expect(items[1].Kind === 'message' && items[1].Detail).toBe(b);
  });

  it('treats empty/whitespace AgentSessionID stamps as unstamped', () => {
    const items = BuildConversationTimeline([
      detail({ AgentSessionID: '' }),
      detail({ AgentSessionID: '   ' })
    ]);
    expect(kinds(items)).toEqual(['message', 'message']);
  });
});

describe('BuildConversationTimeline — session collapse', () => {
  it('collapses consecutive same-session details into ONE block at their chronological position', () => {
    const before = detail();
    const turn1 = detail({ AgentSessionID: 'S-1', Role: 'User', Message: 'hello there' });
    const turn2 = detail({ AgentSessionID: 'S-1', Role: 'AI', Message: 'hi! how can I help?' });
    const after = detail();

    const items = BuildConversationTimeline([before, turn1, turn2, after]);

    expect(kinds(items)).toEqual(['message', 'session', 'message']);
    const block = items[1];
    if (block.Kind !== 'session') throw new Error('expected a session block');
    expect(block.Group.SessionID).toBe('S-1');
    expect(block.Group.TurnCount).toBe(2);
    expect(block.Group.DetailCount).toBe(2);
    expect(block.Group.StartedAt).toEqual(turn1.__mj_CreatedAt);
    expect(block.Group.EndedAt).toEqual(turn2.__mj_CreatedAt);
    expect(block.Group.LastTurnRole).toBe('Assistant'); // AI maps to Assistant
    expect(block.Group.LastTurnPreview).toBe('hi! how can I help?');
  });

  it('renders ONE element per session even when its rows are interleaved with normal messages', () => {
    const items = BuildConversationTimeline([
      detail({ AgentSessionID: 'S-1', Message: 'first leg turn' }),
      detail({ Message: 'normal note in between' }),
      detail({ AgentSessionID: 'S-1', Role: 'AI', Message: 'late session turn' })
    ]);

    expect(kinds(items)).toEqual(['session', 'message']);
    const block = items[0];
    if (block.Kind !== 'session') throw new Error('expected a session block');
    expect(block.Group.TurnCount).toBe(2);
    expect(block.Group.LastTurnPreview).toBe('late session turn');
  });

  it('produces separate blocks for DIFFERENT sessions, each at its own position', () => {
    const items = BuildConversationTimeline([
      detail({ AgentSessionID: 'S-1' }),
      detail(),
      detail({ AgentSessionID: 'S-2' })
    ]);

    expect(kinds(items)).toEqual(['session', 'message', 'session']);
    const first = items[0];
    const second = items[2];
    if (first.Kind !== 'session' || second.Kind !== 'session') throw new Error('expected session blocks');
    expect(first.Group.SessionID).toBe('S-1');
    expect(second.Group.SessionID).toBe('S-2');
  });

  it('groups session ids case-insensitively (SQL Server uppercase vs PostgreSQL lowercase)', () => {
    const items = BuildConversationTimeline([
      detail({ AgentSessionID: 'ABC-DEF' }),
      detail({ AgentSessionID: 'abc-def' })
    ]);

    expect(kinds(items)).toEqual(['session']);
    const block = items[0];
    if (block.Kind !== 'session') throw new Error('expected a session block');
    expect(block.Group.DetailCount).toBe(2);
  });
});

describe('BuildConversationTimeline — turn counting mirrors review-mode visibility', () => {
  it('folds hidden rows (junction anchors) into the block WITHOUT counting them as turns', () => {
    const items = BuildConversationTimeline([
      detail({ AgentSessionID: 'S-1', Role: 'User', Message: 'spoken turn' }),
      detail({ AgentSessionID: 'S-1', Role: 'AI', Message: 'artifact anchor', HiddenToUser: true })
    ]);

    const block = items[0];
    if (block.Kind !== 'session') throw new Error('expected a session block');
    expect(block.Group.DetailCount).toBe(2);
    expect(block.Group.TurnCount).toBe(1);
    expect(block.Group.LastTurnPreview).toBe('spoken turn'); // hidden row never becomes the preview
  });

  it('excludes empty-text and Error-role rows from the turn count', () => {
    const items = BuildConversationTimeline([
      detail({ AgentSessionID: 'S-1', Message: '   ' }),
      detail({ AgentSessionID: 'S-1', Role: 'Error', Message: 'boom' }),
      detail({ AgentSessionID: 'S-1', Role: 'AI', Message: 'real turn' })
    ]);

    const block = items[0];
    if (block.Kind !== 'session') throw new Error('expected a session block');
    expect(block.Group.DetailCount).toBe(3);
    expect(block.Group.TurnCount).toBe(1);
    expect(block.Group.LastTurnRole).toBe('Assistant');
  });

  it('tolerates string timestamps and missing timestamps when computing the range', () => {
    const items = BuildConversationTimeline([
      detail({ AgentSessionID: 'S-1', __mj_CreatedAt: '2026-06-01T10:00:00Z' as unknown as Date }),
      detail({ AgentSessionID: 'S-1', __mj_CreatedAt: null }),
      detail({ AgentSessionID: 'S-1', __mj_CreatedAt: '2026-06-01T10:05:00Z' as unknown as Date })
    ]);

    const block = items[0];
    if (block.Kind !== 'session') throw new Error('expected a session block');
    expect(block.Group.StartedAt?.toISOString()).toBe('2026-06-01T10:00:00.000Z');
    expect(block.Group.EndedAt?.toISOString()).toBe('2026-06-01T10:05:00.000Z');
  });
});
