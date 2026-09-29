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
 *     --suite <name> --out <dir> [--since <iso>] [--until <iso>] [--decision agent-discovery [--catalog <agents.json>]]
 *
 * `--decision agent-discovery` scores an agent-discovery suite (plan Task 3.1) with its own metrics
 * (`decision-eval/discovery-metrics.ts`): top-1 accuracy, Choice-confidence and `anyApplies`
 * calibration, the injection operating table, and the `semantic-search` baseline. `--catalog` names
 * the corpus's `agents.json`; the scorecard then reports how the discoverable agents have drifted
 * since the corpus was generated.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { RunView, type UserInfo } from '@memberjunction/core';
import { EscapeSQLString } from '@memberjunction/global';
import { AIEngine } from '@memberjunction/aiengine';
import { DecisionDiscoveryRunnableAgents } from '@memberjunction/ai-agents';
import {
    AssertOutputOutsideRepo,
    BuildDecisionEvalScorecard,
    BuildDiscoveryEvalScorecard,
    CompareDiscoveryCatalog,
    CONVERSATION_MANAGER_NAME,
    DECISION_EVAL_DECISIONS,
    DiscoveryCatalogSnapshotSchema,
    FindRepoRoot,
    RenderDecisionEvalScorecard,
    RenderDiscoveryEvalScorecard,
    type DecisionEvalDecision,
    type DecisionEvalRunRow,
    type DiscoveryCatalogDrift
} from '@memberjunction/testing-engine';
import { DiscoverableAgentsForCorpus } from '../src/discovery-corpus/generator';
import { BootstrapAI } from './lib/ai-bootstrap';

const RIG_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = FindRepoRoot(RIG_DIR) ?? resolve(RIG_DIR, '../../../..');

/** IDs per `IN (...)` list, so no one query grows without bound. */
const ID_CHUNK = 300;

const USAGE = 'usage: decision-eval-scorecard.ts --suite <name> --out <dir> [--since <iso>] [--until <iso>] '
    + '[--decision conversation-routing|agent-discovery] [--catalog <agents.json>]';

/** The command line, read. */
interface ScorecardArgs {
    Suite: string;
    OutDir: string;
    Since: string | null;
    Until: string | null;
    Decision: DecisionEvalDecision;
    /** The corpus's `agents.json`, for an agent-discovery suite's drift report. */
    CatalogPath: string | null;
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
    const decisionFlag = readFlag(argv, 'decision') ?? 'conversation-routing';
    const decision = DECISION_EVAL_DECISIONS.find(d => d === decisionFlag);
    if (!decision) {
        throw new Error(`--decision must be one of ${DECISION_EVAL_DECISIONS.join(', ')}, got '${decisionFlag}'`);
    }
    return {
        Suite: suite, OutDir: out, Since: readTimestamp(argv, 'since'), Until: readTimestamp(argv, 'until'),
        Decision: decision, CatalogPath: readFlag(argv, 'catalog') ?? null
    };
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
        OrderBy: 'StartedAt',
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

/** Writes the routing scorecard; returns its cell and unreadable counts. */
function writeRoutingScorecard(outDir: string, args: ScorecardArgs, rows: DecisionEvalRunRow[]): { Cells: number; Unreadable: number } {
    const scorecard = BuildDecisionEvalScorecard(rows, { Suite: args.Suite, Since: args.Since, Until: args.Until });
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, 'scorecard.json'), `${JSON.stringify(scorecard, null, 2)}\n`);
    writeFileSync(join(outDir, 'scorecard.md'), `${RenderDecisionEvalScorecard(scorecard)}\n`);
    return { Cells: scorecard.Cells.length, Unreadable: scorecard.UnreadableRuns };
}

/** Writes the agent-discovery scorecard, with the catalog drift when `--catalog` names a snapshot. */
async function writeDiscoveryScorecard(outDir: string, args: ScorecardArgs, rows: DecisionEvalRunRow[], user: UserInfo): Promise<{ Cells: number; Unreadable: number }> {
    const drift = args.CatalogPath ? await catalogDrift(args.CatalogPath, user) : null;
    const scorecard = BuildDiscoveryEvalScorecard(rows, { Suite: args.Suite, Since: args.Since, Until: args.Until, CatalogDrift: drift });
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, 'scorecard.json'), `${JSON.stringify(scorecard, null, 2)}\n`);
    writeFileSync(join(outDir, 'scorecard.md'), `${RenderDiscoveryEvalScorecard(scorecard)}\n`);
    return { Cells: scorecard.Cells.length, Unreadable: scorecard.UnreadableRuns };
}

/** How the discoverable agents, for this user and as production sees them, differ from the corpus's snapshot. */
async function catalogDrift(catalogPath: string, user: UserInfo): Promise<DiscoveryCatalogDrift> {
    const snapshot = DiscoveryCatalogSnapshotSchema.parse(JSON.parse(readFileSync(catalogPath, 'utf8')));
    const agents = AIEngine.Instance.Agents;
    const manager = agents.find(a => a.Name?.trim().toLowerCase() === CONVERSATION_MANAGER_NAME.toLowerCase());
    if (!manager) {
        throw new Error(`The conversation manager '${CONVERSATION_MANAGER_NAME}' is not in AIEngine metadata`);
    }
    const current = DiscoverableAgentsForCorpus(await DecisionDiscoveryRunnableAgents(agents, user), manager.ID);
    return CompareDiscoveryCatalog(snapshot.agents, current);
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
        const rows = toRunRows(runs, costs);
        const written = args.Decision === 'agent-discovery'
            ? await writeDiscoveryScorecard(outDir, args, rows, ctx.user)
            : writeRoutingScorecard(outDir, args, rows);
        console.log(`${runs.length} run(s) across ${written.Cells} cell(s); ${written.Unreadable} unreadable`);
        console.log(`wrote ${join(outDir, 'scorecard.md')} and scorecard.json`);
    } finally {
        await ctx.pool.close();
    }
}

main().then(() => process.exit(0)).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
});
