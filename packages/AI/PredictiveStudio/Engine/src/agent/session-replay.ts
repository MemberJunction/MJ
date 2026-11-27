/**
 * @module agent/session-replay
 *
 * `AgentSessionReplay` — re-executes a Model Development Agent session from its decision log (PR 5, A4; §5.1.6, D5-2,
 * D5-24). Every row of the session, across all its runs, is applied in `Step` order with the *recorded* outputs: the
 * plan a prompt produced since the previous row (`prompt-output`, from the row's `PromptRunID`), and each transition's
 * recorded tool result (the drafts, the presented plan, the claim), through the same effect code the orchestrator runs
 * ({@link AgentSessionReplay.ApplyCall}). No LLM is called; vendor sampling is not reproducible, so a live re-call
 * would not be a replay.
 *
 * The plan hash is compared at every step: before a row (its `PayloadHash`, or its recorded prompt output's hash) and
 * after it (its `ResultingPayloadHash`). A row whose recorded output does not reproduce the logged hash, or whose
 * prompt run no longer exists, makes the replay `replay-incomplete`. A run whose payload is behind the log rebuilds it
 * here ({@link AgentSessionReplay.Rebuild}).
 */
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { EscapeSQLString, UUIDSet } from '@memberjunction/global';
import { RunView } from '@memberjunction/core';
import { JsonParse, type AgentDecisionToolCall, type JsonObject, type JsonValue, type ProtocolDraftMembers, type UnitDraft } from '@memberjunction/predictive-studio-core';

import { DraftEvaluationProtocolAction } from '../actions/draft-evaluation-protocol.action';
import { AgentControlPath, DRAFT_PROTOCOL_ACTION_NAME, DRAFT_UNIT_ACTION_NAME } from './control-path';
import { AgentDecisionLog, type LoggedDecision } from './decision-log';
import type { PredictiveStudioBuilderPayload } from './pipeline-builder-agent';

/** What replay returns: the final plan's hash and the steps applied, or why the log cannot reproduce it. */
export type ReplayResult =
  | { readonly planHash: string; readonly steps: number }  // case-violation-ok-legacy-back-compat: contract JSON shape (D-039)
  | ReplayIncomplete;

/** The log does not reproduce its session: a prompt run it names is gone, or a recorded output no longer gives its hash. */
// case-violation-ok-legacy-back-compat: contract JSON shape (D-039)
export type ReplayIncomplete = { readonly kind: 'replay-incomplete'; readonly missingPromptRunIds: readonly string[] };

/** A session rebuilt from its log: the payload, its plan hash and the steps applied. */
export interface ReplayedSession {
  readonly Payload: PredictiveStudioBuilderPayload;
  readonly PlanHash: string;
  readonly Steps: number;
}

/** The recorded tool calls the effects are keyed by. */
export const PROMPT_OUTPUT_CALL = 'prompt-output';
export const PRESENT_PLAN_CALL = 'present-plan';
export const CLAIM_CALL = 'claim';

/** Replay of a session from its decision log. */
export class AgentSessionReplay {
  /** Replays session `sessionRunId` from its rows (read fresh): the final plan's hash, with no LLM call. */
  public static async Replay(sessionRunId: string, provider: IMetadataProvider, contextUser: UserInfo): Promise<ReplayResult> {
    return AgentSessionReplay.ReplayRows(await AgentDecisionLog.Rows(sessionRunId, provider, contextUser), provider, contextUser);
  }

  /** {@link Replay} over given rows (a copy, a test, the gate's tampered copy). */
  public static async ReplayRows(rows: readonly LoggedDecision[], provider: IMetadataProvider, contextUser: UserInfo): Promise<ReplayResult> {
    const rebuilt = await AgentSessionReplay.RebuildRows(rows, provider, contextUser);
    return 'kind' in rebuilt ? rebuilt : { planHash: rebuilt.PlanHash, steps: rebuilt.Steps };
  }

