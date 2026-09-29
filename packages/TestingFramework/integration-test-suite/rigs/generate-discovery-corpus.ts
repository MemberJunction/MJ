/**
 * generate-discovery-corpus.ts — writes the labelled corpus that measures Sage's agent-discovery
 * decision (typed-decision plan, Task 3.1): user requests that a discoverable agent should handle,
 * and requests that no specialist should, each labelled by construction.
 *
 * WHAT IT DOES
 *   1. Loads the discoverable agents the way production's discovery does, for the context user: the
 *      agents the user may run (Active, with run permission), that can be discovered directly, that
 *      have a description, minus the conversation manager (Sage). The shared functions come from
 *      `@memberjunction/ai-agents`, so the corpus covers exactly the agents the decision can offer.
 *   2. For each agent, asks a chat model for `--per-agent` requests it should handle
 *      (`{ label: 'agent', agentId }`); then `--none` requests no specialist should handle, split
 *      across small talk, questions the conversation manager answers directly, and multi-agent
 *      workflows (`{ label: 'none', kind: 'chat' | 'direct' | 'workflow' }`).
 *   3. Writes `corpus.jsonl`, `labels.jsonl`, `agents.json` (the catalog snapshot, so a run can detect
 *      drift) and `generated-from.json` (the model and counts; no request text) to `--out`.
 *
 * The prompts are the documented constants in `../src/discovery-corpus/prompts.ts`
 * (`DISCOVERY_CORPUS_GENERATION_PROMPT` and its builders). Everything that decides what is asked,
 * validated, deduplicated and labelled is in `../src/discovery-corpus/generator.ts`, unit-tested with
 * a fake chat driver; this file is the shell.
 *
 * THE MODEL CALLS go through an MJ chat driver created off the ClassFactory (`BaseLLM`, by the
 * model's driver class), with the API key read the way the other rigs read keys: `GetAIAPIKey`, i.e.
 * `AI_VENDOR_API_KEY__<DriverClass>` in `.env`. No metadata or prompt records are created. `--model`
 * names an `MJ: AI Models` row; without it, the most powerful active LLM with a key is used.
 *
 * THE CORPUS NEVER ENTERS THE REPOSITORY: `--out` must be outside every git working tree, and the rig
 * refuses outright otherwise. It also refuses to overwrite an existing corpus.
 *
 * USAGE (from the repo root; reads the database named in .env for the agents):
 *   npx tsx packages/TestingFramework/integration-test-suite/rigs/generate-discovery-corpus.ts \
 *     --out <dir> [--per-agent 6] [--none 60] [--model <name>] [--dry-run]
 *
 * `--dry-run` prints the agent count, the model and the planned calls, and makes none.
 */
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MJGlobal } from '@memberjunction/global';
import { BaseLLM, GetAIAPIKey } from '@memberjunction/ai';
import { AIEngine } from '@memberjunction/aiengine';
import type { UserInfo } from '@memberjunction/core';
import { DecisionDiscoveryRunnableAgents, type DecisionDiscoveryOption } from '@memberjunction/ai-agents';
import { CONVERSATION_MANAGER_NAME, FindRepoRoot } from '@memberjunction/testing-engine';
import {
    AssertCorpusOutputDir,
    BuildDiscoveryCorpusFiles,
    DISCOVERY_CORPUS_MAX_RETRIES,
    DiscoverableAgentsForCorpus,
    GenerateOrPlanDiscoveryCorpus,
    PickGenerationModel,
    PlanDiscoveryCorpus,
    type DiscoveryCorpusGenerationResult,
    type DiscoveryCorpusModel,
    type DiscoveryCorpusTask
} from '../src/discovery-corpus/generator';
import { BootstrapAI } from './lib/ai-bootstrap';

// This package is native ESM, so __dirname does not exist.
const RIG_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = FindRepoRoot(RIG_DIR) ?? resolve(RIG_DIR, '../../../..');

const DEFAULT_PER_AGENT = 6;
const DEFAULT_NONE = 60;

const USAGE = 'usage: generate-discovery-corpus.ts --out <dir> [--per-agent 6] [--none 60] [--model <name>] [--dry-run]';

/** The command line, read. */
interface CorpusArgs {
    OutDir: string;
    PerAgent: number;
    None: number;
    Model: string | undefined;
    DryRun: boolean;
}

function readFlag(argv: readonly string[], name: string): string | undefined {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? argv[i + 1] : undefined;
}

function readCount(argv: readonly string[], name: string, fallback: number, minimum: number): number {
    const raw = readFlag(argv, name);
    if (raw === undefined) {
        return fallback;
    }
    const value = Number.parseInt(raw, 10);
    if (!Number.isInteger(value) || value < minimum || String(value) !== raw.trim()) {
        throw new Error(`--${name} must be a whole number of at least ${minimum}, got '${raw}'`);
    }
    return value;
}

function parseArgs(argv: readonly string[]): CorpusArgs {
    const out = readFlag(argv, 'out');
    if (!out) {
        throw new Error(USAGE);
    }
    return {
        OutDir: out,
        PerAgent: readCount(argv, 'per-agent', DEFAULT_PER_AGENT, 1),
        None: readCount(argv, 'none', DEFAULT_NONE, 0),
        Model: readFlag(argv, 'model'),
        DryRun: argv.includes('--dry-run')
    };
}

