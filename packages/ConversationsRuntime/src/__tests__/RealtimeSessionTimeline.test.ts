import { describe, it, expect } from 'vitest';
import {
  BuildConversationTimeline,
  CollectRealtimeSessionIDs,
  ConversationTimelineItem,
  FindRealtimeSessionMeta,
  MapRealtimeSessionMeta,
  REALTIME_SESSION_META_FIELDS,
  RealtimeSessionTimelineGroup,
  RealtimeSessionTimelineMeta,
  RealtimeTimelineSourceDetail,
  SessionCardDurationLabel,
  SessionCardIsSameDayRange,
  SessionCardMessageCountLabel,
  SessionCardSpeakerLabel,
  SessionCardStartedAt,
  SessionCardStatusChip,
  SessionCardTitle
} from '../timeline/RealtimeSessionTimeline';

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

/**
 * The card's presentation derivations and the session-meta lookup helpers.
 *
 * These lived as private getters and an inline loop inside Angular components. They are here
 * because the React Native thread renders the same card, and a second implementation is how one
 * surface ends up deciding that `Janitor` reads as "Timed out" while the other says "Closed".
 */
describe('session card presentation', () => {
  const meta = (o: Partial<RealtimeSessionTimelineMeta> = {}): RealtimeSessionTimelineMeta => ({
    SessionID: 'S-1',
    AgentName: null,
    Status: null,
    CloseReason: null,
    ClosedAt: null,
    ...o,
  });

  describe('SessionCardTitle', () => {
    it('names the agent when the lookup supplied one', () => {
      expect(SessionCardTitle(meta({ AgentName: 'Sage' }))).toBe('Voice call with Sage');
    });

    it('falls back to the generic label for a blank or absent name', () => {
      expect(SessionCardTitle(meta({ AgentName: '   ' }))).toBe('Voice call');
      expect(SessionCardTitle(null)).toBe('Voice call');
    });
  });

  describe('SessionCardStatusChip', () => {
    it('shows no chip at all when the session row could not be read', () => {
      // Deliberate: a card that cannot know the status should say nothing, not guess "Closed".
      expect(SessionCardStatusChip(null)).toBeNull();
      expect(SessionCardStatusChip(meta({ Status: null }))).toBeNull();
    });

    it('marks an active session live', () => {
      expect(SessionCardStatusChip(meta({ Status: 'Active' }))).toEqual({ Label: 'Live', Tone: 'live' });
    });

    it('humanizes each close reason', () => {
      const chip = (r: string | null) => SessionCardStatusChip(meta({ Status: 'Closed', CloseReason: r }));
      expect(chip('Explicit')).toEqual({ Label: 'Ended', Tone: 'neutral' });
      expect(chip('Janitor')).toEqual({ Label: 'Timed out', Tone: 'neutral' });
      expect(chip('Shutdown')).toEqual({ Label: 'Interrupted', Tone: 'neutral' });
      expect(chip('Error')).toEqual({ Label: 'Error', Tone: 'error' });
    });

    it('falls back to Closed for legacy rows with no close reason', () => {
      expect(SessionCardStatusChip(meta({ Status: 'Closed', CloseReason: null }))).toEqual({
        Label: 'Closed',
        Tone: 'neutral',
      });
    });
  });

  describe('SessionCardIsSameDayRange', () => {
    it('is true within one day and false across a boundary', () => {
      const group = (s: Date | null, e: Date | null): RealtimeSessionTimelineGroup => ({
        SessionID: 'S-1', StartedAt: s, EndedAt: e,
        TurnCount: 0, DetailCount: 0, LastTurnRole: null, LastTurnPreview: null,
      });
      // Built from LOCAL components on purpose. The rule is about the reader's calendar day, so
      // `toDateString()` reads local time — a UTC fixture would pass or fail on the runner's offset
      // rather than on the behaviour.
      expect(SessionCardIsSameDayRange(group(new Date(2026, 8, 14, 9, 0), new Date(2026, 8, 14, 9, 40)))).toBe(true);
      expect(SessionCardIsSameDayRange(group(new Date(2026, 8, 14, 23, 50), new Date(2026, 8, 15, 0, 10)))).toBe(false);
    });

    it('treats an incomplete range as same-day, since there is no second date to show', () => {
      const partial: RealtimeSessionTimelineGroup = {
        SessionID: 'S-1', StartedAt: new Date('2026-09-14T09:00:00Z'), EndedAt: null,
        TurnCount: 0, DetailCount: 0, LastTurnRole: null, LastTurnPreview: null,
      };
      expect(SessionCardIsSameDayRange(partial)).toBe(true);
    });
  });
});

