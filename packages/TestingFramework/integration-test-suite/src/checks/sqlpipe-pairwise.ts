/**
 * sqlpipe-pairwise.ts — combination generators for the SQL pipeline scenario matrix.
 *
 * A dimension is a name and its values. {@link GeneratePairwise} returns assignments (one value
 * per dimension) such that every pair of values from two different dimensions that can appear
 * together appears in at least one assignment ("all pairs"). {@link CrossProduct} returns every
 * combination. Both honour a validity predicate, so impossible combinations (a SQL Server-only
 * shape on PostgreSQL, an ad hoc run of a templated query) are never produced, and a pair that no
 * valid assignment can hold is reported as infeasible instead of being forced.
 *
 * Generation is deterministic: the same dimensions and predicate always yield the same list.
 */

/** One dimension: its name and its values, in a fixed order. */
export interface Dimension {
    readonly Name: string;
    readonly Values: readonly string[];
}

/** One generated combination: a value for every dimension, by dimension name. */
export type Assignment = Readonly<Record<string, string>>;

/** Whether a (possibly partial) assignment can be part of a valid combination. */
export type ValidityPredicate = (partial: Assignment) => boolean;

/** The generated assignments, and the value pairs no valid assignment can hold. */
export interface PairwiseResult {
    readonly Assignments: Assignment[];
    readonly InfeasiblePairs: string[];
}

interface Pair {
    readonly A: number;
    readonly AValue: string;
    readonly B: number;
    readonly BValue: string;
}

function pairKey(dims: readonly Dimension[], a: number, av: string, b: number, bv: string): string {
    return a < b ? `${dims[a].Name}=${av}|${dims[b].Name}=${bv}` : `${dims[b].Name}=${bv}|${dims[a].Name}=${av}`;
}

function allPairs(dims: readonly Dimension[], valid: ValidityPredicate): { Pairs: Map<string, Pair>; Infeasible: string[] } {
    const pairs = new Map<string, Pair>();
    const infeasible: string[] = [];
    for (let a = 0; a < dims.length; a++) {
        for (let b = a + 1; b < dims.length; b++) {
            for (const av of dims[a].Values) {
                for (const bv of dims[b].Values) {
                    const key = pairKey(dims, a, av, b, bv);
                    if (valid({ [dims[a].Name]: av, [dims[b].Name]: bv })) pairs.set(key, { A: a, AValue: av, B: b, BValue: bv });
                    else infeasible.push(key);
                }
            }
        }
    }
    return { Pairs: pairs, Infeasible: infeasible };
}

/** How many still-uncovered pairs a candidate value for `dim` covers, given the values already chosen. */
function gain(dims: readonly Dimension[], chosen: Record<string, string>, dim: number, value: string, uncovered: ReadonlyMap<string, Pair>): number {
    let count = 0;
    for (let other = 0; other < dims.length; other++) {
        const otherValue = chosen[dims[other].Name];
        if (other === dim || otherValue === undefined) continue;
        if (uncovered.has(pairKey(dims, dim, value, other, otherValue))) count++;
    }
    return count;
}

/** Completes an assignment seeded by one pair, greedily, or returns null when no valid completion exists. */
function complete(dims: readonly Dimension[], seed: Pair, uncovered: ReadonlyMap<string, Pair>, valid: ValidityPredicate): Record<string, string> | null {
    const chosen: Record<string, string> = { [dims[seed.A].Name]: seed.AValue, [dims[seed.B].Name]: seed.BValue };
    for (let dim = 0; dim < dims.length; dim++) {
        if (chosen[dims[dim].Name] !== undefined) continue;
        let best: string | null = null;
        let bestGain = -1;
        for (const value of dims[dim].Values) {
            if (!valid({ ...chosen, [dims[dim].Name]: value })) continue;
            const g = gain(dims, chosen, dim, value, uncovered);
            if (g > bestGain) { best = value; bestGain = g; }
        }
        if (best === null) return null;
        chosen[dims[dim].Name] = best;
    }
    return valid(chosen) ? chosen : null;
}

function markCovered(dims: readonly Dimension[], assignment: Assignment, uncovered: Map<string, Pair>): void {
    for (let a = 0; a < dims.length; a++) {
        for (let b = a + 1; b < dims.length; b++) {
            uncovered.delete(pairKey(dims, a, assignment[dims[a].Name], b, assignment[dims[b].Name]));
        }
    }
}

/**
 * All-pairs generation: every feasible value pair of two dimensions appears in at least one
 * returned assignment. A pair that passes the predicate on its own but has no valid completion is
 * listed in `InfeasiblePairs` with the pairs the predicate rejects outright.
 */
export function GeneratePairwise(dims: readonly Dimension[], valid: ValidityPredicate): PairwiseResult {
    const { Pairs: uncovered, Infeasible: infeasible } = allPairs(dims, valid);
    const assignments: Assignment[] = [];
    for (const [key, seed] of [...uncovered.entries()]) {
        if (!uncovered.has(key)) continue;
        const assignment = complete(dims, seed, uncovered, valid);
        if (!assignment) {
            uncovered.delete(key);
            infeasible.push(key);
            continue;
        }
        assignments.push(assignment);
        markCovered(dims, assignment, uncovered);
    }
    return { Assignments: assignments, InfeasiblePairs: infeasible };
}

/** Every combination of the dimensions' values that passes the predicate, in dimension order. */
export function CrossProduct(dims: readonly Dimension[], valid: ValidityPredicate): Assignment[] {
    let partials: Record<string, string>[] = [{}];
    for (const dim of dims) {
        const next: Record<string, string>[] = [];
        for (const partial of partials) {
            for (const value of dim.Values) {
                const candidate = { ...partial, [dim.Name]: value };
                if (valid(candidate)) next.push(candidate);
            }
        }
        partials = next;
    }
    return partials;
}

/** The value pairs (of two different dimensions) an assignment list covers, as `A=x|B=y` keys. */
export function CoveredPairs(dims: readonly Dimension[], assignments: readonly Assignment[]): Set<string> {
    const covered = new Set<string>();
    for (const assignment of assignments) {
        for (let a = 0; a < dims.length; a++) {
            for (let b = a + 1; b < dims.length; b++) {
                covered.add(pairKey(dims, a, assignment[dims[a].Name], b, assignment[dims[b].Name]));
            }
        }
    }
    return covered;
}
