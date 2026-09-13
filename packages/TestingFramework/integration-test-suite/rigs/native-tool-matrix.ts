/**
 * native-tool-matrix.ts — the BaseLLM tool-calling probe.
 *
 * WHAT IT IS. A driver-level sweep: it instantiates each tool-capable driver straight off the
 * ClassFactory with an API key and calls `ChatCompletion` directly. No prompt runner, no agent
 * loop, no database, no metadata. That is deliberate — the questions it answers are about the
 * PROVIDERS, and every MJ layer between the request and the wire is a confound:
 *
 *   - what does `responseFormat: 'JSON'` do when tools are also declared?
 *   - how much do parallel calls, forcing semantics and mixed text+call vary?
 *   - does enabling thinking change any of it?
 *
 * WHAT IT IS NOT. Not a pass/fail test and not part of any suite. Cells report RATES, because what
 * varies run to run is the model's choice — that is the quantity being measured, not flakiness.
 * Nothing here asserts; `mj test` never dispatches it. The corpus-scale measurement with
 * significance testing runs on the real corpus, through the TestingFramework.
 *
 * All evaluation logic lives in `../src/native-tool-matrix/` as framework-free pure functions
 * (test plan §2.1) and is unit-tested there. This file is the shell: arguments, drivers, the loop,
 * and writing results out.
 *
 * SAFETY. Dry-run by DEFAULT. It prints the cell manifest and estimated token spend and exits;
 * `--live` is required before a single request goes out.
 *
 * USAGE (from the repo root — `.env` is resolved cwd-relative):
 *   npx tsx packages/TestingFramework/integration-test-suite/rigs/native-tool-matrix.ts
 *   npx tsx packages/TestingFramework/integration-test-suite/rigs/native-tool-matrix.ts --live --reps 3 --label phase-b-2026-09
 *   … --live --models gemini --scenarios envelope --modes auto,required   # one slice
 *   … --rerender plans/native-tool-calling/results/<label>.jsonl            # redraw, no calls
 *
 * KEYS. Read through MJ's own `GetAIAPIKey`, i.e. `AI_VENDOR_API_KEY__<DriverClass>` in `.env`
 * (`AI_VENDOR_API_KEY__AnthropicLLM`, `…__OpenAILLM`, `…__GeminiLLM`). A model whose key is missing
 * is skipped loudly, never silently.
 */
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
// Imported from the package directly, NOT via ./lib/harness — direct import is the shim's own
// documented end-state, so new rigs should start there rather than add another consumer to a
// file that is slated for deletion.
import { LoadEnv } from '@memberjunction/testing-integration';
import { MJGlobal } from '@memberjunction/global';
import { BaseLLM, ChatMessageRole, ChatParams, ChatResult, GetAIAPIKey } from '@memberjunction/ai';
import type { ChatMessage, ChatToolChoice } from '@memberjunction/ai';
// Registers the LLM drivers (AnthropicLLM / OpenAILLM / GeminiLLM …) on the ClassFactory. The
// "lite" bootstrap deliberately excludes @memberjunction/server, so this costs a registry and
// nothing else — no config validation, no DB.
import '@memberjunction/server-bootstrap-lite';
import { buildManifest, DEFAULT_MATRIX_SPEC, expandMatrix } from '../src/native-tool-matrix/matrix';
import { buildUserPrompt, getScenario } from '../src/native-tool-matrix/scenarios';
import { observeChatResult } from '../src/native-tool-matrix/observe';
import { isAuthFailure } from '../src/native-tool-matrix/credentials';
import { renderScorecard, summarizeCells } from '../src/native-tool-matrix/report';
import type { ProbeRecord } from '../src/native-tool-matrix/report';
import type { MatrixCell, MatrixModel, MatrixSpec, ProbeResponseFormat, ProbeScenario, ProbeToolMode } from '../src/native-tool-matrix/types';

/** Bounds every probe reply. Big enough for two tool calls and a sentence, small enough to be cheap. */
const MAX_OUTPUT_TOKENS = 1024;

/** Consecutive auth failures that end a model's sweep. Three rules out a one-off blip. */
const AUTH_FAILURE_ABORT_THRESHOLD = 3;

