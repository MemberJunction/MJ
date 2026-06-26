import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Subject } from 'rxjs';
import { IMetadataProvider, RunView, RunViewParams } from '@memberjunction/core';
import type {
  VoiceCaption,
  VoiceDelegationNarration,
  VoiceDelegationProgress,
  VoiceDelegationResult
} from '../lib/services/realtime-session.service';
import {
  BuildReviewDelegationCard,
  BuildReviewThreadItems,
  MAX_REVIEW_LEGS,
  MergeChainChannelStates,
  RealtimeSessionReview,
  RealtimeSessionReviewLeg,
  RealtimeSessionReviewRun,
  RealtimeSessionReviewService,
  RealtimeSessionReviewTurn
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

/**
 * Builds a mapped {@link RealtimeSessionReviewTurn} for the thread/leg fixtures — fills the
 * player-needed fields (ID/Message/__mj_CreatedAt mirror the thread fields) so the mapped-turn
 * shape stays valid for both `BuildReviewThreadItems` AND the recording evidence player.
 */
function reviewTurn(role: 'User' | 'Assistant', text: string, at: Date | null): RealtimeSessionReviewTurn {
  return { ID: `T-${text}`, Role: role, Text: text, Message: text, __mj_CreatedAt: at, At: at, UtteranceStartMs: null, UtteranceEndMs: null };
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
/** EVERY RunViews call's params, in call order (chain walks issue several calls). */
let capturedCalls: RunViewParams[][] = [];

function mockRunViews(results: FakeResult[]): void {
  const runViewsFn = vi.fn(async (params: RunViewParams[]) => {
    capturedParams = params;
    capturedCalls.push(params);
    return results;
  });
  vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({ RunViews: runViewsFn } as unknown as RunView);
}

/**
 * Sequenced RunViews mock: call N returns `sequence[N]` (the last entry repeats when the
 * sequence runs out). Lets chain-walk tests serve different rows per leg / per artifact query.
 */
function mockRunViewsSequence(sequence: FakeResult[][]): void {
  let call = 0;
  const runViewsFn = vi.fn(async (params: RunViewParams[]) => {
    capturedParams = params;
    capturedCalls.push(params);
    const results = sequence[Math.min(call, sequence.length - 1)];
    call++;
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
    capturedCalls = [];
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

  describe('LoadSessionReview — session-chain walk (lastSessionId legs)', () => {
    it('surfaces a SINGLE leg (no extra queries) when the session has no LastSessionID', async () => {
      mockRunViews([ok([sessionRow()]), ok([]), ok([]), ok([])]);
      const review = await service.LoadSessionReview('SESSION-1', provider);
      expect(review?.Legs).toHaveLength(1);
      expect(review?.Legs[0].SessionID).toBe('SESSION-1');
      expect(capturedCalls).toHaveLength(1);
    });

    it('walks the chain BACKWARDS and orders legs (and flattened turns) chronologically', async () => {
      mockRunViewsSequence([
        // Call 1: the reviewed (newest) leg — points back at SESSION-A.
        [
          ok([sessionRow({ ID: 'SESSION-B', LastSessionID: 'SESSION-A', __mj_CreatedAt: '2026-06-10T11:00:00Z' })]),
          ok([detailRow('User', 'second leg turn', '2026-06-10T11:01:00Z')]),
          ok([]),
          ok([])
        ],
        // Call 2: the PRIOR leg.
        [
          ok([sessionRow({ ID: 'SESSION-A', CloseReason: 'Janitor', __mj_CreatedAt: '2026-06-10T10:00:00Z' })]),
          ok([detailRow('User', 'first leg turn', '2026-06-10T10:01:00Z')]),
          ok([])
        ],
        // Call 3: artifact junction query — none.
        [ok([])]
      ]);

      const review = await service.LoadSessionReview('SESSION-B', provider);

      expect(review?.Legs.map(l => l.SessionID)).toEqual(['SESSION-A', 'SESSION-B']);
      expect(review?.Legs[0].CloseReason).toBe('Janitor');
      expect(review?.Turns.map(t => t.Text)).toEqual(['first leg turn', 'second leg turn']);
      // Prior-leg query carries NO channel query (channel state is latest-leg-only).
      expect(capturedCalls[1].map(p => p.EntityName)).toEqual([
        'MJ: AI Agent Sessions',
        'MJ: Conversation Details',
        'MJ: AI Agent Runs'
      ]);
    });

    it('excludes each leg\'s OWN co-agent observability run (per-leg Config)', async () => {
      mockRunViewsSequence([
        [
          ok([sessionRow({ ID: 'SESSION-B', LastSessionID: 'SESSION-A', Config: JSON.stringify({ coAgentRunID: 'RUN-CO-B' }) })]),
          ok([]),
          ok([runRow('RUN-CO-B'), runRow('RUN-B1')]),
          ok([])
        ],
        [
          ok([sessionRow({ ID: 'SESSION-A', Config: JSON.stringify({ coAgentRunID: 'RUN-CO-A' }) })]),
          ok([]),
          ok([runRow('RUN-CO-A'), runRow('RUN-A1')])
        ]
      ]);
      const review = await service.LoadSessionReview('SESSION-B', provider);
      expect(review?.DelegatedRuns.map(r => r.RunID)).toEqual(['RUN-A1', 'RUN-B1']);
    });

    it(`caps the walk at ${MAX_REVIEW_LEGS} legs even when the chain is longer`, async () => {
      // Every leg load returns a session that points at yet another prior session.
      let n = 0;
      const legResult = (): FakeResult[] => {
        n++;
        return [
          ok([sessionRow({ ID: `SESSION-${n}`, LastSessionID: `SESSION-${n + 1}` })]),
          ok([]),
          ok([]),
          ok([])
        ];
      };
      mockRunViewsSequence(Array.from({ length: 10 }, legResult));
      const review = await service.LoadSessionReview('SESSION-1', provider);
      expect(review?.Legs).toHaveLength(MAX_REVIEW_LEGS);
    });

    it('NEVER loops on a cyclic chain (A→B→A) — the cycle guard stops the walk', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      mockRunViewsSequence([
        [ok([sessionRow({ ID: 'SESSION-A', LastSessionID: 'SESSION-B' })]), ok([]), ok([]), ok([])],
        // SESSION-B points BACK at SESSION-A (already visited).
        [ok([sessionRow({ ID: 'SESSION-B', LastSessionID: 'SESSION-A' })]), ok([]), ok([])]
      ]);
      const review = await service.LoadSessionReview('SESSION-A', provider);
      expect(review?.Legs.map(l => l.SessionID)).toEqual(['SESSION-B', 'SESSION-A']);
      expect(warnSpy).toHaveBeenCalled();
    });

    it('matches the cycle guard case-insensitively (SQL Server vs PostgreSQL casing)', async () => {
      mockRunViewsSequence([
        [ok([sessionRow({ ID: 'SESSION-A', LastSessionID: 'SESSION-B' })]), ok([]), ok([]), ok([])],
        [ok([sessionRow({ ID: 'SESSION-B', LastSessionID: 'session-a' })]), ok([]), ok([])]
      ]);
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const review = await service.LoadSessionReview('SESSION-A', provider);
      expect(review?.Legs).toHaveLength(2);
      expect(warnSpy).toHaveBeenCalled();
    });

    it('ends the walk (review still loads) when a prior leg cannot be found', async () => {
      mockRunViewsSequence([
        [ok([sessionRow({ ID: 'SESSION-B', LastSessionID: 'SESSION-GONE' })]), ok([]), ok([]), ok([])],
        [ok([]), ok([]), ok([])] // prior session row missing
      ]);
      const review = await service.LoadSessionReview('SESSION-B', provider);
      expect(review?.Legs.map(l => l.SessionID)).toEqual(['SESSION-B']);
    });

    it('trims an older leg to the NEWEST rows when the 500-detail budget runs out, and stops walking', async () => {
      const manyDetails = Array.from({ length: 498 }, (_, i) =>
        detailRow('User', `turn ${i}`, `2026-06-10T11:00:${String(i % 60).padStart(2, '0')}Z`)
      );
      mockRunViewsSequence([
        [ok([sessionRow({ ID: 'SESSION-C', LastSessionID: 'SESSION-B' })]), ok(manyDetails), ok([]), ok([])],
        [
          ok([sessionRow({ ID: 'SESSION-B', LastSessionID: 'SESSION-A' })]),
          ok([
            detailRow('User', 'oldest — trimmed', '2026-06-10T10:01:00Z'),
            detailRow('User', 'kept 1', '2026-06-10T10:02:00Z'),
            detailRow('User', 'kept 2', '2026-06-10T10:03:00Z')
          ]),
          ok([])
        ],
        // Artifact junction query (NOT another leg — the walk must have stopped).
        [ok([])]
      ]);

      const review = await service.LoadSessionReview('SESSION-C', provider);

      expect(review?.Legs.map(l => l.SessionID)).toEqual(['SESSION-B', 'SESSION-C']);
      expect(review?.Legs[0].Turns.map(t => t.Text)).toEqual(['kept 1', 'kept 2']);
      expect(review?.Turns).toHaveLength(500);
      // No third LEG query was issued: call 3 is the artifact junction query.
      expect(capturedCalls[2][0].EntityName).toBe('MJ: Conversation Detail Artifacts');
    });
  });

  describe('LoadSessionReview — artifact collection', () => {
    function junctionRow(versionId: string | null, detailId = 'D-1'): object {
      return { ID: `J-${versionId ?? 'x'}`, ConversationDetailID: detailId, ArtifactVersionID: versionId };
    }
    function versionRow(id: string, artifactId: string, name: string | null, artifactName: string | null = 'Parent Artifact'): object {
      return { ID: id, ArtifactID: artifactId, Name: name, Artifact: artifactName };
    }

    it('collects {ArtifactID, ArtifactVersionID, Name} through the junction → version queries', async () => {
      mockRunViewsSequence([
        [ok([sessionRow()]), ok([detailRow('User', 'hi', '2026-06-10T10:01:00Z')]), ok([]), ok([])],
        [ok([junctionRow('AV-1'), junctionRow('AV-2')])],
        [ok([versionRow('AV-1', 'A-1', 'Quarterly Report'), versionRow('AV-2', 'A-2', null, 'Member Chart')])]
      ]);

      const review = await service.LoadSessionReview('SESSION-1', provider);

      expect(review?.Artifacts).toEqual([
        { ArtifactID: 'A-1', ArtifactVersionID: 'AV-1', Name: 'Quarterly Report' },
        { ArtifactID: 'A-2', ArtifactVersionID: 'AV-2', Name: 'Member Chart' } // version Name null → artifact name
      ]);
      // Junction query filters the chain's detail ids + Output direction.
      const junctionParams = capturedCalls[1][0];
      expect(junctionParams.EntityName).toBe('MJ: Conversation Detail Artifacts');
      expect(junctionParams.ExtraFilter).toContain("ConversationDetailID IN ('D-2026-06-10T10:01:00Z')");
      expect(junctionParams.ExtraFilter).toContain("Direction='Output'");
      // Version query loads the junctioned version ids.
      const versionParams = capturedCalls[2][0];
      expect(versionParams.EntityName).toBe('MJ: Artifact Versions');
      expect(versionParams.ExtraFilter).toBe("ID IN ('AV-1','AV-2')");
    });

    it('dedupes duplicate versions, skips null version ids and unresolvable versions', async () => {
      mockRunViewsSequence([
        [ok([sessionRow()]), ok([detailRow('User', 'hi', '2026-06-10T10:01:00Z')]), ok([]), ok([])],
        [ok([junctionRow('AV-1'), junctionRow('AV-1'), junctionRow(null), junctionRow('AV-GONE')])],
        [ok([versionRow('AV-1', 'A-1', 'Report')])]
      ]);
      const review = await service.LoadSessionReview('SESSION-1', provider);
      expect(review?.Artifacts).toEqual([{ ArtifactID: 'A-1', ArtifactVersionID: 'AV-1', Name: 'Report' }]);
    });

    it('issues NO artifact queries when the chain has no caption details', async () => {
      mockRunViews([ok([sessionRow()]), ok([]), ok([]), ok([])]);
      const review = await service.LoadSessionReview('SESSION-1', provider);
      expect(review?.Artifacts).toEqual([]);
      expect(capturedCalls).toHaveLength(1);
    });

    it('degrades a failed junction query to an empty Artifacts list (review still loads)', async () => {
      mockRunViewsSequence([
        [ok([sessionRow()]), ok([detailRow('User', 'hi', '2026-06-10T10:01:00Z')]), ok([]), ok([])],
        [failed()]
      ]);
      const review = await service.LoadSessionReview('SESSION-1', provider);
      expect(review).not.toBeNull();
      expect(review?.Artifacts).toEqual([]);
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
    RecordingFileID: null,
    RecordingStartedAt: null,
    RecordingMedia: null,
    Turns: [],
    DelegatedRuns: [],
    ChannelStates: [],
    Legs: [],
    Artifacts: [],
    ...overrides
  };
}

function legFixture(overrides: Partial<RealtimeSessionReviewLeg> = {}): RealtimeSessionReviewLeg {
  return {
    SessionID: 'SESSION-1',
    StartedAt: new Date('2026-06-10T10:00:00Z'),
    ClosedAt: new Date('2026-06-10T10:31:00Z'),
    CloseReason: 'Explicit',
    Turns: [],
    DelegatedRuns: [],
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
        reviewTurn('User', 'first', new Date('2026-06-10T10:01:00Z')),
        reviewTurn('Assistant', 'third', new Date('2026-06-10T10:06:00Z'))
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
        reviewTurn('User', 'a', null),
        reviewTurn('Assistant', 'b', null)
      ],
      DelegatedRuns: [reviewRun('RUN-1', '2026-06-10T10:03:00Z')]
    });
    const items = BuildReviewThreadItems(review);
    expect(items.map(i => (i.Kind === 'caption' ? i.Text : i.Kind === 'delegation' ? i.Card.CallID : i.Label))).toEqual(['a', 'b', 'RUN-1']);
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

  it('renders a SINGLE leg with no divider (identical to the flat thread)', () => {
    const review = reviewFixture({
      Legs: [
        legFixture({
          Turns: [reviewTurn('User', 'hello', new Date('2026-06-10T10:01:00Z'))],
          DelegatedRuns: [reviewRun('RUN-1', '2026-06-10T10:03:00Z')]
        })
      ]
    });
    const items = BuildReviewThreadItems(review);
    expect(items.map(i => i.Kind)).toEqual(['caption', 'delegation']);
  });

  it('renders a DIVIDER between legs, stamped with the new leg start + the PREVIOUS leg\'s CloseReason', () => {
    const review = reviewFixture({
      Legs: [
        legFixture({
          SessionID: 'SESSION-A',
          CloseReason: 'Janitor',
          Turns: [reviewTurn('User', 'leg one', new Date('2026-06-10T10:01:00Z'))]
        }),
        legFixture({
          SessionID: 'SESSION-B',
          StartedAt: new Date('2026-06-10T11:00:00Z'),
          CloseReason: 'Explicit',
          Turns: [reviewTurn('Assistant', 'leg two', new Date('2026-06-10T11:01:00Z'))]
        })
      ]
    });
    const items = BuildReviewThreadItems(review);
    expect(items.map(i => i.Kind)).toEqual(['caption', 'divider', 'caption']);
    const divider = items[1];
    if (divider.Kind !== 'divider') {
      throw new Error('expected a divider');
    }
    expect(divider.Label).toBe('Session leg started');
    expect(divider.At?.toISOString()).toBe('2026-06-10T11:00:00.000Z');
    expect(divider.CloseReason).toBe('Janitor'); // why the PREVIOUS leg ended
    expect(divider.Icon).toContain('fa-');
  });

  it('keeps leg boundaries even when item timestamps interleave across legs', () => {
    // Leg B starts BEFORE leg A's last item timestamp — the divider must still sit between legs.
    const review = reviewFixture({
      Legs: [
        legFixture({ Turns: [reviewTurn('User', 'a-late', new Date('2026-06-10T12:00:00Z'))] }),
        legFixture({
          StartedAt: new Date('2026-06-10T11:00:00Z'),
          Turns: [reviewTurn('User', 'b-early', new Date('2026-06-10T11:30:00Z'))]
        })
      ]
    });
    const texts = BuildReviewThreadItems(review).map(i => (i.Kind === 'caption' ? i.Text : i.Kind));
    expect(texts).toEqual(['a-late', 'divider', 'b-early']);
  });
});

// ── Review→live continuation (StartLiveContinuation) ────────────────────────

describe('RealtimeSessionState.StartLiveContinuation', () => {
  function loadedState(): RealtimeSessionState {
    const state = new RealtimeSessionState();
    state.LoadHistoricalItems(
      BuildReviewThreadItems(
        reviewFixture({
          Turns: [reviewTurn('User', 'historical', new Date('2026-06-10T10:01:00Z'))],
          DelegatedRuns: [reviewRun('RUN-1', '2026-06-10T10:03:00Z')]
        })
      )
    );
    return state;
  }

  it('KEEPS the historical thread and appends the "Resumed live session" divider', () => {
    const state = loadedState();
    let changes = 0;
    state.Changed$.subscribe(() => changes++);

    state.StartLiveContinuation(new Date('2026-06-10T12:00:00Z'));

    expect(changes).toBe(1);
    expect(state.Items.map(i => i.Kind)).toEqual(['caption', 'delegation', 'divider']);
    const divider = state.Items[2];
    if (divider.Kind !== 'divider') {
      throw new Error('expected a divider');
    }
    expect(divider.Label).toBe('Resumed live session');
    expect(divider.At?.toISOString()).toBe('2026-06-10T12:00:00.000Z');
    expect(divider.CloseReason).toBeUndefined();
  });

  it('keeps the historical delegation cards in the rail (carryover, not a reset)', () => {
    const state = loadedState();
    state.StartLiveContinuation();
    expect(state.Cards.map(c => c.CallID)).toEqual(['RUN-1']);
    expect(state.ActiveCallId).toBeNull();
  });

  it('resets the caption bookkeeping so the NEW session\'s captions append AFTER the divider', () => {
    const state = loadedState();
    const captions$ = new Subject<VoiceCaption[]>();
    state.Attach({
      Captions$: captions$.asObservable(),
      DelegationProgress$: new Subject<VoiceDelegationProgress>().asObservable(),
      DelegationResult$: new Subject<VoiceDelegationResult>().asObservable(),
      DelegationNarration$: new Subject<VoiceDelegationNarration>().asObservable()
    });

    state.StartLiveContinuation();
    // The fresh session's caption stream starts EMPTY — must be a no-op, not a reset.
    captions$.next([]);
    expect(state.Items).toHaveLength(3);

    captions$.next([{ Role: 'User', Text: 'live turn' }]);
    expect(state.Items.map(i => i.Kind)).toEqual(['caption', 'delegation', 'divider', 'caption']);
    const live = state.Items[3];
    expect(live.Kind === 'caption' && live.Text).toBe('live turn');
  });

  it('drops any lingering narration (nothing is running yet in the new leg)', () => {
    const state = loadedState();
    (state as unknown as { Narration: string | null }).Narration = 'old note';
    state.StartLiveContinuation();
    expect(state.Narration).toBeNull();
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
        Turns: [reviewTurn('User', 'hello', new Date('2026-06-10T10:01:00Z'))],
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

describe('MergeChainChannelStates (multi-leg board restore)', () => {
  const wb = (json: string | null) => ({ ChannelName: 'Whiteboard', StateJson: json });

  it('an earlier leg\'s SAVED board survives a final leg that never saved one', () => {
    const merged = MergeChainChannelStates([
      [wb('{"version":2,"pages":[]}')], // leg 1 drew
      [wb(null)]                        // leg 2 (newest) never touched the board
    ]);
    expect(merged).toEqual([wb('{"version":2,"pages":[]}')]);
  });

  it('the NEWEST leg with a saved state wins per channel', () => {
    const merged = MergeChainChannelStates([
      [wb('{"old":true}')],
      [wb('{"new":true}')],
      [wb('')] // newest, empty — registers nothing
    ]);
    expect(merged).toEqual([wb('{"new":true}')]);
  });

  it('channel names dedupe case-insensitively and other channels merge independently', () => {
    const merged = MergeChainChannelStates([
      [{ ChannelName: 'whiteboard', StateJson: '{"a":1}' }, { ChannelName: 'Notes', StateJson: null }],
      [{ ChannelName: 'Whiteboard', StateJson: null }, { ChannelName: 'Notes', StateJson: '{"n":1}' }]
    ]);
    expect(merged).toHaveLength(2);
    expect(merged.find(s => s.ChannelName.toLowerCase() === 'whiteboard')?.StateJson).toBe('{"a":1}');
    expect(merged.find(s => s.ChannelName === 'Notes')?.StateJson).toBe('{"n":1}');
  });

  it('channels no leg ever saved keep a null-state entry (existence still reviewable)', () => {
    expect(MergeChainChannelStates([[wb(null)], [wb(null)]])).toEqual([wb(null)]);
  });

  it('tolerates empty chains and blank channel names', () => {
    expect(MergeChainChannelStates([])).toEqual([]);
    expect(MergeChainChannelStates([[{ ChannelName: '  ', StateJson: '{"x":1}' }]])).toEqual([]);
  });
});
