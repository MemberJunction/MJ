/**
 * decision-eval-scorecard.ts — turns a completed Decision Eval suite run into a scorecard: per cell,
 * agreement with labels, repeatability and calibration (plan Tasks 2.1 and 2.4).
 *
 * It reads the suite's `MJ: Test Runs` (their `ExpectedOutputData`, `ActualOutputData`, `ResultDetails`
 * and the linked prompt run's cost), groups them by cell (the bracketed part of each test's name),
 * and writes `scorecard.json` and `scorecard.md`. Every number is a query over rows the harness
 * already persisted, so a result can be re-derived later without re-spending the run. The metrics
 * are pure and unit-tested in `@memberjunction/testing-engine` (`decision-eval/metrics.ts`).
 *
 * Cases are named by ID only, never by text, and `--out` must be outside every git working tree:
 * the rig refuses outright otherwise.
 *
 * USAGE (from the repo root; reads the database named in .env):
 *   npx tsx packages/TestingFramework/integration-test-suite/rigs/decision-eval-scorecard.ts \
 *     --suite <name> --out <dir> [--since <iso>] [--until <iso>]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RunView, type UserInfo } from '@memberjunction/core';
import { EscapeSQLString } from '@memberjunction/global';
import {
    AssertOutputOutsideRepo,
    BuildDecisionEvalScorecard,
    FindRepoRoot,
    RenderDecisionEvalScorecard,
    type DecisionEvalRunRow
} from '@memberjunction/testing-engine';
import { BootstrapAI } from './lib/ai-bootstrap';

const RIG_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = FindRepoRoot(RIG_DIR) ?? resolve(RIG_DIR, '../../../..');

/** IDs per `IN (...)` list, so no one query grows without bound. */
const ID_CHUNK = 300;

const USAGE = 'usage: decision-eval-scorecard.ts --suite <name> --out <dir> [--since <iso>] [--until <iso>]';

/** The command line, read. */
interface ScorecardArgs {
    Suite: string;
    OutDir: string;
    Since: string | null;
    Until: string | null;
}

/** A test run's columns the scorecard reads. */
interface TestRunRow {
    ID: string;
    Test: string | null;
    Status: string;
    ExpectedOutputData: string | null;
    ActualOutputData: string | null;
    ResultDetails: string | null;
    CostUSD: number | null;
    TargetLogID: string | null;
}

/** A prompt run's cost columns. */
interface PromptRunCostRow {
    ID: string;
    Cost: number | null;
    TotalCost: number | null;
}

function readFlag(argv: readonly string[], name: string): string | undefined {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? argv[i + 1] : undefined;
}

/** An ISO timestamp from the command line, normalized; anything else is refused before it reaches a filter. */
function readTimestamp(argv: readonly string[], name: string): string | null {
    const raw = readFlag(argv, name);
    if (raw === undefined) {
        return null;
    }
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) {
        throw new Error(`--${name} must be an ISO timestamp, got '${raw}'`);
    }
    return parsed.toISOString();
}

function parseArgs(argv: readonly string[]): ScorecardArgs {
    const suite = readFlag(argv, 'suite');
    const out = readFlag(argv, 'out');
    if (!suite || !out) {
        throw new Error(USAGE);
    }
    return { Suite: suite, OutDir: out, Since: readTimestamp(argv, 'since'), Until: readTimestamp(argv, 'until') };
}

function chunks<T>(items: readonly T[], size: number): T[][] {
    return Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, (i + 1) * size));
}

function inList(ids: readonly string[]): string {
    return ids.map(id => `'${EscapeSQLString(id)}'`).join(', ');
}

/** The IDs of the suite's tests. */
async function loadSuiteTestIds(rv: RunView, suite: string, user: UserInfo): Promise<string[]> {
    const result = await rv.RunView<{ TestID: string }>({
        EntityName: 'MJ: Test Suite Tests',
        ExtraFilter: `Suite = '${EscapeSQLString(suite)}'`,
        Fields: ['TestID'],
        // A total order, so the chunks below hold the same tests on every read. The metrics no
        // longer depend on the order of the runs, but the rig's reads should not vary either.
        OrderBy: 'TestID',
        IgnoreMaxRows: true, // a suite easily has more tests than the entity's 1000-row view cap
        ResultType: 'simple'
    }, user);
    if (!result.Success) {
        throw new Error(`Could not read the suite's tests: ${result.ErrorMessage ?? 'no message'}`);
    }
    return [...new Set(result.Results.map(r => r.TestID))];
}

