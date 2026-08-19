/**
 * Realtime-session timeline grouping for the standard conversation message list.
 *
 *
 * This module is PURE (no Angular, no entities) so the grouping pass is unit-testable:
 * the source shape is a minimal structural interface that `MJConversationDetailEntity`
 * satisfies via its getters.
 */
import { describe, it, expect } from 'vitest';
import {
  SelectLatestTimelinePage,
  DEFAULT_TRANSCRIPT_PAGE_SIZE,
  DEFAULT_RAW_OVERREAD
} from '../lib/utils/conversation-detail-window';
import {
  RealtimeTimelineSourceDetail
} from '../lib/utils/realtime-session-timeline';


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


function messages(count: number): RealtimeTimelineSourceDetail[] {
  return Array.from({ length: count }, () => detail());
}

function sessionRows(count: number, sessionId: string): RealtimeTimelineSourceDetail[] {
  return Array.from({ length: count }, () => detail({ AgentSessionID: sessionId }));
}

describe('SelectLatestTimelinePage — degenerate input', () => {
  it('returns an empty page for no details', () => {
    expect(SelectLatestTimelinePage([], 10)).toEqual({ Page: [], OldestIncluded: null });
  });

  it('returns an empty page for a zero or negative page size', () => {
    const rows = messages(5);
    expect(SelectLatestTimelinePage(rows, 0)).toEqual({ Page: [], OldestIncluded: null });
    expect(SelectLatestTimelinePage(rows, -1)).toEqual({ Page: [], OldestIncluded: null });
  });
});

describe('SelectLatestTimelinePage — plain messages', () => {
  it('returns every row when the conversation is shorter than a page', () => {
    const rows = messages(7);
    const { Page, OldestIncluded } = SelectLatestTimelinePage(rows, DEFAULT_TRANSCRIPT_PAGE_SIZE);

    expect(Page).toEqual(rows);
    expect(OldestIncluded).toBe(rows[0]);
  });

  it('returns the LAST pageSize rows of a long conversation, by identity', () => {
    const rows = messages(30);
    const { Page, OldestIncluded } = SelectLatestTimelinePage(rows, 10);

    expect(Page).toHaveLength(10);
    expect(Page).toEqual(rows.slice(20));
    // Identity, not deep equality — the store dedupes and re-renders off these references.
    expect(Page[0]).toBe(rows[20]);
    expect(OldestIncluded).toBe(rows[20]);
  });
});

describe('SelectLatestTimelinePage — session atomicity', () => {
  it('pulls in EVERY row of a tail session, because the card counts as ONE item', () => {
    const session = sessionRows(20, 'SESSION-A');
    const after = messages(5);
    const rows = [...session, ...after];

    // Timeline is 1 session card + 5 messages = 6 items, all inside a page of 10.
    const { Page, OldestIncluded } = SelectLatestTimelinePage(rows, 10);

    expect(Page).toHaveLength(25);
    expect(Page).toEqual(rows);
    expect(OldestIncluded).toBe(session[0]);
  });

  it('excludes ALL rows of a session whose card falls outside the page', () => {
    const before = messages(20);
    const session = sessionRows(20, 'SESSION-A');
    const after = messages(20);
    const rows = [...before, ...session, ...after];

    // Timeline is 20 + 1 + 20 = 41 items; the last 10 are all plain messages.
    const { Page, OldestIncluded } = SelectLatestTimelinePage(rows, 10);

    expect(Page).toHaveLength(10);
    expect(Page).toEqual(after.slice(10));
    expect(Page.some(d => d.AgentSessionID !== null)).toBe(false);
    expect(OldestIncluded).toBe(after[10]);
  });

  it('pulls in session rows INTERLEAVED after the card position', () => {
    const older = messages(3);
    const first = detail({ AgentSessionID: 'SESSION-A' });
    const between = detail();
    const later = detail({ AgentSessionID: 'SESSION-A' });
    const last = detail();
    const rows = [...older, first, between, later, last];

    // Timeline: 3 messages, session card (at `first`), `between`, `last` = 6 items.
    // A page of 3 keeps the card, `between` and `last` — `later` rides in with the card.
    const { Page, OldestIncluded } = SelectLatestTimelinePage(rows, 3);

    expect(Page).toEqual([first, between, later, last]);
    expect(OldestIncluded).toBe(first);
  });

  it('includes HiddenToUser anchor rows folded into an included session', () => {
    const anchor = detail({ AgentSessionID: 'SESSION-A', HiddenToUser: true, Message: null });
    const spoken = detail({ AgentSessionID: 'SESSION-A', Role: 'AI' });
    const rows = [anchor, spoken, ...messages(2)];

    const { Page } = SelectLatestTimelinePage(rows, 10);

    expect(Page).toContain(anchor);
    expect(Page).toHaveLength(4);
  });

  it('groups a session case-insensitively across SQL Server / PostgreSQL id casing', () => {
    const upper = detail({ AgentSessionID: 'AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE' });
    const lower = detail({ AgentSessionID: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' });
    const rows = [upper, detail(), lower, detail()];

    const { Page } = SelectLatestTimelinePage(rows, 10);

    expect(Page).toEqual(rows);
  });

  it('treats whitespace-only session stamps as normal messages, like the grouping pass', () => {
    const blank = detail({ AgentSessionID: '   ' });
    const rows = [...messages(3), blank];

    const { Page } = SelectLatestTimelinePage(rows, 1);

    expect(Page).toEqual([blank]);
  });
});

describe('window constants', () => {
  it('over-reads raw rows so session collapse can still fill a page of items', () => {
    expect(DEFAULT_RAW_OVERREAD).toBe(DEFAULT_TRANSCRIPT_PAGE_SIZE * 3);
    expect(DEFAULT_RAW_OVERREAD).toBeGreaterThan(DEFAULT_TRANSCRIPT_PAGE_SIZE);
  });
});