  /** The payload session `sessionRunId`'s log reproduces (what a run behind the log continues from). */
  public static async Rebuild(sessionRunId: string, provider: IMetadataProvider, contextUser: UserInfo): Promise<ReplayedSession | ReplayIncomplete> {
    return AgentSessionReplay.RebuildRows(await AgentDecisionLog.Rows(sessionRunId, provider, contextUser), provider, contextUser);
  }

  /** {@link Rebuild} over given rows: every prompt run they name must exist, then {@link Fold}. */
  public static async RebuildRows(rows: readonly LoggedDecision[], provider: IMetadataProvider, contextUser: UserInfo): Promise<ReplayedSession | ReplayIncomplete> {
    const missing = await AgentSessionReplay.missingPromptRuns(rows, provider, contextUser);
    if (missing.length > 0) return { kind: 'replay-incomplete', missingPromptRunIds: missing };
    return AgentSessionReplay.Fold(rows);
  }

  /** Applies `rows` in `Step` order from an empty payload, comparing the plan hash before and after every row (pure). */
  public static Fold(rows: readonly LoggedDecision[]): ReplayedSession | ReplayIncomplete {
    let payload = AgentSessionReplay.emptyPayload();
    const ordered = [...rows].sort((a, b) => a.Step - b.Step);
    for (const [i, row] of ordered.entries()) {
      const before = AgentSessionReplay.applyPromptOutput(payload, row, i === 0);
      if (before === null) return AgentSessionReplay.diverged(row);
      payload = row.ToolCalls.filter((c) => c.action !== PROMPT_OUTPUT_CALL).reduce((p, c) => AgentSessionReplay.ApplyCall(p, c), before);
      if (AgentControlPath.PlanHash(payload) !== row.ResultingPayloadHash) return AgentSessionReplay.diverged(row);
    }
    return { Payload: payload, PlanHash: AgentControlPath.PlanHash(payload), Steps: ordered.length };
  }

  /**
   * One recorded tool call's effect on the payload — the code the orchestrator runs when it applies the transition, so
   * a replay re-executes it: the plan a prompt produced, a unit or protocol draft with the hash of its inputs, the
   * presented plan's hash and id, the build's claim. Other calls (a profile, a decline) leave the payload unchanged.
   */
  public static ApplyCall(payload: PredictiveStudioBuilderPayload, call: AgentDecisionToolCall): PredictiveStudioBuilderPayload {
    const result = JsonParse.IsJsonObject(call.result) ? call.result : null;
    if (!result) return payload;
    switch (call.action) {
      case PROMPT_OUTPUT_CALL: return AgentSessionReplay.withContent(payload, JsonParse.JsonObjectField(result, 'content'));
      case DRAFT_UNIT_ACTION_NAME: {
        const unit: UnitDraft | null = DraftEvaluationProtocolAction.UnitDraftOf(JsonParse.JsonObjectField(result, 'UnitDraft') || undefined);
        return unit === null ? payload : { ...payload, UnitDraft: unit, ProtocolDraft: undefined, DraftInputs: { Unit: call.paramsHash || '', Protocol: null } };
      }
      case DRAFT_PROTOCOL_ACTION_NAME: {
        const json = JsonParse.JsonObjectField(result, 'ProtocolDraft');
        if (!json || !payload.UnitDraft || !payload.DraftInputs) return payload;
        const protocol: ProtocolDraftMembers | null = DraftEvaluationProtocolAction.ProtocolDraftOf(json, payload.UnitDraft);
        return protocol === null ? payload : { ...payload, ProtocolDraft: protocol, DraftInputs: { Unit: payload.DraftInputs.Unit, Protocol: call.paramsHash } };
      }
      case PRESENT_PLAN_CALL: return { ...payload, PlanHash: AgentControlPath.PlanHash(payload), PlanId: JsonParse.JsonString(result, 'PlanId') || payload.PlanId };
      case CLAIM_CALL: return { ...payload, BuildClaimID: JsonParse.JsonString(result, 'claimId') || payload.BuildClaimID };
      default: return payload;
    }
  }

