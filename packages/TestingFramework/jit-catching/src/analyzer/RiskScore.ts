import type { IntentType } from '../types';

export interface RiskScoreInput { ChangedPaths: string[]; IntentType: IntentType; CommitPrefix: string | null; ChangedSourceLines: number; PackageCount: number; RiskPaths: string[]; }
const BEHAVIOR_SHOULD_NOT_CHANGE = new Set<string>(['refactor', 'perf', 'dead_code_removal']);

/** §6 risk score: +3 once for a risky path, +2 for refactor/perf/dead-code intent, +lines/500 (≤2), +0.5 per package (≤2). */
export function ComputeRiskScore(i: RiskScoreInput): number {
    let score = 0;
    if (i.ChangedPaths.some((p) => i.RiskPaths.some((r) => p === r || p.startsWith(r)))) score += 3;
    if (BEHAVIOR_SHOULD_NOT_CHANGE.has(i.IntentType) || (i.CommitPrefix !== null && BEHAVIOR_SHOULD_NOT_CHANGE.has(i.CommitPrefix))) score += 2;
    score += Math.min(2, i.ChangedSourceLines / 500);
    score += Math.min(2, i.PackageCount * 0.5);
    return score;
}
