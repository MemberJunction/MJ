/**
 * JoinProbe — verify a candidate key against the data before emitting it.
 *
 * Every key DBAutoDoc writes into `additionalSchemaInfo` is a claim that a join
 * works. Until this module existed, two of the three paths that emit keys never
 * checked that claim:
 *
 *   - the ORGANIC path (SemanticPhase → Composer → OrganicKeyTranslator) reasons
 *     from LLM concept names and embedding distance and emits whatever it formed;
 *   - the LLM-PROPOSED FK path (AnalysisEngine.applyStructuredInsights) stamps a
 *     candidate `status: 'confirmed'` with a literal `valueOverlap: 0` placeholder;
 *   - only the STATISTICAL FK path (FKDetector.analyzeFKCandidate) probed, via
 *     `testValueOverlap` + its 75% GATE 6.
 *
 * A key that matches nothing is worse than a missing key: the join it generates
 * returns an empty result with no error, which is indistinguishable from a true
 * negative for every downstream consumer.
 *
 * ── What is probed ───────────────────────────────────────────────────────────
 * One query per candidate edge, returning exactly two integers: how many distinct
 * non-null child values were sampled, and how many of those exist in the parent
 * column. That is the containment ratio, and it is the whole measurement.
 *
 * ── Never read customer data values ──────────────────────────────────────────
 * The probe returns counts and nothing else. There is no code path here that can
 * surface a value, a sample row, or a masked select — {@link JoinProbeResult}
 * carries no value-bearing field, and the driver contract
 * ({@link BaseAutoDocDriver.ProbeJoinContainment}) returns two numbers. "4,812 of
 * 5,000 matched" is the maximum resolution this module is capable of.
 *
 * ── The bound ────────────────────────────────────────────────────────────────
 * An unbounded probe over a wide schema is how DBAutoDoc burns its budget, so the
 * cost is capped three ways, all configurable:
 *
 *   1. per-probe row bound   — the child sample is capped at `sampleSize`
 *                              (default 1000 distinct values);
 *   2. per-run probe count   — at most `maxProbes` probes per run (default 500),
 *                              after which every remaining candidate is Unprobed;
 *   3. per-probe timeout     — `probeTimeoutMs` (default 5000), after which that
 *                              one probe is Unprobed and the run continues.
 *
 * ── Refusal behaviour ────────────────────────────────────────────────────────
 * The three outcomes are deliberately distinct, because conflating the last two
 * is the defect this module exists to remove:
 *
 *   Verified  containment >= minContainment. Emit, stamped with the counts.
 *   Refuted   the probe RAN and measured containment below the floor. Do NOT emit.
 *   Unprobed  the probe could not run — no permission, timeout, budget exhausted,
 *             incomparable types, missing table. EMIT, stamped `Unprobed` with the
 *             reason, and never stamped Verified.
 *
 * Emitting on Unprobed is the deliberate choice. Refusing to emit whenever the
 * probe cannot run converts a permissions or timeout problem into total key loss
 * with no signal — which is precisely the failure mode of emitting nothing
 * silently. So the engine refuses only on measured refutation; it never refuses
 * out of ignorance, and it never claims a verification it did not perform.
 */

import { BaseAutoDocDriver, DriverProbeOutcome } from '../drivers/BaseAutoDocDriver.js';
import { KeyProvenance, KeyVerificationStamp, KeyVerificationStatus } from '../types/discovery.js';
import { KeyVerificationConfig } from '../types/config.js';

export type { KeyProvenance, KeyVerificationStamp, KeyVerificationStatus, KeyVerificationConfig };

/** Counts only. There is deliberately no field here that can carry a value. */
export interface JoinContainment {
    /** Distinct non-null child values the probe sampled (bounded by `sampleSize`). */
    SampledValues: number;
    /** How many of those exist in the parent column. */
    MatchedValues: number;
    /** matchedValues / sampledValues, or 0 when nothing was sampled. */
    Containment: number;
}