  /** The plan content of `payload` as recorded JSON (its {@link AgentControlPath.PLAN_CONTENT_KEYS} slices). */
  public static ContentOf(payload: PredictiveStudioBuilderPayload): JsonObject {
    const content = Object.fromEntries(Object.entries(payload).filter(([k, v]) => AgentControlPath.PLAN_CONTENT_KEYS.includes(k) && v !== undefined));
    const parsed = JsonParse.ParseJsonText(JSON.stringify(content), 'plan content');
    return parsed.Ok && JsonParse.IsJsonObject(parsed.Value) ? parsed.Value : {};
  }

  /** JSON text of a typed value as a recorded {@link JsonValue}. */
  public static ToJson(value: object): JsonValue {
    const parsed = JsonParse.ParseJsonText(JSON.stringify(value), 'recorded result');
    return parsed.Ok ? parsed.Value : null;
  }

  /**
   * The payload with the row's recorded prompt output applied, checked against the hash it must give: the output's own
   * hash, or — when the row has none — the row's `PayloadHash` (the previous row's result; not checked on the first
   * row, which always records its prompt output). Null when the hash does not match.
   */
  private static applyPromptOutput(payload: PredictiveStudioBuilderPayload, row: LoggedDecision, first: boolean): PredictiveStudioBuilderPayload | null {
    const output = row.ToolCalls.find((c) => c.action === PROMPT_OUTPUT_CALL);
    if (!output) return first || AgentControlPath.PlanHash(payload) === row.PayloadHash ? payload : null;
    const next = AgentSessionReplay.ApplyCall(payload, output);
    return AgentControlPath.PlanHash(next) === output.paramsHash ? next : null;
  }

  /** `payload` with its plan content replaced by the recorded `content`. */
  private static withContent(payload: PredictiveStudioBuilderPayload, content: JsonObject | null): PredictiveStudioBuilderPayload {
    if (!content) return payload;
    const kept = Object.entries(payload).filter(([k]) => !AgentControlPath.PLAN_CONTENT_KEYS.includes(k));
    const merged: object = { ...Object.fromEntries(kept), ...content };
    return AgentSessionReplay.isPayload(merged) ? merged : payload;
  }

  /** The payload a session starts from: nothing yet (the first row records the plan its prompt produced). */
  private static emptyPayload(): PredictiveStudioBuilderPayload {
    const empty: object = {};
    if (AgentSessionReplay.isPayload(empty)) return empty;
    throw new Error('unreachable: an empty object is a payload object');
  }

  /** The payload object guard (the payload is a JSON object; its slices are the recorded ones). */
  private static isPayload(value: object): value is PredictiveStudioBuilderPayload {
    return !Array.isArray(value);
  }

  /** A row the log cannot reproduce: named by its prompt run when it has one. */
  private static diverged(row: LoggedDecision): ReplayIncomplete {
    return { kind: 'replay-incomplete', missingPromptRunIds: row.PromptRunID ? [row.PromptRunID] : [] };
  }

  /** The prompt runs the rows name that no longer exist (read fresh). */
  private static async missingPromptRuns(rows: readonly LoggedDecision[], provider: IMetadataProvider, contextUser: UserInfo): Promise<string[]> {
    const seen = new UUIDSet();
    const named = rows.flatMap((r) => (r.PromptRunID && !seen.Has(r.PromptRunID) ? (seen.Add(r.PromptRunID), [r.PromptRunID]) : []));
    if (named.length === 0) return [];
    const result = await RunView.FromMetadataProvider(provider).RunView<{ readonly ID: string }>({
      EntityName: 'MJ: AI Prompt Runs', ExtraFilter: `ID IN (${named.map((id) => `'${EscapeSQLString(id)}'`).join(', ')})`, Fields: ['ID'], ResultType: 'simple', BypassCache: true,
    }, contextUser);
    if (!result.Success) throw new Error(`Predictive Studio: reading a session's prompt runs failed: ${result.ErrorMessage || 'unknown error'}`);
    const found = new UUIDSet(result.Results.map((r) => r.ID));
    return named.filter((id) => !found.Has(id));
  }
}
