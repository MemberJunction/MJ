/**
 * sqlpipe-matrix.checks.ts — two bundles, deterministic tier: 'sqlpipe-matrix' (IT143: SPM1, SPM5)
 * and 'sqlpipe-matrix-cross' (IT146: SPM2–SPM4, SPM5). A declarative scenario matrix over the whole
 * query pipeline (templates, composition, paging, caps, run paths), on SQL Server and PostgreSQL,
 * over a mock schema and the MJ core schema. The work is split in two bundles so each stays within
 * its time limit; each builds its own fixture.
 *
 * Scenarios are data: each dimension (schema, query shape, templating, composition, values,
 * MaxRows, StartRow, run path) is a value table, and the checks generate points from them:
 *  - SPM1: all pairs over every dimension (every value pair of two dimensions that can co-occur);
 *  - SPM2: the full cross product composition × templating × MaxRows × StartRow (mock schema, a
 *    CTE-shaped outer query, so a dependency's own CTE named like the outer one collides);
 *  - SPM3: the full cross product conditional parameters × composition (core schema), including
 *    the refused compositions (missing, implicit same-name and unknown arguments);
 *  - SPM4: the full cross product own row cap × composition × MaxRows × StartRow;
 *  - SPM5: extraction properties of every query SPM1–SPM4 saved: parameters (required iff a use
 *    sits outside every conditional, types from filters, defaults, doc-comment descriptions),
 *    dependency rows by full path with their argument mapping, Query Entities, and fields equal
 *    to the server's own describe of the plain-SQL oracle (names, order, types, nullability on
 *    SQL Server) with pass-through columns of the core view bound to their entity fields.
 *
 * Every run is compared with a plain-SQL oracle that uses no MJ feature, run directly on the
 * database; the page is cut from the oracle's rows in TypeScript. Refused saves must carry their
 * code and write no row. The bundle creates schemas `mjit_sqlpipe` / `mjit_sqlpipe_ext` and a
 * per-run query category (`zzz-it143` / `zzz-it146`), and drops them in Teardown.
 */
import type { DatabasePlatform } from '@memberjunction/core';
import { IntegrationCheckRegistry } from '@memberjunction/testing-integration';
import type { IntegrationCheckContext, NamedCheck } from '@memberjunction/testing-integration';
import { COMPOSITIONS } from './sqlpipe-composition';
import { DIMENSIONS } from './sqlpipe-dimensions';
import { CrossProduct, GeneratePairwise } from './sqlpipe-pairwise';
import type { Assignment, Dimension } from './sqlpipe-pairwise';
import { CheckExtractionProperties, CreateDependencies, MatrixFixture, RunPoints } from './sqlpipe-matrix-runner';
import { ServerBackend } from './sqlpipe-backend';
import { PointOf, ValidPoint } from './sqlpipe-scenarios';
import type { ScenarioPoint } from './sqlpipe-scenarios';
import { CreateMockSchemaStatements, DropMockSchemaStatements } from './sqlpipe-schema';
import { SHAPES } from './sqlpipe-shapes';
import { CreateFixtureCategory, DeleteFixtureCategory, PlatformOf, RunFixtureSQL, RunFixtureSQLQuietly, RunStamp } from './query-extraction-fixture';
import { FailOnMismatches } from './runquery-rendering-matrix';

const PAIRWISE_BUNDLE = 'sqlpipe-matrix';
const CROSS_BUNDLE = 'sqlpipe-matrix-cross';

const fixtures = new Map<string, MatrixFixture>();

function requireFixture(bundle: string): MatrixFixture {
    const fixture = fixtures.get(bundle);
    if (!fixture) throw new Error(`${bundle}: Setup did not run (no fixture)`);
    return fixture;
}

