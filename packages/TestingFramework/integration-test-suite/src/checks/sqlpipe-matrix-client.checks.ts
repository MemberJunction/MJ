/**
 * sqlpipe-matrix-client.checks.ts — the 'sqlpipe-matrix-client' bundle (SPC1–SPC2), deterministic
 * tier, client transport (IT145): the SQL pipeline scenario matrix over GraphQL.
 *
 * - SPC1: all pairs over the dimensions that apply over the wire (the core schema only, since the
 *   mock schema is created by server-side SQL; run paths saved, by name and cached — ad hoc SQL and
 *   transient specs need a read-only login the test MJAPI has none of). Every query, its
 *   dependencies and its oracle are saved over GraphQL; every run goes through
 *   `GraphQLDataProvider`. The oracle is the same plain SQL as on the server, saved as a plain
 *   query (no template, no composition) and run with no paging; the page is cut in TypeScript.
 * - SPC2: extraction properties of every saved query, read over GraphQL: parameters, dependencies,
 *   Query Entities, and fields equal to those the server extracted for the plain-SQL oracle.
 *
 * Two scopes, from `SQLPIPE_MATRIX_SCOPE` (see `sqlpipe-dimensions.ts`): `full` (the default, and
 * the nightly, merge and manual-dispatch runs) is every pair above; `pr` (pull requests) keeps all
 * pairs over the transport dimensions (run path, value case, MaxRows, StartRow), every shape,
 * templating and composition variant with every client run path, and every templating and
 * composition variant with its value cases, and drops the content-only pairs (shape × templating
 * and the like) that the server bundles IT143 / IT146 run in full on every pull request. SPC2
 * checks what SPC1 saved, so it shrinks with it. Setup logs the scope and its counts.
 *
 * Everything lives in a per-run `zzz-it145` category, deleted over GraphQL in Teardown.
 */
import { RunView } from '@memberjunction/core';
import type { DatabasePlatform } from '@memberjunction/core';
import type { MJQueryEntity } from '@memberjunction/core-entities';
import { IntegrationCheckRegistry } from '@memberjunction/testing-integration';
import type { IntegrationCheckContext, NamedCheck } from '@memberjunction/testing-integration';
import { ClientBackend } from './sqlpipe-backend';
import { CheckExtractionProperties, CreateDependencies, MatrixFixture, RunPoints } from './sqlpipe-matrix-runner';
import { ClientAssignments, MatrixScopeOf } from './sqlpipe-dimensions';
import type { MatrixScope } from './sqlpipe-dimensions';
import { LogMatrixFailures, SampledPoints } from './sqlpipe-matrix.checks';
import { BuildQuery, PointOf } from './sqlpipe-scenarios';
import type { ScenarioPoint } from './sqlpipe-scenarios';
import { CreateFixtureCategory, ErrorMessageOf, RunStamp } from './query-extraction-fixture';
import { FailOnMismatches } from './runquery-rendering-matrix';

const BUNDLE = 'sqlpipe-matrix-client';
const PREFIX = 'zzz-it145';

let fixture: MatrixFixture | undefined;

function requireFixture(): MatrixFixture {
    if (!fixture) throw new Error(`${BUNDLE}: Setup did not run (no fixture)`);
    return fixture;
}

/** The platform of the database behind the MJAPI, from the run's `DB_PLATFORM` (a GraphQL provider reports no platform of its own). */
function platformOf(): DatabasePlatform {
    return process.env.DB_PLATFORM === 'postgresql' ? 'postgresql' : 'sqlserver';
}

async function deleteCategory(ctx: IntegrationCheckContext, categoryID: string): Promise<void> {
    const queries = await new RunView().RunView<MJQueryEntity>({
        EntityName: 'MJ: Queries', ExtraFilter: `CategoryID='${categoryID}'`, OrderBy: '__mj_CreatedAt DESC', ResultType: 'entity_object', BypassCache: true,
    }, ctx.User);
    for (const query of queries.Results ?? []) {
        if (!await query.Delete()) console.error(`${BUNDLE} teardown warning: '${query.Name}' delete failed: ${query.LatestResult?.CompleteMessage}`);
    }
}

