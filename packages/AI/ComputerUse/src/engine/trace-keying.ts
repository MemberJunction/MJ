/**
 * Decides which execution tier a test runs in, keyed by testId and validated
 * against the `{appBuildHash, appVersion, goalHash}` stamped at record time.
 *
 * Invalidation is graceful rather than binary: an exact build match replays; a
 * changed or unknown build replays with heal expected, since most builds don't
 * change most screens; only persistent drift (heal rate over threshold) demotes
 * to the LLM tier to re-derive and re-record.
 *
 * Build identity is optional — when absent on either side an exact match can't
 * be proven, so the safe `replay-with-heal` default applies. Pure and app-agnostic.
 */

import { ComputerUseTrace } from '../types/trace.js';
import { hashGoal } from './trace-recorder.js';

/**
 * Execution tier for a test on a given run:
 * - `'replay'`           — deterministic replay, no heal expected (exact build match).
 * - `'replay-with-heal'` — replay, but tolerate per-step self-heal on drift.
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