/**
 * What the card says about the call itself: when it started, how long it ran, how much was said
 * and who said the quoted line. Every surface asks these helpers, so one test pins them all.
 */
describe('session card call details', () => {
  const VIEWER = 'AAAA1111-0000-0000-0000-000000000001';
  const OTHER = 'BBBB2222-0000-0000-0000-000000000002';

  const group = (o: Partial<RealtimeSessionTimelineGroup> = {}): RealtimeSessionTimelineGroup => ({
    SessionID: 'S-1',
    StartedAt: new Date(2026, 8, 14, 9, 0, 30),
    EndedAt: new Date(2026, 8, 14, 9, 40, 0),
    TurnCount: 2,
    DetailCount: 2,
    LastTurnRole: 'Assistant',
    LastTurnPreview: 'I pulled that up for you.',
    ...o,
  });

  const meta = (o: Partial<RealtimeSessionTimelineMeta> = {}): RealtimeSessionTimelineMeta => ({
    SessionID: 'S-1',
    AgentName: 'Sage',
    Status: 'Closed',
    CloseReason: 'Explicit',
    ClosedAt: new Date(2026, 8, 14, 9, 45, 0),
    StartedAt: new Date(2026, 8, 14, 9, 0, 0),
    UserID: VIEWER,
    UserName: 'Amith Nagarajan',
    ...o,
  });

  describe('SessionCardStartedAt', () => {
    it('prefers the session row, which starts before the first caption', () => {
      expect(SessionCardStartedAt(group(), meta())).toEqual(new Date(2026, 8, 14, 9, 0, 0));
    });

    it('falls back to the first caption, then to nothing', () => {
      expect(SessionCardStartedAt(group(), meta({ StartedAt: null }))).toEqual(new Date(2026, 8, 14, 9, 0, 30));
      expect(SessionCardStartedAt(group(), null)).toEqual(new Date(2026, 8, 14, 9, 0, 30));
      expect(SessionCardStartedAt(null, null)).toBeNull();
    });
  });

  describe('SessionCardDurationLabel', () => {
    const span = (seconds: number) =>
      SessionCardDurationLabel(group(), meta({ StartedAt: new Date(0), ClosedAt: new Date(seconds * 1000) }));

    it('measures the session row, not the transcript, when the row has a start and a close', () => {
      // Row: 9:00 → 9:45. Transcript: 9:00:30 → 9:40.
      expect(SessionCardDurationLabel(group(), meta())).toBe('45 min');
    });

    it('reads like a person would say it', () => {
      expect(span(20)).toBe('Under a minute');
      expect(span(60)).toBe('1 min');
      expect(span(12 * 60 + 29)).toBe('12 min');
      expect(span(60 * 60)).toBe('1 hr');
      expect(span(65 * 60)).toBe('1 hr 5 min');
    });

    it('falls back to the transcript span without meta, and to its end for a legacy row with no close', () => {
      const transcript = group({ StartedAt: new Date(2026, 8, 14, 9, 2, 0) }); // 9:02 → 9:40
      expect(SessionCardDurationLabel(transcript, null)).toBe('38 min');
      expect(SessionCardDurationLabel(transcript, meta({ ClosedAt: null }))).toBe('40 min'); // row 9:00 → caption 9:40
    });

    it('says nothing while the call is still going', () => {
      expect(SessionCardDurationLabel(group(), meta({ Status: 'Active', ClosedAt: null }))).toBeNull();
      expect(SessionCardDurationLabel(group(), meta({ Status: 'Idle', ClosedAt: null }))).toBeNull();
    });

    it('says nothing when there is no span to measure', () => {
      // One caption is a point in time, not a call length.
      const oneCaption = group({ StartedAt: new Date(2026, 8, 14, 9, 0), EndedAt: new Date(2026, 8, 14, 9, 0) });
      expect(SessionCardDurationLabel(oneCaption, null)).toBeNull();
      expect(SessionCardDurationLabel(group({ StartedAt: null, EndedAt: null }), null)).toBeNull();
      expect(SessionCardDurationLabel(group(), meta({ ClosedAt: new Date('not-a-date') }))).toBeNull();
    });
  });

  describe('SessionCardMessageCountLabel', () => {
    it('counts in plain words', () => {
      expect(SessionCardMessageCountLabel(group({ TurnCount: 0 }))).toBe('No messages');
      expect(SessionCardMessageCountLabel(group({ TurnCount: 1 }))).toBe('1 message');
      expect(SessionCardMessageCountLabel(group({ TurnCount: 12 }))).toBe('12 messages');
      expect(SessionCardMessageCountLabel(null)).toBe('No messages');
    });
  });

  describe('SessionCardSpeakerLabel', () => {
    it('names the agent, or says "Agent" when the lookup did not', () => {
      expect(SessionCardSpeakerLabel('Assistant', meta(), VIEWER)).toBe('Sage');
      expect(SessionCardSpeakerLabel('Assistant', meta({ AgentName: '  ' }), VIEWER)).toBe('Agent');
      expect(SessionCardSpeakerLabel('Assistant', null, VIEWER)).toBe('Agent');
    });

    it('says "You" on the viewer\'s own call, whatever the id casing', () => {
      expect(SessionCardSpeakerLabel('User', meta(), VIEWER.toLowerCase())).toBe('You');
    });

    it('names the caller on someone else\'s call, and never calls it yours', () => {
      expect(SessionCardSpeakerLabel('User', meta({ UserID: OTHER, UserName: 'Dana Lee' }), VIEWER)).toBe('Dana Lee');
      expect(SessionCardSpeakerLabel('User', meta({ UserID: OTHER, UserName: null }), VIEWER, 'You')).toBe('Caller');
    });

    it('uses the fallback when either side of the comparison is unknown', () => {
      expect(SessionCardSpeakerLabel('User', meta(), null, 'Amith')).toBe('Amith');
      expect(SessionCardSpeakerLabel('User', meta({ UserID: null }), VIEWER, 'Amith')).toBe('Amith');
      expect(SessionCardSpeakerLabel('User', null, VIEWER)).toBe('You');
    });
  });
});

