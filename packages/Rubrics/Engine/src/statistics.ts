export interface CriterionConsensus {
    Key: string;
    Mean: number | null;
    StdDev: number | null;
    Range: number | null;
    SampleSize: number;
}

export interface ConsensusResult {
    Method: 'Mean' | 'Median' | 'TrimmedMean';
    Overall: number | null;
    StdDev: number | null;
    Range: number | null;
    SampleSize: number;
    Criteria?: CriterionConsensus[];
}

/**
 * Overall consensus of normalized scores. Mean matches the SQL view's average.
 * TrimmedMean drops the floor(p * n) scores from each end. Population standard
 * deviation and the range are the disagreement measures.
 */
/** Per-criterion mean, spread, and range. Subjects line up by index across criteria. */
export function CriterionConsensus(criteria: { key: string; scores: (number | null)[] }[]): CriterionConsensus[] {
    return criteria.map(item => {
        const scored = item.scores.filter((value): value is number => value !== null);
        if (scored.length === 0) return { Key: item.key, Mean: null, StdDev: null, Range: null, SampleSize: 0 };
        const sorted = [...scored].sort((a, b) => a - b);
        return { Key: item.key, Mean: mean(scored), StdDev: populationStdDev(scored), Range: sorted[sorted.length - 1] - sorted[0], SampleSize: scored.length };
    });
}

export function GetConsensus(scores: number[], method: ConsensusResult['Method'] = 'Mean', trim = 0.1, criteria?: { key: string; scores: (number | null)[] }[]): ConsensusResult {
    const sample = [...scores].sort((a, b) => a - b);
    const n = sample.length;
    if (n === 0) return { Method: method, Overall: null, StdDev: null, Range: null, SampleSize: 0, Criteria: criteria ? CriterionConsensus(criteria) : undefined };
    const used = method === 'TrimmedMean' ? trimEnds(sample, trim) : sample;
    const overall = method === 'Median' ? median(sample) : mean(used);
    return {
        Method: method,
        Overall: overall,
        StdDev: populationStdDev(sample),
        Range: sample[n - 1] - sample[0],
        SampleSize: n,
        Criteria: criteria ? CriterionConsensus(criteria) : undefined,
    };
}

export interface AgreementResult {
    Withheld: boolean;
    SampleSize: number;
    MinimumSample: number;
    Kappa?: number;
    Alpha?: number;
}

/**
 * Agreement between paired ratings. Quadratic-weighted Cohen's kappa is for
 * two raters. Krippendorff's alpha (ordinal) is for two or more. Both are
 * omitted when the number of subjects is below the floor. The sample size is
 * always returned, so a withheld result is not a bare statistic.
 */
export function GetAgreement(ratings: number[][], minimumSample = 20): AgreementResult {
    const sampleSize = ratings.length;
    if (sampleSize < minimumSample) return { Withheld: true, SampleSize: sampleSize, MinimumSample: minimumSample };
    const pairs = ratings.filter(row => row.length >= 2).map(row => [row[0], row[1]] as const);
    return {
        Withheld: false,
        SampleSize: sampleSize,
        MinimumSample: minimumSample,
        Kappa: pairs.length > 0 ? QuadraticKappa(pairs) : undefined,
        Alpha: KrippendorffAlpha(ratings),
    };
}

export interface DiagnosticFlag {
    CriterionKey: string;
    /** Set on HighCorrelation so the pair is named, not only the first key. */
    OtherKey?: string;
    Flag: 'NoDiscrimination' | 'RangeCollapse' | 'HighCorrelation' | 'MostlyNotApplicable' | 'InsufficientData';
}

/** Item analysis. Flags are attached to the criterion key. InsufficientData is n < 20. */
export function GetDiagnostics(criteria: { key: string; scores: (number | null)[]; notApplicable: number }[]): DiagnosticFlag[] {
    const flags: DiagnosticFlag[] = [];
    for (const [index, item] of criteria.entries()) {
        const others = criteria.filter((_, other) => other !== index);
        const rest = item.scores.map((_, scoreIndex) => {
            const values = others.map(other => other.scores[scoreIndex]).filter((value): value is number => value !== null);
            return values.length === 0 ? null : mean(values);
        });
        const scored = item.scores.filter((value): value is number => value !== null);
        const n = item.scores.length;
        if (n < 20) flags.push({ CriterionKey: item.key, Flag: 'InsufficientData' });
        if (n > 0 && item.notApplicable / n >= 0.5) flags.push({ CriterionKey: item.key, Flag: 'MostlyNotApplicable' });
        if (scored.length >= 2 && populationStdDev(scored) === 0) flags.push({ CriterionKey: item.key, Flag: 'RangeCollapse' });
        if (scored.length >= 2 && Math.abs(correlation(item.scores, rest)) < 0.05) {
            flags.push({ CriterionKey: item.key, Flag: 'NoDiscrimination' });
        }
    }
    for (let i = 0; i < criteria.length; i++) {
        for (let j = i + 1; j < criteria.length; j++) {
            if (Math.abs(correlation(criteria[i].scores, criteria[j].scores)) >= 0.9) {
                flags.push({ CriterionKey: criteria[i].key, OtherKey: criteria[j].key, Flag: 'HighCorrelation' });
                flags.push({ CriterionKey: criteria[j].key, OtherKey: criteria[i].key, Flag: 'HighCorrelation' });
            }
        }
    }
    return flags;
}