/** Instantiates the chat driver the way MJ does: off the ClassFactory, by driver class, with its API key. */
function createDriver(model: DiscoveryCorpusModel): BaseLLM {
    const apiKey = GetAIAPIKey(model.DriverClass);
    if (!apiKey) {
        throw new Error(`No API key for driver '${model.DriverClass}': set AI_VENDOR_API_KEY__${model.DriverClass} in .env`);
    }
    const driver = MJGlobal.Instance.ClassFactory.CreateInstance<BaseLLM>(BaseLLM, model.DriverClass, apiKey);
    if (!driver) {
        throw new Error(`Driver class '${model.DriverClass}' is not registered on the ClassFactory`);
    }
    return driver;
}

/** The discoverable agents for the context user, and the conversation manager they exclude. */
async function loadAgents(user: UserInfo): Promise<{ Agents: DecisionDiscoveryOption[]; ManagerId: string }> {
    const all = AIEngine.Instance.Agents;
    const manager = all.find(a => a.Name?.trim().toLowerCase() === CONVERSATION_MANAGER_NAME.toLowerCase());
    if (!manager) {
        throw new Error(`The conversation manager '${CONVERSATION_MANAGER_NAME}' is not in AIEngine metadata`);
    }
    const runnable = await DecisionDiscoveryRunnableAgents(all, user);
    return { Agents: DiscoverableAgentsForCorpus(runnable, manager.ID), ManagerId: manager.ID };
}

/** Prints what the run will do. */
function printPlan(args: CorpusArgs, outDir: string, agents: readonly DecisionDiscoveryOption[], model: DiscoveryCorpusModel, tasks: readonly DiscoveryCorpusTask[]): void {
    const agentRequests = tasks.filter(t => t.Label.label === 'agent').reduce((sum, t) => sum + t.Count, 0);
    const noneRequests = tasks.filter(t => t.Label.label === 'none').reduce((sum, t) => sum + t.Count, 0);
    console.log(args.DryRun ? '── discovery corpus — DRY RUN (no model calls) ──' : '── discovery corpus ──');
    console.log(`   out          : ${outDir}`);
    console.log(`   agents       : ${agents.length} discoverable (runnable, directly discoverable, with a description, minus ${CONVERSATION_MANAGER_NAME})`);
    console.log(`   model        : ${model.Name} (${model.DriverClass}, ${model.APIName})`);
    console.log(`   requests     : ${agentRequests} agent (${args.PerAgent} each) + ${noneRequests} none`);
    console.log(`   planned calls: ${tasks.length} (up to ${tasks.length * (DISCOVERY_CORPUS_MAX_RETRIES + 1)} with retries)`);
}

/** Writes the corpus files and the provenance. */
function writeCorpus(outDir: string, model: DiscoveryCorpusModel, args: CorpusArgs, result: DiscoveryCorpusGenerationResult, agents: readonly DecisionDiscoveryOption[], managerId: string): void {
    const files = BuildDiscoveryCorpusFiles(result.Requests, agents, managerId, randomUUID, new Date());
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, 'corpus.jsonl'), files.Corpus.map(line => JSON.stringify(line)).join('\n') + '\n');
    writeFileSync(join(outDir, 'labels.jsonl'), files.Labels.map(line => JSON.stringify(line)).join('\n') + '\n');
    writeFileSync(join(outDir, 'agents.json'), `${JSON.stringify(files.Agents, null, 2)}\n`);
    writeFileSync(join(outDir, 'generated-from.json'), `${JSON.stringify({
        model: model.Name, driverClass: model.DriverClass, apiName: model.APIName,
        perAgent: args.PerAgent, none: args.None, agents: agents.length,
        requests: files.Corpus.length, calls: result.Calls, retries: result.Retries,
        duplicatesDropped: result.DuplicatesDropped, shortfalls: result.Shortfalls,
        generatedAt: files.Agents.created_at
    }, null, 2)}\n`);
}

/** Prints what was written, and anything short. */
function report(outDir: string, result: DiscoveryCorpusGenerationResult): void {
    console.log(`\n   wrote ${result.Requests.length} request(s) to ${outDir} (corpus.jsonl, labels.jsonl, agents.json, generated-from.json)`);
    console.log(`   calls ${result.Calls} (${result.Retries} retries); near-duplicates dropped ${result.DuplicatesDropped}`);
    for (const shortfall of result.Shortfalls) {
        console.log(`   ⚠ ${shortfall.Task}: ${shortfall.Kept}/${shortfall.Wanted}${shortfall.Reason ? ` — ${shortfall.Reason}` : ' (duplicates dropped)'}`);
    }
}

async function main(): Promise<void> {
    const args = parseArgs(process.argv.slice(2));
    // Refuse before loading anything: nothing generated may land in a repository, or over a corpus.
    const outDir = AssertCorpusOutputDir(args.OutDir, [REPO_ROOT]);
    const ctx = await BootstrapAI();
    try {
        const { Agents: agents, ManagerId: managerId } = await loadAgents(ctx.user);
        const model = PickGenerationModel(AIEngine.Instance.Models, args.Model, driverClass => !!GetAIAPIKey(driverClass));
        const tasks = PlanDiscoveryCorpus(agents, args.PerAgent, args.None);
        printPlan(args, outDir, agents, model, tasks);
        const result = await GenerateOrPlanDiscoveryCorpus({
            DryRun: args.DryRun, CreateDriver: () => createDriver(model), Model: model.APIName, Tasks: tasks, Log: line => console.log(line)
        });
        if (!result) {
            console.log('\n   dry run: nothing called, nothing written. Re-run without --dry-run to generate.');
            return;
        }
        writeCorpus(outDir, model, args, result, agents, managerId);
        report(outDir, result);
    } finally {
        await ctx.pool.close();
    }
}

main().then(() => process.exit(0)).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
});