interface RigOptions {
    live: boolean;
    /** Path to a prior run's JSONL. Re-renders its scorecard from disk and sends no requests. */
    rerender: string | null;
    label: string;
    reps: number;
    outDir: string;
    matrixFile: string | null;
    modelFilter: string[];
    scenarioFilter: string[];
    modeFilter: string[];
    formatFilter: string[];
}

function readFlag(argv: string[], name: string): string | undefined {
    const index = argv.indexOf(`--${name}`);
    return index >= 0 ? argv[index + 1] : undefined;
}

function readList(argv: string[], name: string): string[] {
    const raw = readFlag(argv, name);
    return raw ? raw.split(',').map((v) => v.trim()).filter((v) => v.length > 0) : [];
}

function parseArgs(argv: string[]): RigOptions {
    const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '');
    return {
        live: argv.includes('--live'),
        rerender: readFlag(argv, 'rerender') ?? null,
        label: readFlag(argv, 'label') ?? `phase-b-${stamp}`,
        reps: Number.parseInt(readFlag(argv, 'reps') ?? String(DEFAULT_MATRIX_SPEC.reps), 10),
        outDir: resolve(readFlag(argv, 'out') ?? 'plans/native-tool-calling/results'),
        matrixFile: readFlag(argv, 'matrix') ?? null,
        modelFilter: readList(argv, 'models'),
        scenarioFilter: readList(argv, 'scenarios'),
        modeFilter: readList(argv, 'modes'),
        formatFilter: readList(argv, 'formats')
    };
}

/** Applies `--matrix` and the `--models`/`--scenarios`/`--modes`/`--formats` slice filters. */
function buildSpec(options: RigOptions): MatrixSpec {
    const base: MatrixSpec = options.matrixFile
        ? (JSON.parse(readFileSync(resolve(options.matrixFile), 'utf-8')) as MatrixSpec)
        : DEFAULT_MATRIX_SPEC;

    const matchesModel = (m: MatrixModel): boolean =>
        options.modelFilter.length === 0 || options.modelFilter.some((f) => `${m.label} ${m.apiName} ${m.developer}`.toLowerCase().includes(f.toLowerCase()));

    // `--scenarios` SELECTS rather than filters, so the MJ-action mapping probes — which are kept
    // out of the default sweep to bound its cost — can be asked for by name. getScenario throws on
    // an unknown id, so a typo fails loudly instead of quietly running nothing.
    const scenarioIds = options.scenarioFilter.length > 0
        ? options.scenarioFilter.map((id) => getScenario(id).id)
        : base.scenarioIds;

    return {
        models: base.models.filter(matchesModel),
        scenarioIds,
        toolModes: base.toolModes.filter((m) => options.modeFilter.length === 0 || options.modeFilter.includes(m)),
        responseFormats: base.responseFormats.filter((f) => options.formatFilter.length === 0 || options.formatFilter.includes(f)),
        reps: options.reps
    };
}

/** Maps a probe mode onto the wire-level `toolChoice`, or `undefined` when nothing is forced. */
function toolChoiceFor(mode: ProbeToolMode, scenario: ProbeScenario): ChatToolChoice | undefined {
    switch (mode) {
        case 'auto': return 'auto';
        case 'none': return 'none';
        case 'required': return 'required';
        case 'named': return scenario.forcedToolName ? { name: scenario.forcedToolName } : undefined;
        case 'no-tools': return undefined;
        default: return undefined;
    }
}

function messagesFor(scenario: ProbeScenario, responseFormat: ProbeResponseFormat): ChatMessage[] {
    const messages: ChatMessage[] = [];
    if (scenario.systemPrompt) {
        messages.push({ role: ChatMessageRole.system, content: scenario.systemPrompt });
    }
    messages.push({ role: ChatMessageRole.user, content: buildUserPrompt(scenario, responseFormat) });
    return messages;
}

