import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { IMetadataProvider, RunView, RunViewParams } from '@memberjunction/core';
import {
  BuildReviewDelegationCard,
  BuildReviewThreadItems,
  RealtimeSessionReview,
  RealtimeSessionReviewRun,
  RealtimeSessionReviewService
} from '../lib/services/realtime-session-review.service';
import { RealtimeSessionState, RealtimeThreadItem } from '../lib/components/realtime/realtime-session-state';

/**
 * SESSION REVIEW data layer: the stateless loader that batch-loads a past
 * `MJ: AI Agent Sessions` row + its persisted caption turns + delegated runs (minus the
 * co-agent observability run) + saved channel states, the pure review→thread-item mapping,
 * and `RealtimeSessionState`'s historical population path.
 */

// ── Row builders (the 'simple' result shapes the service consumes) ───────────

interface FakeResult {
  Success: boolean;
  ErrorMessage?: string;
  Results: object[];
}

function sessionRow(overrides: Record<string, string | null> = {}): object {
  return {
    ID: 'SESSION-1',
    AgentID: 'AGENT-CO',
    Agent: 'Realtime Co-Agent',
    Status: 'Closed',
    ConversationID: 'CONV-1',
    Config: JSON.stringify({ targetAgentID: 'AGENT-TARGET', coAgentRunID: 'RUN-CO' }),
    LastActiveAt: '2026-06-10T10:30:00Z',
    ClosedAt: '2026-06-10T10:31:00Z',
    CloseReason: 'Explicit',
    __mj_CreatedAt: '2026-06-10T10:00:00Z',
    ...overrides
  };
}

function detailRow(role: 'AI' | 'Error' | 'User', message: string | null, at: string, hidden = false): object {
  return { ID: `D-${at}`, Role: role, Message: message, HiddenToUser: hidden, __mj_CreatedAt: at };
}

function runRow(id: string, overrides: Record<string, string | boolean | null> = {}): object {
  return {
    ID: id,
    AgentID: 'AGENT-X',
    Agent: 'Sage',
    Status: 'Completed',
    Success: true,
    Message: 'Did the thing',
    ErrorMessage: null,
    FinalStep: 'Success',
    StartedAt: '2026-06-10T10:05:00Z',
    CompletedAt: '2026-06-10T10:06:00Z',
    ...overrides
  };
}

function channelRow(channel: string | null, config: string | null): object {
  return { ID: `CH-${channel ?? 'x'}`, Channel: channel, Config: config };
}

// ── RunViews mock plumbing (suite convention: spy on RunView.FromMetadataProvider) ──

let capturedParams: RunViewParams[] = [];

function mockRunViews(results: FakeResult[]): void {
  const runViewsFn = vi.fn(async (params: RunViewParams[]) => {
    capturedParams = params;
    return results;
  });
  vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({ RunViews: runViewsFn } as unknown as RunView);
}

function ok(rows: object[]): FakeResult {
  return { Success: true, Results: rows };
}

function failed(): FakeResult {
  return { Success: false, ErrorMessage: 'boom', Results: [] };
}

const provider = {} as unknown as IMetadataProvider;

