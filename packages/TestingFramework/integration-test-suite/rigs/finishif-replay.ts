/**
 * finishif-replay.ts — replays the loop agent's `finishIf` gate on recorded agent runs (plan Task 4.6).
 *
 * The corpus is a database of recorded loop-agent runs. Each round of actions is rebuilt from its
 * steps; the gate's decision is asked about it, evaluated but never acted on; and the report says how
 * often the gate would have ended the run where the model did (the skippable share), where it did not
 * (the false-finish rate), and what that would have saved net of the gate's own cost.
 *
 * - The corpus database is read with plain SELECTs over a separate connection, and never written.
 * - The decision calls run against the database in `.env`, whose prompt runs they save as usual.
 * - The `authored` arm's finishIfs are written by `--author-model` through a `BaseLLM` driver, and
 *   cached in `<out>/authored.jsonl`; each decision is appended to `<out>/decisions.jsonl` as it
 *   returns. The report (`report.md`, `report.json`) names rounds by ID only.
 * - A re-run into the same `--out` reuses both: a round's authored finishIf, and each successful
 *   decision about the same round, arm, rep and questions. A re-run with the same arms and reps
 *   therefore re-scores the corpus with no model call (`--dry-run` prints how many calls remain).
 * - `--decision-model` pins every decision to one model, with failover off, as the other
 *   measurement rigs do; without it the decision prompt selects the model and fails over as usual.
 * - `--out` must be outside every git working tree: the rig refuses outright otherwise.
 * - `--dry-run` reads the corpus, loads the guidance, resolves the author's vendors, checks the
 *   decision prompt exists, and prints the plan. It makes no model or decision call.
 * - `--limit N` sends a seeded sample of N gated rounds to the decision; `--concurrency` (default 4)
 *   bounds the author and decision calls in flight.
 *
 * All logic lives in `../src/finishif-replay/`, pure and unit-tested; this file is the wiring.
 *
 * USAGE (from the repo root; the decision calls use the database in .env):
 *   npx tsx packages/TestingFramework/integration-test-suite/rigs/finishif-replay.ts \
 *     --corpus-db <database> --out <dir> [--arms authored,generic] [--reps 2] [--limit N] [--seed 7] \
 *     [--author-model "<MJ: AI Models name>"] [--decision-prompt "Default Decision"] [--decision-model "<MJ: AI Models name>"]
 *     [--concurrency 4] [--dry-run]
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sql from 'mssql';
import { RunView, type UserInfo } from '@memberjunction/core';
import { MJGlobal, UUIDsEqual } from '@memberjunction/global';
import { BaseLLM, GetAIAPIKey, type DecisionQuestion } from '@memberjunction/ai';
import { AIEngine } from '@memberjunction/aiengine';
import { AgentDecisionService } from '@memberjunction/ai-agents';
import { AIDecisionParams } from '@memberjunction/ai-prompts';
import { TemplateEngineServer } from '@memberjunction/templates';
import { LoadDbConfig, type DbConfig } from '@memberjunction/testing-integration';
import {
    DECISION_EVAL_BOOTSTRAP_RESAMPLES,
    DECISION_EVAL_CALIBRATION_FOLDS,
    FindRepoRoot,
    PinnedDecisionRunner
} from '@memberjunction/testing-engine';
import { BootstrapAI, Settle, type AICtx } from './lib/ai-bootstrap';
import { AuthorFinishIf, ExtractFinishIfGuidance } from '../src/finishif-replay/author';
import { SelectAuthorCandidates, VendorFailoverChat, type AuthorCandidate } from '../src/finishif-replay/author-chat';
import { CreateReplayFileSink, PrepareReplayOutputDir, ReadAuthoredCacheFile, ReadDecisionCacheFile } from '../src/finishif-replay/files';
import { FINISH_IF_PRODUCTION_THRESHOLD, FINISH_IF_SWEEP_THRESHOLDS } from '../src/finishif-replay/metrics';
import { GENERIC_FINISH_IF_QUESTION, type FinishIfReplaySettings } from '../src/finishif-replay/report';
import {
    RunFinishIfReplay,
    type CorpusReader,
    type DecisionReply,
    type FinishIfDecider,
    type FinishIfReplayDeps,
    type FinishIfRoundAuthor,
    type GateCostReader
} from '../src/finishif-replay/replay';
import { NormalizeId } from '../src/finishif-replay/rounds';
import type { FinishIfReplayArm, ReplayPromptRunRow, ReplayStepRow } from '../src/finishif-replay/types';

const RIG_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = FindRepoRoot(RIG_DIR) ?? resolve(RIG_DIR, '../../../..');

const USAGE = 'usage: finishif-replay.ts --corpus-db <database> --out <dir> [--arms authored,generic] [--reps 2] [--limit N] [--seed 7] '
    + '[--author-model "<MJ: AI Models name>"] [--decision-prompt "Default Decision"] [--decision-model "<MJ: AI Models name>"] [--concurrency 4] [--dry-run]';

/** IDs per `IN (...)` list, so no one query grows without bound. */
const ID_CHUNK = 300;

