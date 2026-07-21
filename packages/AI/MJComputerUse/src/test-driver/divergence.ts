/**
 * Self-report vs judge vs oracle divergence (CU-D7) — pure, no I/O.
 *
 * The field's replication crisis (browser-use 89%→60% on re-run; 20–50%
 * self-report inflation) was caught by keeping the controller's self-assessment,
 * the judge's verdict, and the deterministic oracle outcomes as SEPARATE signals
 * and watching their divergence — not by merging everything into one status.
 * This computes the three per-run signals + their pairwise agreement so a suite
 * run can aggregate a live judge-error estimate and alarm on trend shifts (a
 * prompt/model change that inflates judge↔self-report agreement is a regression
 * even if pass rates "improve").
 *
 * Pure so the agreement logic is unit-testable; the driver extracts the signals
 * and stamps the report on the run's actualOutput.
 */

/** The three independent "did the goal succeed?" signals for a run. */
export interface DivergenceSignals {
    /** The controller believed it was done (requested judgement with no further actions). */
    selfReportDone: boolean;
    /** The judge's final verdict was Done. */
    judgeDone: boolean;
    /** Every gating (non-advisory) oracle passed. */
    oraclesPassed: boolean;
}

/** The signals plus their pairwise agreement — stamped on actualOutput. */
export interface DivergenceReport extends DivergenceSignals {
    selfVsJudgeAgree: boolean;
    judgeVsOracleAgree: boolean;
    selfVsOracleAgree: boolean;
    /** True when all three signals agree (the healthy case). */
    unanimous: boolean;
}

/** Compute the pairwise-agreement report from the three signals (CU-D7). */
export function computeDivergence(s: DivergenceSignals): DivergenceReport {
    const selfVsJudgeAgree = s.selfReportDone === s.judgeDone;
    const judgeVsOracleAgree = s.judgeDone === s.oraclesPassed;
    const selfVsOracleAgree = s.selfReportDone === s.oraclesPassed;
    return {
        ...s,
        selfVsJudgeAgree,
        judgeVsOracleAgree,
        selfVsOracleAgree,
        unanimous: selfVsJudgeAgree && judgeVsOracleAgree,
    };
}