/** Builds the exact request a cell sends. The only difference between cells is what this returns. */
function buildChatParams(cell: MatrixCell, scenario: ProbeScenario): ChatParams {
    const params = new ChatParams();
    params.model = cell.model.apiName;
    params.messages = messagesFor(scenario, cell.responseFormat);
    params.responseFormat = cell.responseFormat;
    params.maxOutputTokens = MAX_OUTPUT_TOKENS;
    if (cell.toolMode !== 'no-tools') {
        params.tools = scenario.tools;
        params.toolChoice = toolChoiceFor(cell.toolMode, scenario);
    }
    if (cell.effortLevel !== null) {
        params.effortLevel = cell.effortLevel;
        params.reasoningBudgetTokens = cell.model.reasoningBudgetTokens;
    }
    return params;
}

/** Why a model is not being swept, for the end-of-run summary. */
interface SkippedModel {
    label: string;
    reason: string;
}

/**
 * One minimal call to prove the credential works before committing to a model's whole sweep.
 *
 * Without this a revoked key produces one identical 401 per cell — 90 of them on the default
 * matrix — which costs wall-clock, buries the real findings in the error table, and reports the
 * model as having a 100% failure rate when it was never actually asked anything. The probe is
 * eight output tokens.
 */
async function preflightCredential(driver: BaseLLM, model: MatrixModel): Promise<{ ok: boolean; reason: string }> {
    const params = new ChatParams();
    params.model = model.apiName;
    params.maxOutputTokens = 8;
    params.messages = [{ role: ChatMessageRole.user, content: 'hi' }];
    try {
        const result = await driver.ChatCompletion(params);
        if (result.success) {
            return { ok: true, reason: '' };
        }
        const message = result.errorMessage ?? 'unknown error';
        // Only a credential failure is disqualifying. Anything else — a quota, a bad model id, a
        // transient 5xx — is the sweep's business to observe, not the preflight's to veto.
        return isAuthFailure(message)
            ? { ok: false, reason: `credential rejected — ${message.slice(0, 160)}` }
            : { ok: true, reason: '' };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return isAuthFailure(message)
            ? { ok: false, reason: `credential rejected — ${message.slice(0, 160)}` }
            : { ok: true, reason: '' };
    }
}

/** Instantiates a driver the way MJ does — off the ClassFactory, by registered driver-class name. */
function createDriver(model: MatrixModel): BaseLLM {
    const apiKey = GetAIAPIKey(model.driverClass);
    if (!apiKey) {
        throw new Error(`No API key for driver '${model.driverClass}' — set AI_VENDOR_API_KEY__${model.driverClass} in .env`);
    }
    const driver = MJGlobal.Instance.ClassFactory.CreateInstance<BaseLLM>(BaseLLM, model.driverClass, apiKey);
    if (!driver) {
        throw new Error(`Driver class '${model.driverClass}' is not registered on the ClassFactory`);
    }
    return driver;
}

/**
 * Runs one repetition. A thrown provider error becomes an unsuccessful `ChatResult` rather than
 * ending the sweep — a cell that cannot run is itself a finding (Gemini 2.x rejecting JSON mode
 * alongside tools is the case the audit predicts), and losing the remaining 200 cells to it would
 * be the harness deciding what the data says.
 */
async function runOnce(driver: BaseLLM, cell: MatrixCell, scenario: ProbeScenario, label: string, rep: number): Promise<ProbeRecord> {
    const params = buildChatParams(cell, scenario);
    const startedAt = Date.now();
    let result: ChatResult;
    try {
        result = await driver.ChatCompletion(params);
    } catch (error) {
        result = new ChatResult(false, new Date(startedAt), new Date());
        result.errorMessage = error instanceof Error ? error.message : String(error);
        result.exception = error;
    }
    const latencyMs = Date.now() - startedAt;
    return {
        label,
        timestamp: new Date().toISOString(),
        cellId: cell.id,
        modelLabel: cell.model.label,
        apiName: cell.model.apiName,
        developer: cell.model.developer,
        generation: cell.model.generation,
        driverClass: cell.model.driverClass,
        scenarioId: cell.scenarioId,
        toolMode: cell.toolMode,
        responseFormat: cell.responseFormat,
        effortLevel: cell.effortLevel,
        rep,
        latencyMs,
        observation: observeChatResult(result, scenario, cell.toolMode, cell.toolMode !== 'no-tools')
    };
}