/**
 * Quadratic-weighted Cohen's kappa on the full scale.
 * A level value is its index. Unobserved levels stay in the scale, so 0 and 2
 * are not pulled together just because 1 was not used.
 * `categoryCount` is the scale length. When omitted, the scale runs through the highest level.
 */
export function QuadraticKappa(pairs: readonly (readonly [number, number])[], categoryCount?: number): number {
    if (pairs.length === 0) return 1;
    const highest = pairs.reduce((max, [left, right]) => Math.max(max, left, right), 0);
    const k = categoryCount ?? highest + 1;
    if (k < 2) return 1;
    const grid = Array.from({ length: k }, () => Array<number>(k).fill(0));
    let n = 0;
    for (const [left, right] of pairs) {
        if (!Number.isInteger(left) || !Number.isInteger(right) || left < 0 || right < 0 || left >= k || right >= k) continue;
        grid[left][right] += 1;
        n += 1;
    }
    if (n === 0) return 1;
    const row = grid.map(line => line.reduce((sum, value) => sum + value, 0));
    const col = grid[0].map((_, column) => grid.reduce((sum, line) => sum + line[column], 0));
    let observed = 0;
    let expected = 0;
    for (let i = 0; i < k; i++) {
        for (let j = 0; j < k; j++) {
            const weight = ((i - j) / (k - 1)) ** 2;
            observed += weight * grid[i][j];
            expected += weight * row[i] * col[j] / n;
        }
    }
    if (expected === 0) return 1;
    return 1 - observed / expected;
}

/** Ordinal Krippendorff's alpha. Each inner array is one subject's ratings. */
export function KrippendorffAlpha(units: number[][]): number {
    const values = [...new Set(units.flat())].sort((a, b) => a - b);
    const index = new Map(values.map((value, position) => [value, position]));
    const k = values.length;
    if (k < 2) return 1;
    const coincidence = Array.from({ length: k }, () => Array(k).fill(0));
    for (const unit of units) {
        const counts = Array(k).fill(0);
        for (const value of unit) counts[index.get(value)!] += 1;
        const m = unit.length;
        if (m < 2) continue;
        for (let c = 0; c < k; c++) {
            for (let d = 0; d < k; d++) {
                coincidence[c][d] += c === d ? counts[c] * (counts[c] - 1) / (m - 1) : counts[c] * counts[d] / (m - 1);
            }
        }
    }
    const marginal = coincidence.map(row => row.reduce((sum, value) => sum + value, 0));
    const n = marginal.reduce((sum, value) => sum + value, 0);
    const cumulative: number[] = [];
    let running = 0;
    for (const count of marginal) {
        cumulative.push(running + count / 2);
        running += count;
    }
    const distance = (c: number, d: number) => (cumulative[c] - cumulative[d]) ** 2;
    let observed = 0;
    let expected = 0;
    for (let c = 0; c < k; c++) {
        for (let d = 0; d < k; d++) {
            observed += coincidence[c][d] * distance(c, d);
            expected += marginal[c] * marginal[d] * distance(c, d);
        }
    }
    if (expected === 0) return 1;
    return 1 - (observed / n) / (expected / (n * (n - 1)));
}

function mean(values: number[]): number {
    return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values: number[]): number {
    const mid = Math.floor(values.length / 2);
    return values.length % 2 === 0 ? (values[mid - 1] + values[mid]) / 2 : values[mid];
}

function trimEnds(sorted: number[], p: number): number[] {
    const drop = Math.floor(p * sorted.length);
    const kept = sorted.slice(drop, sorted.length - drop);
    return kept.length > 0 ? kept : sorted;
}

function populationStdDev(values: number[]): number {
    const avg = mean(values);
    return Math.sqrt(values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / values.length);
}

function correlation(left: (number | null)[], right: (number | null)[]): number {
    const pairs = left.map((value, index) => [value, right[index]] as const).filter((pair): pair is [number, number] => pair[0] !== null && pair[1] !== null);
    if (pairs.length < 2) return 0;
    const xs = pairs.map(pair => pair[0]);
    const ys = pairs.map(pair => pair[1]);
    const sx = populationStdDev(xs);
    const sy = populationStdDev(ys);
    if (sx === 0 || sy === 0) return 0;
    const mx = mean(xs);
    const my = mean(ys);
    return pairs.reduce((sum, [x, y]) => sum + (x - mx) * (y - my), 0) / pairs.length / sx / sy;
}
