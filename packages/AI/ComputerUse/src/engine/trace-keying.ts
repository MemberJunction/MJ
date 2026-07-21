/**
 * Cache keying & invalidation (CU-C4) — decide which tier a test runs in.
 *
 * Stagehand's field lessons, encoded as a pure policy:
 *  - Key by testId (URL-keying is defeated by per-record UUIDs — trace-url.ts
 *    handles URL normalization separately).
 *  - Validate on load by {appBuildHash, appVersion, goalHash} stamped at record
 *    time (CU-C1). Goal text is frozen fixture data: a reword demotes to the
 *    LLM tier and forces a re-record.
 *  - Invalidation is graceful, not binary: an exact build match replays; a
 *    changed/unknown build replays WITH heal expected (most builds don't change
 *    most screens — CU-C3 heals the few that drifted); only a test whose heal
 *    rate has crossed a threshold (persistent drift) is demoted to the LLM tier
 *    to re-derive and re-record.
 *
 * `appBuildHash` for a dev/regression stack is the plan's open question (a
 * dist-manifest hash the sibling build pipeline exposes). This policy needs no
 * such hash to be useful: when build identity is absent on either side it
 * cannot prove an exact match, so it returns `replay-with-heal` — the correct,
 * safe default. Wiring a real build hash later only *upgrades* matching tests
 * to the zero-heal `replay` tier; nothing here changes.
 *
 * Pure and app-agnostic.
 */

import { ComputerUseTrace } from '../types/trace.js';
import { hashGoal } from './trace-recorder.js';

/**
 * Execution tier for a test on a given run:
 * - `'replay'`           — deterministic replay, no heal expected (exact build match).
 * - `'replay-with-heal'` — replay, but tolerate per-step self-heal (CU-C3) on drift.
 * - `'llm'`              — full LLM controller (today's engine); records on pass.
 */
export type ReplayTier = 'replay' | 'replay-with-heal' | 'llm';

/** Default heal-rate at/above which a test is demoted from replay to the LLM tier. */
export const DEFAULT_HEAL_RATE_DEMOTE_THRESHOLD = 0.5;

export interface TierDecisionInput {
    /** The recorded trace for this test, or null/undefined when none exists. */
    trace?: ComputerUseTrace | null;
    /** The test's current (live) goal text — hashed and compared to the trace's GoalHash. */
    currentGoal: string;
    /** The current build identity (opaque). Empty/undefined when the stack can't provide one. */
    currentBuildHash?: string;
    /** The current app/version identity (opaque). Advisory alongside the build hash. */
    currentAppVersion?: string;
    /**
     * Rolling heal rate for this test from recent replays (0..1); undefined when
     * unknown (first replay, no telemetry). A high value means the cached
     * trajectory keeps drifting — re-derive rather than heal every step.
     */
    healRate?: number;
    /** Demote to the LLM tier when {@link healRate} ≥ this (default 0.5). */
    healRateThreshold?: number;
}

export interface TierDecision {
    tier: ReplayTier;
    reason: string;
}

/** Whether the live goal text still matches the trace's frozen goal hash. */
export function goalMatchesTrace(trace: ComputerUseTrace, currentGoal: string): boolean {
    return trace.GoalHash === hashGoal(currentGoal);
}

/**
 * Decide the execution tier for a test. Precedence (first match wins):
 *   1. No trace                     → llm
 *   2. Goal reworded since record   → llm (re-derive & re-record)
 *   3. Heal rate over threshold     → llm (persistent drift)
 *   4. Exact build-hash match       → replay
 *   5. Otherwise                    → replay-with-heal (default; build differs/unknown)
 */
export function decideReplayTier(input: TierDecisionInput): TierDecision {
    const { trace, currentGoal, currentBuildHash, healRate } = input;
    const threshold = input.healRateThreshold ?? DEFAULT_HEAL_RATE_DEMOTE_THRESHOLD;

    if (!trace) {
        return { tier: 'llm', reason: 'no recorded trace for this test' };
    }
    if (!goalMatchesTrace(trace, currentGoal)) {
        return { tier: 'llm', reason: 'goal text changed since record — re-derive and re-record' };
    }
    if (healRate !== undefined && healRate >= threshold) {
        return {
            tier: 'llm',
            reason: `heal rate ${(healRate * 100).toFixed(0)}% ≥ ${(threshold * 100).toFixed(0)}% — UI drifted past the cache; re-record`,
        };
    }

    const recordedBuild = trace.AppBuildHash?.trim();
    const liveBuild = currentBuildHash?.trim();
    if (recordedBuild && liveBuild && recordedBuild === liveBuild) {
        return { tier: 'replay', reason: 'exact build match — deterministic replay, no heal expected' };
    }

    return {
        tier: 'replay-with-heal',
        reason: liveBuild || recordedBuild
            ? 'build identity differs from record — replay with heal expected'
            : 'build identity unavailable — replay with heal expected (default)',
    };
}