describe('session meta lookup helpers', () => {
  it('collects distinct stamped ids in first-seen order, keeping the original casing', () => {
    // The casing matters: the id goes straight into an `ID IN (…)` filter.
    const ids = CollectRealtimeSessionIDs([
      detail({ AgentSessionID: null }),
      detail({ AgentSessionID: 'AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE' }),
      detail({ AgentSessionID: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' }),
      detail({ AgentSessionID: '   ' }),
      detail({ AgentSessionID: 'F1111111-2222-3333-4444-555555555555' }),
    ]);
    expect(ids).toEqual(['AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE', 'F1111111-2222-3333-4444-555555555555']);
  });

  it('keys mapped meta case-insensitively so either database casing resolves', () => {
    const map = MapRealtimeSessionMeta([
      { ID: 'AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE', Agent: 'Sage', Status: 'Closed', CloseReason: 'Explicit', ClosedAt: '2026-09-14T10:00:00Z' },
    ]);
    const found = FindRealtimeSessionMeta(map, 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
    expect(found?.AgentName).toBe('Sage');
    expect(found?.ClosedAt).toBeInstanceOf(Date);
  });

  it('maps who the call belonged to and when it started', () => {
    const map = MapRealtimeSessionMeta([
      { ID: 'S-1', UserID: 'U-1', User: 'Dana Lee', __mj_CreatedAt: '2026-09-14T09:00:00Z' },
      { ID: 'S-2' },
    ]);
    expect(FindRealtimeSessionMeta(map, 'S-1')).toMatchObject({
      UserID: 'U-1',
      UserName: 'Dana Lee',
      StartedAt: new Date('2026-09-14T09:00:00Z'),
    });
    // A row without them maps to nulls, which every card helper reads as "unknown".
    expect(FindRealtimeSessionMeta(map, 'S-2')).toMatchObject({ UserID: null, UserName: null, StartedAt: null });
  });

  it('asks for every column the mapping reads, so no host gets a card with pieces missing', () => {
    expect(REALTIME_SESSION_META_FIELDS).toEqual(
      expect.arrayContaining(['ID', 'Agent', 'Status', 'CloseReason', 'ClosedAt', 'UserID', 'User', '__mj_CreatedAt'])
    );
  });

  it('nulls an unparseable ClosedAt or start rather than rendering "Invalid Date"', () => {
    const map = MapRealtimeSessionMeta([{ ID: 'S-1', ClosedAt: 'not-a-date', __mj_CreatedAt: 'nope' }]);
    expect(FindRealtimeSessionMeta(map, 'S-1')?.ClosedAt).toBeNull();
    expect(FindRealtimeSessionMeta(map, 'S-1')?.StartedAt).toBeNull();
  });

  it('returns null for an unknown session and for an absent map', () => {
    expect(FindRealtimeSessionMeta(new Map(), 'S-9')).toBeNull();
    expect(FindRealtimeSessionMeta(null, 'S-9')).toBeNull();
  });
});