function registerLifecycle(bundle: string, prefix: string): void {
    IntegrationCheckRegistry.Instance.RegisterLifecycle(bundle, {
        Setup: async (ctx: IntegrationCheckContext): Promise<void> => {
            const platform = PlatformOf(ctx, bundle);
            await RunFixtureSQL(ctx, bundle, [...DropMockSchemaStatements(platform), ...CreateMockSchemaStatements(platform)]);
            const category = await CreateFixtureCategory(ctx, `${prefix} ${RunStamp()}`);
            const fixture = new MatrixFixture(ctx, new ServerBackend(ctx, platform, bundle), category, prefix);
            fixtures.set(bundle, fixture);
            await CreateDependencies(fixture);
        },
        Teardown: async (ctx: IntegrationCheckContext): Promise<void> => {
            await DeleteFixtureCategory(ctx, bundle, fixtures.get(bundle)?.Category);
            await RunFixtureSQLQuietly(ctx, bundle, DropMockSchemaStatements(PlatformOf(ctx, bundle)));
            fixtures.delete(bundle);
        },
    });
}

registerLifecycle(PAIRWISE_BUNDLE, 'zzz-it143');
registerLifecycle(CROSS_BUNDLE, 'zzz-it146');

// ─── Dimensions ────────────────────────────────────────────────────────────

function dims(names: readonly string[], overrides: Readonly<Record<string, readonly string[]>> = {}): Dimension[] {
    return names.map(n => {
        const base = DIMENSIONS.find(d => d.Name === n);
        if (!base) throw new Error(`unknown dimension ${n}`);
        return overrides[n] ? { Name: n, Values: overrides[n] } : base;
    });
}

/**
 * Development aid: `SQLPIPE_SAMPLE=n` runs every n-th point only, so a change can be tried in a
 * fraction of the time. Unset (the tier), every point runs.
 */
export function SampledPoints(points: readonly ScenarioPoint[]): readonly ScenarioPoint[] {
    const every = Number(process.env.SQLPIPE_SAMPLE ?? '1');
    return every > 1 ? points.filter((_p, i) => i % every === 0) : points;
}

/** Every failure goes to the log in full (the check's message keeps the first 25). */
export function LogMatrixFailures(label: string, failures: readonly string[]): void {
    for (const failure of failures) console.log(`SQLPIPE-FAIL ${label} :: ${failure.replace(/\n/g, ' ')}`);
}

async function runAndReport(bundle: string, label: string, all: readonly ScenarioPoint[]): Promise<void> {
    const points = SampledPoints(all);
    const result = await RunPoints(requireFixture(bundle), points);
    LogMatrixFailures(label, result.Failures);
    console.log(`      → ${label}: ${points.length} point(s), ${result.Queries} distinct quer(ies), ${result.Runs} run(s)`);
    FailOnMismatches(label, result.Failures, result.Runs + result.Queries);
}

function validFor(platform: DatabasePlatform) {
    return (a: Assignment): boolean => ValidPoint(platform, a);
}

// ─── Checks ────────────────────────────────────────────────────────────────

async function checkSpm1Pairwise(): Promise<void> {
    const f = requireFixture(PAIRWISE_BUNDLE);
    const generated = GeneratePairwise(DIMENSIONS, validFor(f.Platform));
    await runAndReport(PAIRWISE_BUNDLE, 'SPM1 all pairs', generated.Assignments.map(a => PointOf(a)));
}

const REFUSED_COMPOSITIONS = new Set(COMPOSITIONS.filter(c => c.Refusal).map(c => c.Key));

async function checkSpm2CompositionTemplatingPaging(): Promise<void> {
    const f = requireFixture(CROSS_BUNDLE);
    const space = dims(['Composition', 'Templating', 'MaxRows', 'StartRow'], { Composition: COMPOSITIONS.map(c => c.Key).filter(k => !REFUSED_COMPOSITIONS.has(k)) });
    const fixed = { Schema: 'mock', Shape: 'cte', Values: 'provided', Path: 'saved' };
    const points = CrossProduct(space, a => ValidPoint(f.Platform, { ...a, ...fixed })).map(a => PointOf({ ...a, ...fixed }));
    await runAndReport(CROSS_BUNDLE, 'SPM2 composition × templating × MaxRows × StartRow', points);
}