describe('RealtimeSessionReviewService', () => {
  let service: RealtimeSessionReviewService;

  beforeEach(() => {
    service = new RealtimeSessionReviewService();
    capturedParams = [];
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('LoadSessionReview — null paths', () => {
    it('returns null when the session row does not exist', async () => {
      mockRunViews([ok([]), ok([]), ok([]), ok([])]);
      const review = await service.LoadSessionReview('SESSION-MISSING', provider);
      expect(review).toBeNull();
    });

    it('returns null when the session query itself fails', async () => {
      mockRunViews([failed(), ok([]), ok([]), ok([])]);
      expect(await service.LoadSessionReview('SESSION-1', provider)).toBeNull();
    });

    it('returns null for an empty / whitespace id without querying', async () => {
      const spy = vi.spyOn(RunView, 'FromMetadataProvider');
      expect(await service.LoadSessionReview('   ', provider)).toBeNull();
      expect(spy).not.toHaveBeenCalled();
    });

    it('returns null (never throws) when the batch load rejects', async () => {
      vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({
        RunViews: vi.fn(async () => {
          throw new Error('network down');
        })
      } as unknown as RunView);
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      expect(await service.LoadSessionReview('SESSION-1', provider)).toBeNull();
      expect(errSpy).toHaveBeenCalled();
    });
  });

  describe('LoadSessionReview — query shape', () => {
    it('issues ONE batched RunViews call covering session, details, runs, and channels', async () => {
      mockRunViews([ok([sessionRow()]), ok([]), ok([]), ok([])]);
      await service.LoadSessionReview('SESSION-1', provider);
      expect(capturedParams.map(p => p.EntityName)).toEqual([
        'MJ: AI Agent Sessions',
        'MJ: Conversation Details',
        'MJ: AI Agent Runs',
        'MJ: AI Agent Session Channels'
      ]);
      for (const p of capturedParams) {
        expect(p.ResultType).toBe('simple');
        expect(p.Fields?.length).toBeGreaterThan(0);
      }
    });

    it('escapes single quotes in the session id used in filters', async () => {
      mockRunViews([ok([]), ok([]), ok([]), ok([])]);
      await service.LoadSessionReview("abc'def", provider);
      expect(capturedParams[0].ExtraFilter).toBe("ID='abc''def'");
      expect(capturedParams[1].ExtraFilter).toBe("AgentSessionID='abc''def'");
    });

    it('orders turns and runs chronologically at the database', async () => {
      mockRunViews([ok([sessionRow()]), ok([]), ok([]), ok([])]);
      await service.LoadSessionReview('SESSION-1', provider);
      expect(capturedParams[1].OrderBy).toBe('__mj_CreatedAt ASC');
      expect(capturedParams[2].OrderBy).toBe('StartedAt ASC');
    });
  });

  describe('LoadSessionReview — session mapping', () => {
    it('maps identity, lifecycle, and the Config targetAgentID', async () => {
      mockRunViews([ok([sessionRow()]), ok([]), ok([]), ok([])]);
      const review = await service.LoadSessionReview('SESSION-1', provider);
      expect(review).not.toBeNull();
      expect(review?.SessionID).toBe('SESSION-1');
      expect(review?.AgentID).toBe('AGENT-CO');
      expect(review?.AgentName).toBe('Realtime Co-Agent');
      expect(review?.TargetAgentID).toBe('AGENT-TARGET');
      expect(review?.ConversationID).toBe('CONV-1');
      expect(review?.Status).toBe('Closed');
      expect(review?.CloseReason).toBe('Explicit');
      expect(review?.StartedAt?.toISOString()).toBe('2026-06-10T10:00:00.000Z');
      expect(review?.ClosedAt?.toISOString()).toBe('2026-06-10T10:31:00.000Z');
    });

    it('falls back to the session AgentID when the Config carries no targetAgentID', async () => {
      mockRunViews([ok([sessionRow({ Config: '{}' })]), ok([]), ok([]), ok([])]);
      const review = await service.LoadSessionReview('SESSION-1', provider);
      expect(review?.TargetAgentID).toBe('AGENT-CO');
    });

    it('tolerates malformed Config JSON (fallback target, no run exclusion)', async () => {
      mockRunViews([ok([sessionRow({ Config: '{not json' })]), ok([]), ok([runRow('RUN-CO')]), ok([])]);
      const review = await service.LoadSessionReview('SESSION-1', provider);
      expect(review?.TargetAgentID).toBe('AGENT-CO');
      expect(review?.DelegatedRuns.map(r => r.RunID)).toEqual(['RUN-CO']);
    });

    it('degrades failed sub-queries to empty collections (review still loads)', async () => {
      mockRunViews([ok([sessionRow()]), failed(), failed(), failed()]);
      const review = await service.LoadSessionReview('SESSION-1', provider);
      expect(review).not.toBeNull();
      expect(review?.Turns).toEqual([]);
      expect(review?.DelegatedRuns).toEqual([]);
      expect(review?.ChannelStates).toEqual([]);
    });
  });

  describe('LoadSessionReview — turn mapping', () => {
    it('maps visible User/AI rows in order, translating AI → Assistant', async () => {
      mockRunViews([
        ok([sessionRow()]),
        ok([
          detailRow('User', 'Hello there', '2026-06-10T10:01:00Z'),
          detailRow('AI', 'Hi! How can I help?', '2026-06-10T10:01:30Z')
        ]),
        ok([]),
        ok([])
      ]);
      const review = await service.LoadSessionReview('SESSION-1', provider);
      expect(review?.Turns).toHaveLength(2);
      expect(review?.Turns[0]).toMatchObject({ Role: 'User', Text: 'Hello there' });
      expect(review?.Turns[1]).toMatchObject({ Role: 'Assistant', Text: 'Hi! How can I help?' });
      expect(review?.Turns[0].At?.toISOString()).toBe('2026-06-10T10:01:00.000Z');
    });

    it('skips Error rows, hidden rows, and empty messages', async () => {
      mockRunViews([
        ok([sessionRow()]),
        ok([
          detailRow('Error', 'something broke', '2026-06-10T10:01:00Z'),
          detailRow('User', 'visible', '2026-06-10T10:02:00Z'),
          detailRow('AI', 'secret', '2026-06-10T10:03:00Z', true),
          detailRow('AI', '   ', '2026-06-10T10:04:00Z'),
          detailRow('AI', null, '2026-06-10T10:05:00Z')
        ]),
        ok([]),
        ok([])
      ]);
      const review = await service.LoadSessionReview('SESSION-1', provider);
      expect(review?.Turns.map(t => t.Text)).toEqual(['visible']);
    });
  });

  describe('LoadSessionReview — delegated-run mapping', () => {
    it("EXCLUDES the co-agent observability run named in the session Config's coAgentRunID", async () => {
      mockRunViews([
        ok([sessionRow()]),
        ok([]),
        ok([runRow('RUN-CO'), runRow('RUN-1'), runRow('RUN-2')]),
        ok([])
      ]);
      const review = await service.LoadSessionReview('SESSION-1', provider);
      expect(review?.DelegatedRuns.map(r => r.RunID)).toEqual(['RUN-1', 'RUN-2']);
    });

    it('matches the co-agent run id case-insensitively (SQL Server vs PostgreSQL casing)', async () => {
      mockRunViews([
        ok([sessionRow({ Config: JSON.stringify({ coAgentRunID: 'run-co' }) })]),
        ok([]),
        ok([runRow('RUN-CO'), runRow('RUN-1')]),
        ok([])
      ]);
      const review = await service.LoadSessionReview('SESSION-1', provider);
      expect(review?.DelegatedRuns.map(r => r.RunID)).toEqual(['RUN-1']);
    });

    it('maps the run preview fields (status, success, messages, timing)', async () => {
      mockRunViews([
        ok([sessionRow()]),
        ok([]),
        ok([runRow('RUN-1', { Status: 'Failed', Success: false, Message: null, ErrorMessage: 'it failed', FinalStep: 'Failed' })]),
        ok([])
      ]);
      const review = await service.LoadSessionReview('SESSION-1', provider);
      const run = review?.DelegatedRuns[0];
      expect(run).toMatchObject({
        RunID: 'RUN-1',
        AgentName: 'Sage',
        Status: 'Failed',
        Success: false,
        ErrorMessage: 'it failed',
        FinalStep: 'Failed'
      });
      expect(run?.StartedAt?.toISOString()).toBe('2026-06-10T10:05:00.000Z');
      expect(run?.CompletedAt?.toISOString()).toBe('2026-06-10T10:06:00.000Z');
    });
  });

  describe('LoadSessionReview — channel-state extraction', () => {
    it('maps named channel rows to {ChannelName, StateJson} and skips unnamed rows', async () => {
      mockRunViews([
        ok([sessionRow()]),
        ok([]),
        ok([]),
        ok([
          channelRow('Whiteboard', '{"items":[]}'),
          channelRow('Voice', null),
          channelRow(null, '{"orphan":true}')
        ])
      ]);
      const review = await service.LoadSessionReview('SESSION-1', provider);
      expect(review?.ChannelStates).toEqual([
        { ChannelName: 'Whiteboard', StateJson: '{"items":[]}' },
        { ChannelName: 'Voice', StateJson: null }
      ]);
    });
  });
});

// ── Pure review → thread-item mapping ────────────────────────────────────────

function reviewFixture(overrides: Partial<RealtimeSessionReview> = {}): RealtimeSessionReview {
  return {
    SessionID: 'SESSION-1',
    AgentID: 'AGENT-CO',
    AgentName: 'Skye',
    TargetAgentID: 'AGENT-TARGET',
    ConversationID: 'CONV-1',
    Status: 'Closed',
    CloseReason: 'Explicit',
    StartedAt: new Date('2026-06-10T10:00:00Z'),
    LastActiveAt: new Date('2026-06-10T10:30:00Z'),
    ClosedAt: new Date('2026-06-10T10:31:00Z'),
    Turns: [],
    DelegatedRuns: [],
    ChannelStates: [],
    ...overrides
  };
}

function reviewRun(id: string, startedAt: string | null, overrides: Partial<RealtimeSessionReviewRun> = {}): RealtimeSessionReviewRun {
  return {
    RunID: id,
    AgentID: 'AGENT-X',
    AgentName: 'Sage',
    Status: 'Completed',
    Success: true,
    Message: 'done',
    ErrorMessage: null,
    FinalStep: 'Success',
    StartedAt: startedAt ? new Date(startedAt) : null,
    CompletedAt: startedAt ? new Date(new Date(startedAt).getTime() + 60_000) : null,
    ...overrides
  };
}

describe('BuildReviewThreadItems', () => {
  it('interleaves turns and delegation cards chronologically (oldest first)', () => {
    const review = reviewFixture({
      Turns: [
        { Role: 'User', Text: 'first', At: new Date('2026-06-10T10:01:00Z') },
        { Role: 'Assistant', Text: 'third', At: new Date('2026-06-10T10:06:00Z') }
      ],
      DelegatedRuns: [reviewRun('RUN-1', '2026-06-10T10:03:00Z')]
    });
    const items = BuildReviewThreadItems(review);
    expect(items.map(i => i.Kind)).toEqual(['caption', 'delegation', 'caption']);
    expect(items[0]).toMatchObject({ Kind: 'caption', Role: 'User', Text: 'first' });
    expect(items[2]).toMatchObject({ Kind: 'caption', Role: 'Assistant', Text: 'third' });
  });

  it('keeps build order for entries without timestamps (stable sort to the front)', () => {
    const review = reviewFixture({
      Turns: [
        { Role: 'User', Text: 'a', At: null },
        { Role: 'Assistant', Text: 'b', At: null }
      ],
      DelegatedRuns: [reviewRun('RUN-1', '2026-06-10T10:03:00Z')]
    });
    const items = BuildReviewThreadItems(review);
    expect(items.map(i => (i.Kind === 'caption' ? i.Text : i.Card.CallID))).toEqual(['a', 'b', 'RUN-1']);
  });

  it('names cards after the run agent, falling back to the review agent', () => {
    const review = reviewFixture({
      DelegatedRuns: [
        reviewRun('RUN-1', '2026-06-10T10:03:00Z'),
        reviewRun('RUN-2', '2026-06-10T10:04:00Z', { AgentName: null })
      ]
    });
    const items = BuildReviewThreadItems(review);
    const names = items.map(i => (i.Kind === 'delegation' ? i.Card.AgentName : ''));
    expect(names).toEqual(['Sage', 'Skye']);
  });
});

describe('BuildReviewDelegationCard', () => {
  it('builds a DONE card carrying the run id, ref, result, and timing', () => {
    const card = BuildReviewDelegationCard(reviewRun('RUN-abc1', '2026-06-10T10:03:00Z'), 'Skye');
    expect(card.Done).toBe(true);
    expect(card.Success).toBe(true);
    expect(card.CallID).toBe('RUN-abc1');
    expect(card.RunID).toBe('RUN-abc1');
    expect(card.RunRef).toBe('#abc1');
    expect(card.Result).toBe('done');
    expect(card.StartedAt).toBe(new Date('2026-06-10T10:03:00Z').getTime());
    expect(card.FinishedAt).toBe(new Date('2026-06-10T10:04:00Z').getTime());
  });

  it('prefers the run Message, then ErrorMessage, then Status for the card text', () => {
    const failedCard = BuildReviewDelegationCard(
      reviewRun('RUN-1', '2026-06-10T10:03:00Z', { Success: false, Message: null, ErrorMessage: 'exploded' }),
      'Skye'
    );
    expect(failedCard.Success).toBe(false);
    expect(failedCard.LatestMessage).toBe('exploded');
    expect(failedCard.Result).toBe('exploded');

    const bareCard = BuildReviewDelegationCard(
      reviewRun('RUN-2', null, { Message: null, ErrorMessage: null, FinalStep: null, Status: 'Cancelled' }),
      'Skye'
    );
    expect(bareCard.LatestMessage).toBe('Cancelled');
    expect(bareCard.Result).toBeNull();
    expect(bareCard.StartedAt).toBe(0);
  });
});

// ── RealtimeSessionState historical population ───────────────────────────────

describe('RealtimeSessionState.LoadHistoricalItems', () => {
  let state: RealtimeSessionState;

  beforeEach(() => {
    state = new RealtimeSessionState();
  });

  function historicalItems(): RealtimeThreadItem[] {
    return BuildReviewThreadItems(
      reviewFixture({
        Turns: [{ Role: 'User', Text: 'hello', At: new Date('2026-06-10T10:01:00Z') }],
        DelegatedRuns: [
          reviewRun('RUN-1', '2026-06-10T10:03:00Z'),
          reviewRun('RUN-2', '2026-06-10T10:05:00Z')
        ]
      })
    );
  }

  it('replaces the thread with the historical items and emits Changed$', () => {
    let changes = 0;
    state.Changed$.subscribe(() => changes++);
    state.LoadHistoricalItems(historicalItems());
    expect(changes).toBe(1);
    expect(state.Items.map(i => i.Kind)).toEqual(['caption', 'delegation', 'delegation']);
  });

  it('derives the rail Cards NEWEST first and no active call (all cards done)', () => {
    state.LoadHistoricalItems(historicalItems());
    expect(state.Cards.map(c => c.CallID)).toEqual(['RUN-2', 'RUN-1']);
    expect(state.ActiveCallId).toBeNull();
    expect(state.HasRunningDelegation).toBe(false);
  });

  it('re-populating replaces (does not append to) previous historical state', () => {
    state.LoadHistoricalItems(historicalItems());
    state.LoadHistoricalItems([{ Kind: 'caption', Role: 'User', Text: 'only this' }]);
    expect(state.Items).toHaveLength(1);
    expect(state.Cards).toHaveLength(0);
  });

  it('Clear() empties the thread, cards, and narration, and emits Changed$', () => {
    state.LoadHistoricalItems(historicalItems());
    let changes = 0;
    state.Changed$.subscribe(() => changes++);
    state.Clear();
    expect(changes).toBe(1);
    expect(state.Items).toEqual([]);
    expect(state.Cards).toEqual([]);
    expect(state.Narration).toBeNull();
    expect(state.ActiveCallId).toBeNull();
  });
});