/** How long to wait for the decisions' prompt runs to be saved before reading their cost. */
const COST_POLL_ATTEMPTS = 30;
const COST_POLL_INTERVAL_MS = 2000;

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_-]*$/;
const GUID = /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/i;

/** The command line, read. */
interface ReplayArgs {
    CorpusDb: string;
    OutDir: string;
    Arms: FinishIfReplayArm[];
    Reps: number;
    Limit: number | null;
    Seed: number;
    AuthorModel: string | null;
    DecisionPrompt: string;
    DecisionModel: string | null;
    Concurrency: number;
    DryRun: boolean;
}

function readFlag(argv: readonly string[], name: string): string | undefined {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? argv[i + 1] : undefined;
}

function readInteger(argv: readonly string[], name: string, fallback: number | null, min: number): number | null {
    const raw = readFlag(argv, name);
    if (raw === undefined) {
        return fallback;
    }
    const value = Number(raw);
    if (!Number.isInteger(value) || value < min) {
        throw new Error(`--${name} must be an integer of at least ${min}, got '${raw}'`);
    }
    return value;
}

function readArms(argv: readonly string[]): FinishIfReplayArm[] {
    const raw = (readFlag(argv, 'arms') ?? 'authored,generic').split(',').map(a => a.trim()).filter(a => a.length > 0);
    const arms = raw.filter((a): a is FinishIfReplayArm => a === 'authored' || a === 'generic');
    if (arms.length === 0 || arms.length !== raw.length) {
        throw new Error(`--arms takes authored and/or generic, got '${raw.join(',')}'`);
    }
    return [...new Set(arms)];
}

function parseArgs(argv: readonly string[]): ReplayArgs {
    const corpusDb = readFlag(argv, 'corpus-db');
    const out = readFlag(argv, 'out');
    if (!corpusDb || !out) {
        throw new Error(USAGE);
    }
    if (!IDENTIFIER.test(corpusDb)) {
        throw new Error(`--corpus-db must be a plain database name, got '${corpusDb}'`);
    }
    const args: ReplayArgs = {
        CorpusDb: corpusDb,
        OutDir: out,
        Arms: readArms(argv),
        Reps: readInteger(argv, 'reps', 2, 1) ?? 2,
        Limit: readInteger(argv, 'limit', null, 1),
        Seed: readInteger(argv, 'seed', 7, 0) ?? 7,
        AuthorModel: readFlag(argv, 'author-model') ?? null,
        DecisionPrompt: readFlag(argv, 'decision-prompt') ?? AgentDecisionService.DEFAULT_PROMPT_NAME,
        DecisionModel: readFlag(argv, 'decision-model') ?? null,
        Concurrency: readInteger(argv, 'concurrency', 4, 1) ?? 4,
        DryRun: argv.includes('--dry-run')
    };
    if (args.Arms.includes('authored') && !args.AuthorModel) {
        throw new Error('The authored arm needs --author-model "<MJ: AI Models name>"');
    }
    return args;
}