/**
 * The suite's test runs in the window, read in batches of test IDs.
 *
 * `IgnoreMaxRows`: `MJ: Test Runs` caps a view at its `UserViewMaxRows` (1000), and a capped result
 * is silently short (a non-paged view reports no larger total). A suite of 1,496 tests × 5 repeats
 * read in batches of 300 tests came back as exactly 5 × 1,000 runs before this.
 */
async function loadTestRuns(rv: RunView, testIds: readonly string[], args: ScorecardArgs, user: UserInfo): Promise<TestRunRow[]> {
    const window = [
        args.Since ? `StartedAt >= '${EscapeSQLString(args.Since)}'` : null,
        args.Until ? `StartedAt < '${EscapeSQLString(args.Until)}'` : null
    ].filter((clause): clause is string => clause !== null);
    const results = await rv.RunViews<TestRunRow>(chunks(testIds, ID_CHUNK).map(ids => ({
        EntityName: 'MJ: Test Runs',
        ExtraFilter: [`TestID IN (${inList(ids)})`, ...window].join(' AND '),
        Fields: ['ID', 'Test', 'Status', 'ExpectedOutputData', 'ActualOutputData', 'ResultDetails', 'CostUSD', 'TargetLogID'],
        OrderBy: 'StartedAt, ID', // runs started in parallel tie on StartedAt
        IgnoreMaxRows: true,
        ResultType: 'simple' as const
    })), user);
    return results.flatMap(result => {
        if (!result.Success) {
            throw new Error(`Could not read test runs: ${result.ErrorMessage ?? 'no message'}`);
        }
        return result.Results;
    });
}

/** Each linked prompt run's cost: `TotalCost`, else `Cost`. */
async function loadPromptRunCosts(rv: RunView, runs: readonly TestRunRow[], user: UserInfo): Promise<Map<string, number | null>> {
    const ids = [...new Set(runs.map(r => r.TargetLogID).filter((id): id is string => !!id))];
    if (ids.length === 0) {
        return new Map();
    }
    const results = await rv.RunViews<PromptRunCostRow>(chunks(ids, ID_CHUNK).map(chunk => ({
        EntityName: 'MJ: AI Prompt Runs',
        ExtraFilter: `ID IN (${inList(chunk)})`,
        Fields: ['ID', 'Cost', 'TotalCost'],
        IgnoreMaxRows: true,
        ResultType: 'simple' as const
    })), user);
    const costs = new Map<string, number | null>();
    for (const result of results) {
        if (!result.Success) {
            throw new Error(`Could not read prompt runs: ${result.ErrorMessage ?? 'no message'}`);
        }
        for (const row of result.Results) {
            costs.set(row.ID.toUpperCase(), row.TotalCost ?? row.Cost ?? null);
        }
    }
    return costs;
}

function toRunRows(runs: readonly TestRunRow[], costs: ReadonlyMap<string, number | null>): DecisionEvalRunRow[] {
    return runs.map(run => ({
        TestName: run.Test ?? '',
        Status: run.Status,
        ExpectedOutputData: run.ExpectedOutputData,
        ActualOutputData: run.ActualOutputData,
        ResultDetails: run.ResultDetails,
        CostUSD: run.CostUSD,
        PromptRunCost: run.TargetLogID ? costs.get(run.TargetLogID.toUpperCase()) ?? null : null
    }));
}

async function main(): Promise<void> {
    const args = parseArgs(process.argv.slice(2));
    const outDir = AssertOutputOutsideRepo(args.OutDir, [REPO_ROOT]);
    const ctx = await BootstrapAI();
    try {
        const rv = new RunView(ctx.provider);
        const testIds = await loadSuiteTestIds(rv, args.Suite, ctx.user);
        if (testIds.length === 0) {
            console.log(`no tests in suite "${args.Suite}"`);
            return;
        }
        const runs = await loadTestRuns(rv, testIds, args, ctx.user);
        const costs = await loadPromptRunCosts(rv, runs, ctx.user);
        const scorecard = BuildDecisionEvalScorecard(toRunRows(runs, costs), { Suite: args.Suite, Since: args.Since, Until: args.Until });
        mkdirSync(outDir, { recursive: true });
        writeFileSync(join(outDir, 'scorecard.json'), `${JSON.stringify(scorecard, null, 2)}\n`);
        writeFileSync(join(outDir, 'scorecard.md'), `${RenderDecisionEvalScorecard(scorecard)}\n`);
        console.log(`${runs.length} run(s) across ${scorecard.Cells.length} cell(s); ${scorecard.UnreadableRuns} unreadable`);
        console.log(`wrote ${join(outDir, 'scorecard.md')} and scorecard.json`);
    } finally {
        await ctx.pool.close();
    }
}

main().then(() => process.exit(0)).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
});