/** One line per repetition, appended as it lands so an interrupted sweep keeps what it measured. */
function appendRecord(jsonlPath: string, record: ProbeRecord): void {
    appendFileSync(jsonlPath, `${JSON.stringify(record)}\n`, 'utf-8');
}

function progressLine(record: ProbeRecord): string {
    const o = record.observation;
    const outcome = o.driverSucceeded
        ? `${o.channel} calls=${o.nativeToolCallCount} decision=${o.decisionCorrect ? '✓' : '✗'} finish=${o.finishReason ?? '—'}`
        : `ERROR ${o.errorMessage?.slice(0, 100)}`;
    return `  ${record.cellId} #${record.rep}  ${String(record.latencyMs).padStart(6)}ms  ${outcome}`;
}

/**
 * Runs every cell for one model, serially.
 *
 * Serial within a model and parallel across models: providers rate-limit per key, and a probe that
 * spent its run hitting 429s would measure our concurrency rather than their behavior.
 */
async function runModel(
    model: MatrixModel,
    cells: MatrixCell[],
    reps: number,
    label: string,
    jsonlPath: string,
    skipped: SkippedModel[]
): Promise<ProbeRecord[]> {
    let driver: BaseLLM;
    try {
        driver = createDriver(model);
    } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        console.warn(`⏭  SKIPPING ${model.label}: ${reason}`);
        skipped.push({ label: model.label, reason });
        return [];
    }

    const credential = await preflightCredential(driver, model);
    if (!credential.ok) {
        console.warn(`⏭  SKIPPING ${model.label}: ${credential.reason}`);
        skipped.push({ label: model.label, reason: credential.reason });
        return [];
    }
    console.log(`▶  ${model.label} (${model.apiName}) — ${cells.length} cells × ${reps}`);

    const records: ProbeRecord[] = [];
    let consecutiveAuthFailures = 0;
    for (const cell of cells) {
        const scenario = getScenario(cell.scenarioId);
        for (let rep = 1; rep <= reps; rep++) {
            const record = await runOnce(driver, cell, scenario, label, rep);
            appendRecord(jsonlPath, record);
            records.push(record);
            console.log(progressLine(record));

            // A key can be revoked mid-run. Preflight passing does not make the rest of the sweep
            // immune, and grinding through the remainder proves nothing once auth is gone.
            const failedOnAuth = !record.observation.driverSucceeded && isAuthFailure(record.observation.errorMessage ?? '');
            consecutiveAuthFailures = failedOnAuth ? consecutiveAuthFailures + 1 : 0;
            if (consecutiveAuthFailures >= AUTH_FAILURE_ABORT_THRESHOLD) {
                const reason = `credential stopped working mid-sweep after ${records.length} calls`;
                console.warn(`⏭  ABANDONING ${model.label}: ${reason}`);
                skipped.push({ label: model.label, reason });
                return records;
            }
        }
    }
    return records;
}

function printManifest(spec: MatrixSpec, live: boolean): { cells: MatrixCell[]; skippedCount: number } {
    const expanded = expandMatrix(spec);
    const manifest = buildManifest(expanded, spec.reps);
    console.log('── BaseLLM tool-calling matrix ──');
    console.log(`   models      : ${spec.models.map((m) => m.label).join(', ') || '(none — check --models)'}`);
    console.log(`   scenarios   : ${spec.scenarioIds.join(', ')}`);
    console.log(`   tool modes  : ${spec.toolModes.join(', ')}`);
    console.log(`   formats     : ${spec.responseFormats.join(', ')}`);
    console.log(`   cells       : ${manifest.cellCount} (+${manifest.skippedCount} skipped as vacuous) × ${spec.reps} reps = ${manifest.callCount} live calls`);
    console.log(`   est. tokens : ~${manifest.estimatedPromptTokens.toLocaleString()} prompt + ~${manifest.estimatedCompletionTokens.toLocaleString()} completion`);
    for (const entry of manifest.perModel) {
        console.log(`     ${entry.label.padEnd(20)} ${String(entry.calls).padStart(4)} calls  ~${entry.estimatedTokens.toLocaleString()} tokens`);
    }
    if (!live) {
        console.log('\n   Skipped combinations:');
        for (const skip of expanded.skipped) {
            console.log(`     ${skip.id}  —  ${skip.reason}`);
        }
        console.log('\n   DRY RUN — no requests sent. Re-run with --live to execute.');
    }
    return { cells: expanded.cells, skippedCount: expanded.skipped.length };
}