/** The verdict on one candidate edge. */
export interface JoinProbeResult {
    Status: KeyVerificationStatus;
    /** Populated for Verified and Refuted; null for Unprobed — no measurement exists. */
    Containment: JoinContainment | null;
    /** Always populated: why it verified, why it was refuted, or why it could not run. */
    Reason: string;
    ProbedAt: string;
}

/** One end of a candidate edge. */
export interface ColumnRef {
    Schema: string;
    Table: string;
    Column: string;
}

/** A candidate key edge: do the child's values exist in the parent's column? */
export interface KeyCandidate {
    Child: ColumnRef;
    Parent: ColumnRef;
}

/** Resolved defaults for {@link KeyVerificationConfig}. */
export const DEFAULT_KEY_VERIFICATION: Required<KeyVerificationConfig> = {
    enabled: true,
    sampleSize: 1000,
    maxProbes: 500,
    probeTimeoutMs: 5000,
    minContainment: 0.05,
};

/** How many probes a run has spent, and whether the cap has been reached. */
export interface ProbeBudget {
    ProbesUsed: number;
    ProbesAllowed: number;
    Exhausted: boolean;
    /** Probes that returned a measurement (Verified or Refuted). */
    Measured: number;
    /** Candidates that could not be measured, by reason. */
    Unprobed: number;
}

function refRefersToSame(a: ColumnRef, b: ColumnRef): boolean {
    return (
        a.Schema.toLowerCase() === b.Schema.toLowerCase() &&
        a.Table.toLowerCase() === b.Table.toLowerCase() &&
        a.Column.toLowerCase() === b.Column.toLowerCase()
    );
}

/** Stable cache key for an edge, so the same candidate is never probed twice in a run. */
export function CandidateKey(c: KeyCandidate): string {
    const f = (r: ColumnRef) => `${r.Schema}.${r.Table}.${r.Column}`.toLowerCase();
    return `${f(c.Child)}->${f(c.Parent)}`;
}

/**
 * Verifies candidate key edges against the live database, under a fixed budget.
 *
 * One instance per analysis run: the probe cap and the result cache are per-run
 * state, so sharing an instance across the organic and FK paths is what keeps the
 * total cost bounded rather than bounded-per-path.
 */
export class KeyVerifier {
    private readonly cfg: Required<KeyVerificationConfig>;
    private readonly cache = new Map<string, JoinProbeResult>();
    private probesUsed = 0;
    private measured = 0;
    private unprobedCount = 0;

    constructor(
        private readonly driver: BaseAutoDocDriver | null,
        config: KeyVerificationConfig = {},
    ) {
        this.cfg = { ...DEFAULT_KEY_VERIFICATION, ...stripUndefined(config) };
    }

    public get Budget(): ProbeBudget {
        return {
            ProbesUsed: this.probesUsed,
            ProbesAllowed: this.cfg.maxProbes,
            Exhausted: this.probesUsed >= this.cfg.maxProbes,
            Measured: this.measured,
            Unprobed: this.unprobedCount,
        };
    }

    /** The resolved configuration, so callers can report the bound they ran under. */
    public get ResolvedConfig(): Required<KeyVerificationConfig> {
        return { ...this.cfg };
    }

    /**
     * Verify one candidate edge. Never throws: a probe that cannot run comes back
     * as `Unprobed` with a reason, which callers must not treat as a refutation.
     */
    public async Verify(candidate: KeyCandidate): Promise<JoinProbeResult> {
        const ck = CandidateKey(candidate);
        const cached = this.cache.get(ck);
        if (cached) return cached;

        const result = await this.runProbe(candidate);
        this.cache.set(ck, result);
        if (result.Status === 'Unprobed') this.unprobedCount += 1;
        else this.measured += 1;
        return result;
    }

