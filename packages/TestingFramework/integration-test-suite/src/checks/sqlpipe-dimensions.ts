/**
 * sqlpipe-dimensions.ts — the dimensions of the SQL pipeline scenario matrix, and the points the
 * GraphQL bundle (IT145, SPC1) runs in each of its two scopes.
 *
 * `SQLPIPE_MATRIX_SCOPE` picks the scope of IT145:
 *  - `full` (the default: local runs, the nightly cron, merges to next, manual dispatch): all pairs
 *    over every client dimension, the same points as before scopes existed;
 *  - `pr` (pull requests, set by the integration workflow): all pairs over the dimensions the
 *    transport carries (run path, value case, MaxRows, StartRow), every query shape, templating
 *    variant and composition variant crossed with every client run path, every templating variant
 *    crossed with every value case, and every composition variant with the value cases it defines. Pairs of two content dimensions
 *    (shape × templating, shape × composition, templating × composition) are not required: they
 *    are the same on either side of the wire, and the server bundles IT143 / IT146 run them in full
 *    on every pull request.
 *
 * SPC2 checks every query SPC1 saved, so it shrinks with SPC1. Both scopes are deterministic.
 */
import type { DatabasePlatform } from '@memberjunction/core';
import { CompositionByKey, COMPOSITIONS } from './sqlpipe-composition';
import { GeneratePairwise } from './sqlpipe-pairwise';
import type { Assignment, Dimension, DimensionValue, PairFilter, PairwiseResult } from './sqlpipe-pairwise';
import { MAX_ROWS, START_ROWS, ValidPoint } from './sqlpipe-scenarios';
import { SHAPES } from './sqlpipe-shapes';
import { TEMPLATING, VALUE_CASES } from './sqlpipe-templating';

const keys = <T extends { Key: string }>(items: readonly T[]): string[] => items.map(i => i.Key);

/** Every dimension of the matrix, with every value (the server bundles use these as they are). */
export const DIMENSIONS: readonly Dimension[] = [
    { Name: 'Schema', Values: ['mock', 'core'] },
    { Name: 'Shape', Values: keys(SHAPES) },
    { Name: 'Templating', Values: keys(TEMPLATING) },
    { Name: 'Composition', Values: keys(COMPOSITIONS) },
    { Name: 'Values', Values: [...VALUE_CASES] },
    { Name: 'MaxRows', Values: Object.keys(MAX_ROWS) },
    { Name: 'StartRow', Values: Object.keys(START_ROWS) },
    { Name: 'Path', Values: ['saved', 'byName', 'adhoc', 'cached', 'spec'] },
];

/** The run paths open to the client (ad hoc SQL and transient specs need a read-only login the test MJAPI lacks). */
export const CLIENT_PATHS: readonly string[] = ['saved', 'byName', 'cached'];

/** The dimensions the transport carries: how the query is reached, the values sent, and the paging. */
export const TRANSPORT_DIMENSIONS: readonly string[] = ['Path', 'Values', 'MaxRows', 'StartRow'];

/** Which points IT145 runs: a principled subset on pull requests, or every pair. */
export type MatrixScope = 'pr' | 'full';

/** The scope named by a `SQLPIPE_MATRIX_SCOPE` value; unset or empty is `full`, anything else unknown throws. */
export function MatrixScopeOf(value: string | undefined): MatrixScope {
    const scope = (value ?? '').trim().toLowerCase();
    if (scope === '' || scope === 'full') return 'full';
    if (scope === 'pr') return 'pr';
    throw new Error(`SQLPIPE_MATRIX_SCOPE must be 'pr' or 'full', got '${value}'`);
}

/** The client dimensions: the core schema only (the mock schema is created by server-side SQL), the client run paths. */
export function ClientDimensions(): Dimension[] {
    return DIMENSIONS.map(d => d.Name === 'Schema' ? { Name: d.Name, Values: ['core'] } : d.Name === 'Path' ? { Name: d.Name, Values: CLIENT_PATHS } : d);
}

const isTransport = (d: DimensionValue): boolean => TRANSPORT_DIMENSIONS.includes(d.Dimension);

/** Whether a composition variant has a value case of its own (the rest take the templating's). */
function compositionOwnsCase(composition: string, value: string): boolean {
    return value in CompositionByKey(composition).Cases;
}

/** Whether one of a pair is `dimension`, and the pair as (that one, the other). */
function pick(a: DimensionValue, b: DimensionValue, dimension: string): [DimensionValue, DimensionValue] | null {
    if (a.Dimension === dimension) return [a, b];
    if (b.Dimension === dimension) return [b, a];
    return null;
}

/**
 * The value pairs the `pr` scope must cover: every pair of two transport dimensions; every
 * value of every dimension with every client run path; every templating variant with every value
 * case; every composition variant with each value case it defines itself (the values are what
 * crosses the wire, and a value case exists only for some variants).
 */
export const PR_PAIRS: PairFilter = (a: DimensionValue, b: DimensionValue): boolean => {
    if (isTransport(a) && isTransport(b)) return true;
    if (a.Dimension === 'Path' || b.Dimension === 'Path') return true;
    const values = pick(a, b, 'Values');
    if (!values) return false;
    const [value, other] = values;
    if (other.Dimension === 'Templating') return true;
    return other.Dimension === 'Composition' && compositionOwnsCase(other.Value, value.Value);
};

/** The client assignments of a scope, on a platform. */
export function ClientAssignments(platform: DatabasePlatform, scope: MatrixScope): PairwiseResult {
    const valid = (a: Assignment): boolean => ValidPoint(platform, a);
    return scope === 'pr' ? GeneratePairwise(ClientDimensions(), valid, PR_PAIRS) : GeneratePairwise(ClientDimensions(), valid);
}