/** Writes the JSONL evidence path and the rendered scorecard beside it. */
function writeResults(options: RigOptions, records: ProbeRecord[], meta: { startedAt: string; cellCount: number; skippedCount: number }): string {
    const summaries = summarizeCells(records);
    const markdown = renderScorecard(summaries, {
        label: options.label,
        startedAt: meta.startedAt,
        finishedAt: new Date().toISOString(),
        reps: options.reps,
        cellCount: meta.cellCount,
        skippedCount: meta.skippedCount,
        callCount: records.length
    });
    const scorecardPath = join(options.outDir, `${options.label}.md`);
    writeFileSync(scorecardPath, markdown, 'utf-8');
    return scorecardPath;
}

/**
 * Re-renders a prior run's scorecard from its JSONL.
 *
 * The records are the evidence and the scorecard is a view of them, so improving how a number is
 * presented must never cost another round of live calls. Every section of the report was iterated
 * this way against the first Google sweep.
 */
function rerenderFromRecords(options: RigOptions): void {
    const path = resolve(options.rerender ?? '');
    const records = readFileSync(path, 'utf-8').split('\n').filter((line) => line.trim().length > 0).map((line) => JSON.parse(line) as ProbeRecord);
    if (records.length === 0) {
        throw new Error(`No records in ${path}`);
    }
    const label = records[0].label;
    const cellCount = new Set(records.map((r) => r.cellId)).size;
    const reps = Math.max(...records.map((r) => r.rep));
    const markdown = renderScorecard(summarizeCells(records), {
        label,
        startedAt: records[0].timestamp,
        finishedAt: records[records.length - 1].timestamp,
        reps, cellCount, skippedCount: null, callCount: records.length
    });
    const scorecardPath = join(resolve(options.outDir), `${label}.md`);
    writeFileSync(scorecardPath, markdown, 'utf-8');
    console.log(`✔  re-rendered ${records.length} records from ${path}\n   scorecard ${scorecardPath}`);
}

async function main(): Promise<void> {
    LoadEnv();
    const options = parseArgs(process.argv.slice(2));
    if (options.rerender) {
        rerenderFromRecords(options);
        return;
    }
    const spec = buildSpec(options);
    const { cells, skippedCount } = printManifest(spec, options.live);
    if (!options.live) {
        return;
    }

    mkdirSync(options.outDir, { recursive: true });
    const jsonlPath = join(options.outDir, `${options.label}.jsonl`);
    writeFileSync(jsonlPath, '', 'utf-8');
    const startedAt = new Date().toISOString();

    const skippedModels: SkippedModel[] = [];
    const byModel = spec.models.map((model) =>
        runModel(model, cells.filter((c) => c.model.apiName === model.apiName), spec.reps, options.label, jsonlPath, skippedModels));
    const records = (await Promise.all(byModel)).flat();

    if (records.length === 0) {
        // Every model was skipped. Writing an empty scorecard would look like a run that found
        // nothing, rather than one that never got to ask.
        console.error(`\n✖  no model produced a single call — nothing to report`);
        for (const skip of skippedModels) {
            console.error(`     ${skip.label}: ${skip.reason}`);
        }
        process.exitCode = 1;
        return;
    }

    const scorecardPath = writeResults(options, records, { startedAt, cellCount: cells.length, skippedCount });
    const failures = records.filter((r) => !r.observation.driverSucceeded).length;
    console.log(`\n✔  ${records.length} calls (${failures} provider failures)\n   records   ${jsonlPath}\n   scorecard ${scorecardPath}`);
    if (skippedModels.length > 0) {
        // Loud, and last: a scorecard covering four of seven models must not read as covering seven.
        console.warn(`\n⚠  ${skippedModels.length} model(s) NOT measured — this scorecard is partial:`);
        for (const skip of skippedModels) {
            console.warn(`     ${skip.label}: ${skip.reason}`);
        }
    }
}

main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack : String(error));
    process.exit(1);
});