function settingsOf(args: ReplayArgs): FinishIfReplaySettings {
    return {
        CorpusDatabase: args.CorpusDb,
        DecisionPrompt: args.DecisionPrompt,
        DecisionModel: args.DecisionModel,
        AuthorModel: args.AuthorModel,
        Arms: args.Arms,
        Reps: args.Reps,
        Seed: args.Seed,
        Limit: args.Limit,
        ProductionThreshold: FINISH_IF_PRODUCTION_THRESHOLD,
        Thresholds: [...FINISH_IF_SWEEP_THRESHOLDS],
        GenericQuestion: GENERIC_FINISH_IF_QUESTION,
        BootstrapResamples: DECISION_EVAL_BOOTSTRAP_RESAMPLES,
        CalibrationFolds: DECISION_EVAL_CALIBRATION_FOLDS
    };
}

function chunks<T>(items: readonly T[], size: number): T[][] {
    return Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, (i + 1) * size));
}

// ─── The corpus: read-only SELECTs over its own connection ────────────────────────────────────

async function connectCorpus(db: DbConfig, database: string): Promise<sql.ConnectionPool> {
    return new sql.ConnectionPool({
        server: db.Host,
        port: db.Port,
        user: db.User,
        password: db.Password,
        database,
        options: { encrypt: false, trustServerCertificate: true, readOnlyIntent: true }
    }).connect();
}

/** A corpus reader over its own pool. Every statement is a SELECT. */
function corpusReader(pool: sql.ConnectionPool, schema: string): CorpusReader {
    if (!IDENTIFIER.test(schema)) {
        throw new Error(`The core schema '${schema}' is not a plain identifier`);
    }
    return {
        ReadSteps: async () => {
            // ParentID marks a ForEach or While loop's iterations, and the agent type a Loop agent's
            // runs: production gates neither an iteration nor a non-Loop agent's actions.
            const result = await pool.request().query<ReplayStepRow>(
                `SELECT s.ID, s.AgentRunID, s.ParentID, t.Name AS AgentType, s.StepNumber, s.StepType, s.Status,
                        CASE WHEN s.StepType = 'Actions' THEN s.InputData END AS InputData, s.OutputData, s.TargetLogID
                 FROM [${schema}].[AIAgentRunStep] s
                 LEFT JOIN [${schema}].[AIAgentRun] r ON r.ID = s.AgentRunID
                 LEFT JOIN [${schema}].[AIAgent] a ON a.ID = r.AgentID
                 LEFT JOIN [${schema}].[AIAgentType] t ON t.ID = a.TypeID
                 WHERE s.StepType IN ('Prompt', 'Actions')
                 ORDER BY s.AgentRunID, s.StepNumber, s.StartedAt, s.__mj_CreatedAt`);
            return result.recordset;
        },
        ReadPromptRuns: async ids => {
            const valid = ids.filter(id => GUID.test(id));
            const rows: ReplayPromptRunRow[] = [];
            for (const chunk of chunks(valid, ID_CHUNK)) {
                const result = await pool.request().query<ReplayPromptRunRow>(
                    `SELECT ID, ExecutionTimeMS, CAST(TotalCost AS float) AS TotalCost, CAST(Cost AS float) AS Cost, TokensUsed
                     FROM [${schema}].[AIPromptRun] WHERE ID IN (${chunk.map(id => `'${id}'`).join(', ')})`);
                rows.push(...result.recordset);
            }
            return rows;
        }
    };
}

// ─── The author ───────────────────────────────────────────────────────────────────────────────