    /**
     * Verify many candidates, sequentially so the per-run bound is honored exactly.
     * Returns a map keyed by {@link CandidateKey}.
     */
    public async VerifyAll(candidates: KeyCandidate[]): Promise<Map<string, JoinProbeResult>> {
        const out = new Map<string, JoinProbeResult>();
        for (const c of candidates) {
            out.set(CandidateKey(c), await this.Verify(c));
        }
        return out;
    }

    private async runProbe(candidate: KeyCandidate): Promise<JoinProbeResult> {
        const probedAt = new Date().toISOString();

        if (!this.cfg.enabled) {
            return unprobed('key verification disabled by configuration', probedAt);
        }
        if (!this.driver) {
            return unprobed('no database driver available to probe', probedAt);
        }
        if (refRefersToSame(candidate.Child, candidate.Parent)) {
            return unprobed('child and parent are the same column', probedAt);
        }
        if (this.probesUsed >= this.cfg.maxProbes) {
            return unprobed(
                `probe budget exhausted (${this.cfg.maxProbes} probes used); candidate not verified`,
                probedAt,
            );
        }

        this.probesUsed += 1;
        const outcome: DriverProbeOutcome = await this.driver.ProbeJoinContainment(
            candidate.Child,
            candidate.Parent,
            this.cfg.sampleSize,
            this.cfg.probeTimeoutMs,
        );

        if (outcome.Ok !== true) {
            // A failed probe is NOT zero containment. This distinction is the whole
            // point of the discriminated union: `testValueOverlap` returns a bare
            // number and swallows its errors as 0, which the 75% gate then reads as
            // a refutation — so on PostgreSQL an incomparable `text = uuid` join
            // silently deletes a candidate instead of reporting that it could not
            // be compared.
            return unprobed(outcome.Reason, probedAt);
        }

        const sampledValues = outcome.SampledValues;
        const matchedValues = outcome.MatchedValues;
        if (sampledValues === 0) {
            return unprobed('child column has no non-null values to sample', probedAt);
        }

        const containment = matchedValues / sampledValues;
        const measurement: JoinContainment = { SampledValues: sampledValues, MatchedValues: matchedValues, Containment: containment };
        const pct = (containment * 100).toFixed(1);

        if (containment < this.cfg.minContainment) {
            return {
                Status: 'Refuted',
                Containment: measurement,
                Reason: `${matchedValues} of ${sampledValues} sampled values matched (${pct}%), below the ${(this.cfg.minContainment * 100).toFixed(1)}% floor`,
                ProbedAt: probedAt,
            };
        }

        return {
            Status: 'Verified',
            Containment: measurement,
            Reason: `${matchedValues} of ${sampledValues} sampled values matched (${pct}%)`,
            ProbedAt: probedAt,
        };
    }
}

/** Build the persisted stamp for an emitted key from a probe result. */
export function StampFor(
    provenance: KeyProvenance,
    result: JoinProbeResult,
): KeyVerificationStamp {
    return {
        Provenance: provenance,
        Verification: result.Status,
        VerifiedAt: result.ProbedAt,
        MatchedRows: result.Containment ? result.Containment.MatchedValues : null,
        SampledRows: result.Containment ? result.Containment.SampledValues : null,
        VerificationNote: result.Reason,
    };
}

function unprobed(reason: string, probedAt: string): JoinProbeResult {
    return { Status: 'Unprobed', Containment: null, Reason: reason, ProbedAt: probedAt };
}

function stripUndefined(c: KeyVerificationConfig): KeyVerificationConfig {
    const out: KeyVerificationConfig = {};
    if (c.enabled !== undefined) out.enabled = c.enabled;
    if (c.sampleSize !== undefined) out.sampleSize = c.sampleSize;
    if (c.maxProbes !== undefined) out.maxProbes = c.maxProbes;
    if (c.probeTimeoutMs !== undefined) out.probeTimeoutMs = c.probeTimeoutMs;
    if (c.minContainment !== undefined) out.minContainment = c.minContainment;
    return out;
}