IntegrationCheckRegistry.Instance.RegisterLifecycle(BUNDLE, {
    Setup: async (ctx: IntegrationCheckContext): Promise<void> => {
        const category = await CreateFixtureCategory(ctx, `${PREFIX} ${RunStamp()}`);
        const backend = new ClientBackend(ctx, platformOf(), PREFIX);
        backend.OracleCategoryID = category.ID;
        fixture = new MatrixFixture(ctx, backend, category, PREFIX, ['core']);
        await CreateDependencies(fixture);
        logScope(fixture);
    },
    Teardown: async (ctx: IntegrationCheckContext): Promise<void> => {
        try {
            if (fixture) {
                await deleteCategory(ctx, fixture.Category.ID);
                await fixture.Category.Delete();
            }
        } catch (e) {
            console.error(`${BUNDLE} teardown warning: ${ErrorMessageOf(e)}`);
        }
        fixture = undefined;
    },
});

/** The scope this run uses, from `SQLPIPE_MATRIX_SCOPE` (unset: `full`). */
function scopeOf(): MatrixScope {
    return MatrixScopeOf(process.env.SQLPIPE_MATRIX_SCOPE);
}

/** The SPC1 points of a scope on the fixture's platform, before any `SQLPIPE_SAMPLE` thinning. */
function scopePoints(f: MatrixFixture, scope: MatrixScope): ScenarioPoint[] {
    return ClientAssignments(f.Platform, scope).Assignments.map(a => PointOf(a));
}

function distinctQueries(f: MatrixFixture, points: readonly ScenarioPoint[]): number {
    return new Set(points.map(p => BuildQuery(f.Env, p).Key)).size;
}

/** Logs which scope runs and its counts (SPC2 checks the saved, unrefused ones of the distinct queries), with the full counts beside. */
function logScope(f: MatrixFixture): void {
    const scope = scopeOf();
    const pr = scopePoints(f, 'pr');
    const full = scopePoints(f, 'full');
    const counts = (points: readonly ScenarioPoint[]) => `${points.length} point(s), ${distinctQueries(f, points)} distinct quer(ies)`;
    console.log(`      → ${BUNDLE} scope '${scope}' (SQLPIPE_MATRIX_SCOPE=${process.env.SQLPIPE_MATRIX_SCOPE ?? 'unset'}) on ${f.Platform}: pr = ${counts(pr)}; full = ${counts(full)}`);
}

async function checkSpc1Pairwise(): Promise<void> {
    const f = requireFixture();
    const scope = scopeOf();
    const points = SampledPoints(scopePoints(f, scope));
    const result = await RunPoints(f, points);
    LogMatrixFailures('SPC1', result.Failures);
    console.log(`      → SPC1 all pairs over GraphQL (scope '${scope}'): ${points.length} point(s), ${result.Queries} distinct quer(ies), ${result.Runs} run(s)`);
    FailOnMismatches('SPC1 all pairs over GraphQL', result.Failures, result.Runs + result.Queries);
}

async function checkSpc2ExtractionProperties(): Promise<void> {
    const result = await CheckExtractionProperties(requireFixture());
    LogMatrixFailures('SPC2', result.Failures);
    console.log(`      → SPC2 extraction properties over GraphQL (scope '${scopeOf()}'): ${result.Checked} saved quer(ies) checked`);
    FailOnMismatches('SPC2 extraction properties over GraphQL', result.Failures, result.Checked);
}

export const SqlPipeMatrixClientChecks: NamedCheck[] = [
    { Id: `${BUNDLE}.SPC1`, Name: 'SPC1: all pairs over the wire-applicable dimensions return the rows of their plain-SQL oracle over GraphQL', Fn: checkSpc1Pairwise },
    { Id: `${BUNDLE}.SPC2`, Name: 'SPC2: every query saved over GraphQL has the parameters, dependencies, entities and fields the spec requires', Fn: checkSpc2ExtractionProperties },
];

for (const check of SqlPipeMatrixClientChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}