/** The loop agent's finishIf guidance, from its system prompt template, where production loads it. */
async function loadGuidance(user: UserInfo): Promise<string> {
    const loop = AIEngine.Instance.AgentTypes.find(t => t.Name.trim().toLowerCase() === 'loop');
    const prompt = loop?.SystemPromptID ? AIEngine.Instance.Prompts.find(p => UUIDsEqual(p.ID, loop.SystemPromptID)) : undefined;
    if (!prompt?.TemplateID) {
        throw new Error('Could not find the Loop agent type\'s system prompt template');
    }
    await TemplateEngineServer.Instance.Config(false, user);
    const template = TemplateEngineServer.Instance.Templates.find(t => UUIDsEqual(t.ID, prompt.TemplateID));
    const text = template?.GetHighestPriorityContent()?.TemplateText;
    if (!text) {
        throw new Error('The Loop agent type\'s system prompt template has no content');
    }
    return ExtractFinishIfGuidance(text);
}

/** The author model's active inference vendors that have an API key. */
function authorCandidates(modelName: string): AuthorCandidate[] {
    const target = modelName.trim().toLowerCase();
    const model = AIEngine.Instance.Models.find(m => m.Name.trim().toLowerCase() === target);
    if (!model) {
        throw new Error(`No AI model named "${modelName}"`);
    }
    const vendors = AIEngine.Instance.ModelVendors.filter(v => UUIDsEqual(v.ModelID, model.ID) && AIEngine.Instance.IsInferenceProvider(v));
    return SelectAuthorCandidates(vendors, driverClass => !!GetAIAPIKey(driverClass));
}

function createDriver(candidate: AuthorCandidate): BaseLLM | null {
    return MJGlobal.Instance.ClassFactory.CreateInstance<BaseLLM>(BaseLLM, candidate.DriverClass, GetAIAPIKey(candidate.DriverClass)) ?? null;
}

async function buildAuthor(args: ReplayArgs, ctx: AICtx): Promise<FinishIfRoundAuthor | null> {
    if (!args.Arms.includes('authored') || !args.AuthorModel) {
        return null;
    }
    const guidance = await loadGuidance(ctx.user);
    const candidates = authorCandidates(args.AuthorModel);
    console.log(`author: ${args.AuthorModel} through ${candidates.map(c => `${c.Vendor} (${c.DriverClass})`).join(', ') || 'no vendor with a key'}; guidance ${guidance.length} chars`);
    if (candidates.length === 0) {
        throw new Error(`"${args.AuthorModel}" has no active inference vendor with an API key (AI_VENDOR_API_KEY__<DriverClass>)`);
    }
    const chat = new VendorFailoverChat(candidates, createDriver);
    return { Author: round => AuthorFinishIf(round, guidance, chat) };
}

// ─── The decision and its cost, on the dev database ──────────────────────────────────────────

/** The ID of the model `--decision-model` names. */
function pinnedModelId(modelName: string): string {
    const target = modelName.trim().toLowerCase();
    const model = AIEngine.Instance.Models.find(m => (m.Name ?? '').trim().toLowerCase() === target);
    if (!model) {
        throw new Error(`No AI model named "${modelName}" to pin the decision to`);
    }
    return model.ID;
}

function buildDecider(args: ReplayArgs, user: UserInfo): FinishIfDecider {
    const target = args.DecisionPrompt.trim().toLowerCase();
    const prompt = AIEngine.Instance.Prompts.find(p => (p.Name ?? '').trim().toLowerCase() === target);
    if (!prompt) {
        throw new Error(`No decision prompt named "${args.DecisionPrompt}"`);
    }
    const modelId = args.DecisionModel ? pinnedModelId(args.DecisionModel) : null;
    const service = new AgentDecisionService();
    // Pinned: the model through the runner's own override, with failover off, as the other rigs pin it.
    // Otherwise: the service the loop agent's gate calls, which selects the model and fails over.
    const ask = modelId
        ? (state: string, questions: Record<string, DecisionQuestion>) => {
            const params = new AIDecisionParams();
            params.prompt = prompt;
            params.contextUser = user;
            params.State = state;
            params.Questions = questions;
            params.override = { modelId };
            return new PinnedDecisionRunner().ExecuteDecision(params);
        }
        : (state: string, questions: Record<string, DecisionQuestion>) =>
            service.Ask({ State: state, Questions: questions, ContextUser: user, PromptName: args.DecisionPrompt });
    return {
        Decide: async (state, questions): Promise<DecisionReply> => {
            const started = Date.now();
            const result = await ask(state, questions);
            return {
                Success: result.success,
                Answers: result.Answers,
                ModelName: result.modelInfo?.modelName ?? null,
                PromptRunID: result.promptRun?.ID ?? null,
                LatencyMs: Date.now() - started,
                Error: result.success ? null : result.errorMessage ?? 'the decision call failed'
            };
        }
    };
}