const CONDITIONAL_TEMPLATING = ['none', 'optional', 'conditionOnly', 'ifElif', 'default', 'lengthGuard', 'inlineIf'];

async function checkSpm3ConditionalParametersComposition(): Promise<void> {
    const f = requireFixture(CROSS_BUNDLE);
    const space = dims(['Templating', 'Composition', 'Values'], { Templating: CONDITIONAL_TEMPLATING, Values: ['provided', 'missing'] });
    const fixed = { Schema: 'core', Shape: 'plain', MaxRows: 'none', StartRow: 'none', Path: 'saved' };
    const points = CrossProduct(space, a => ValidPoint(f.Platform, { ...a, ...fixed })).map(a => PointOf({ ...a, ...fixed }));
    await runAndReport(CROSS_BUNDLE, 'SPM3 conditional parameters × composition', points);
}

const CAP_SHAPES = SHAPES.filter(s => s.OwnCap).map(s => s.Key);

async function checkSpm4OwnCapPaging(): Promise<void> {
    const f = requireFixture(CROSS_BUNDLE);
    const space = dims(['Shape', 'Composition', 'MaxRows', 'StartRow'], { Shape: ['plain', ...CAP_SHAPES], Composition: ['none', 'ownCap'] });
    const fixed = { Schema: 'mock', Templating: 'none', Values: 'provided', Path: 'saved' };
    const points = CrossProduct(space, a => ValidPoint(f.Platform, { ...a, ...fixed })).map(a => PointOf({ ...a, ...fixed }));
    await runAndReport(CROSS_BUNDLE, 'SPM4 own row cap × MaxRows × StartRow', points);
}

async function checkSpm5ExtractionProperties(bundle: string): Promise<void> {
    const result = await CheckExtractionProperties(requireFixture(bundle));
    LogMatrixFailures('SPM5', result.Failures);
    FailOnMismatches('SPM5 extraction properties', result.Failures, result.Checked);
}

const SPM5_NAME = 'SPM5: every saved scenario query has the parameters, dependencies, entities and described fields the spec requires';

export const SqlPipeMatrixChecks: NamedCheck[] = [
    { Id: `${PAIRWISE_BUNDLE}.SPM1`, Name: 'SPM1: all pairs over every dimension return the rows of their plain-SQL oracle', Fn: checkSpm1Pairwise },
    { Id: `${PAIRWISE_BUNDLE}.SPM5`, Name: SPM5_NAME, Fn: () => checkSpm5ExtractionProperties(PAIRWISE_BUNDLE) },
];

export const SqlPipeMatrixCrossChecks: NamedCheck[] = [
    { Id: `${CROSS_BUNDLE}.SPM2`, Name: 'SPM2: composition × templating × MaxRows × StartRow, in full, return their oracle rows', Fn: checkSpm2CompositionTemplatingPaging },
    { Id: `${CROSS_BUNDLE}.SPM3`, Name: 'SPM3: conditional parameters × composition, in full, return their oracle rows or are refused with their code', Fn: checkSpm3ConditionalParametersComposition },
    { Id: `${CROSS_BUNDLE}.SPM4`, Name: 'SPM4: own row caps × MaxRows × StartRow, in full, return their oracle rows', Fn: checkSpm4OwnCapPaging },
    { Id: `${CROSS_BUNDLE}.SPM5`, Name: SPM5_NAME, Fn: () => checkSpm5ExtractionProperties(CROSS_BUNDLE) },
];

for (const check of [...SqlPipeMatrixChecks, ...SqlPipeMatrixCrossChecks]) {
    IntegrationCheckRegistry.Instance.Register(check);
}