/** One read of the prompt runs' status and cost. */
async function readPromptRunCosts(rv: RunView, ids: readonly string[], user: UserInfo): Promise<Array<{ ID: string; Status: string; Cost: number | null; TotalCost: number | null }>> {
    const results = await rv.RunViews<{ ID: string; Status: string; Cost: number | null; TotalCost: number | null }>(chunks(ids, ID_CHUNK).map(chunk => ({
        EntityName: 'MJ: AI Prompt Runs',
        ExtraFilter: `ID IN (${chunk.filter(id => GUID.test(id)).map(id => `'${id}'`).join(', ')})`,
        Fields: ['ID', 'Status', 'Cost', 'TotalCost'],
        IgnoreMaxRows: true,
        BypassCache: true,
        ResultType: 'simple' as const
    })), user);
    return results.flatMap(result => {
        if (!result.Success) {
            throw new Error(`Could not read prompt runs: ${result.ErrorMessage ?? 'no message'}`);
        }
        return result.Results;
    });
}

/** Reads the decisions' costs once every prompt run is saved and finished, or the wait runs out. */
function costReader(ctx: AICtx): GateCostReader {
    const rv = new RunView(ctx.provider);
    return {
        ReadCosts: async ids => {
            for (let attempt = 1; ; attempt++) {
                const rows = await readPromptRunCosts(rv, ids, ctx.user);
                const pending = ids.length - rows.filter(r => r.Status !== 'Running').length;
                if (pending === 0 || attempt >= COST_POLL_ATTEMPTS) {
                    console.log(`costs read for ${rows.length} of ${ids.length} decision prompt runs; ${pending} not finished`);
                    return new Map(rows.map(r => [NormalizeId(r.ID), r.TotalCost ?? r.Cost ?? null] as const));
                }
                await Settle(COST_POLL_INTERVAL_MS);
            }
        }
    };
}

async function main(): Promise<void> {
    const args = parseArgs(process.argv.slice(2));
    const outDir = PrepareReplayOutputDir(args.OutDir, [REPO_ROOT]);
    const ctx = await BootstrapAI();
    const db = await LoadDbConfig();
    const corpus = await connectCorpus(db, args.CorpusDb);
    try {
        const deps: FinishIfReplayDeps = {
            Corpus: corpusReader(corpus, db.Schema),
            Author: await buildAuthor(args, ctx),
            Decider: buildDecider(args, ctx.user),
            Costs: costReader(ctx),
            Sink: CreateReplayFileSink(outDir, line => console.log(line)),
            Now: () => new Date()
        };
        const authoredCache = ReadAuthoredCacheFile(outDir);
        const decisionCache = ReadDecisionCacheFile(outDir);
        console.log(`${args.DryRun ? 'DRY RUN: ' : ''}corpus ${args.CorpusDb}; decisions through "${args.DecisionPrompt}"`
            + `${args.DecisionModel ? ` pinned to ${args.DecisionModel}` : ''} on ${db.Database}; `
            + `${authoredCache.size} authored finishIfs and ${decisionCache.size} decisions cached`);
        await RunFinishIfReplay({
            Settings: settingsOf(args),
            DryRun: args.DryRun,
            Concurrency: args.Concurrency,
            AuthoredCache: authoredCache,
            DecisionCache: decisionCache
        }, deps);
    } finally {
        await corpus.close();
        await ctx.pool.close();
    }
}

main().then(() => process.exit(0)).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
});
