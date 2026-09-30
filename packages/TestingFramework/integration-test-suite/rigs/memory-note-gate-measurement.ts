/**
 * @fileoverview CLI measurement rig comparing the memory note typed decision gate
 * against self-reported confidence.
 *
 * Each decision's per-note outcome is written to `<out>/observations.jsonl` (IDs and numbers only).
 * A failed call, and a note without a usable Likelihood, are recorded and counted as such, never
 * scored; a note without a label is left out and counted, never taken for a wrong one.
 * `--rescore <observations.jsonl>` rebuilds the report from an earlier run's observations, with no
 * model call.
 *
 * USAGE:
 *   npx tsx packages/TestingFramework/integration-test-suite/rigs/memory-note-gate-measurement.ts \
 *     --corpus <dir> --out <dir> [--reps 2] [--decision-prompt "Default Decision"] [--decision-model "<name>"]
 *     [--rescore <observations.jsonl>] [--dry-run]
 *
 * @module @memberjunction/integration-test-suite
 */

import { appendFileSync, readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AssertOutputOutsideRepo, FindRepoRoot, PinnedDecisionRunner } from '@memberjunction/testing-engine';
import { BuildMemoryNoteQuestions, BuildMemoryNoteState } from '@memberjunction/ai-agents';
import { AIEngine } from '@memberjunction/aiengine';
import { AIDecisionRunner, AIDecisionParams } from '@memberjunction/ai-prompts';
import type {
    CorpusLabel,
    CorpusLabelRecord,
    CorpusScenario,
    DecisionObservation
} from '../src/memory-gate-measurement/corpus-types';
import { EvaluateMemoryGateMeasurement } from '../src/memory-gate-measurement/evaluator';
import {
    BuildEvaluatedNotes,
    ObservationsForDecision,
    OBSERVATIONS_FILE,
    ParseDecisionObservations,
    SerializeObservation
} from '../src/memory-gate-measurement/observations';
import { WriteMeasurementReportFiles } from '../src/memory-gate-measurement/report-builder';
import { BootstrapAI } from './lib/ai-bootstrap';

const RIG_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = FindRepoRoot(RIG_DIR) ?? resolve(RIG_DIR, '../../../..');

const DEFAULT_REPS = 2;
const DEFAULT_DECISION_PROMPT = 'Default Decision';

const USAGE = 'usage: memory-note-gate-measurement.ts --corpus <dir> --out <dir> [--reps 2] [--decision-prompt "Default Decision"] [--decision-model "<name>"] [--rescore <observations.jsonl>] [--dry-run]';

export interface MeasurementArgs {
    CorpusDir: string;
    OutDir: string;
    Reps: number;
    DecisionPrompt: string;
    DecisionModel: string | undefined;
    /** An earlier run's observations.jsonl to rebuild the report from, with no model call. */
    Rescore: string | undefined;
    DryRun: boolean;
}

function readFlag(argv: readonly string[], name: string): string | undefined {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? argv[i + 1] : undefined;
}

function readInt(argv: readonly string[], name: string, fallback: number): number {
    const raw = readFlag(argv, name);
    if (raw === undefined) return fallback;
    const value = Number.parseInt(raw, 10);
    if (!Number.isInteger(value) || value <= 0) {
        throw new Error(`--${name} must be a positive integer, got '${raw}'`);
    }
    return value;
}

export function ParseArgs(argv: readonly string[]): MeasurementArgs {
    const isDryRun = argv.includes('--dry-run');
    const corpus = readFlag(argv, 'corpus');
    const out = readFlag(argv, 'out');
    if ((!corpus || !out) && !isDryRun) throw new Error(USAGE);

    return {
        CorpusDir: corpus ?? '',
        OutDir: out ?? '',
        Reps: readInt(argv, 'reps', DEFAULT_REPS),
        DecisionPrompt: readFlag(argv, 'decision-prompt') ?? DEFAULT_DECISION_PROMPT,
        DecisionModel: readFlag(argv, 'decision-model'),
        Rescore: readFlag(argv, 'rescore'),
        DryRun: isDryRun
    };
}

export function LoadCorpusData(corpusDir: string): {
    scenarios: CorpusScenario[];
    labels: Map<string, CorpusLabel>;
} {
    const corpusPath = join(corpusDir, 'corpus.jsonl');
    const labelsPath = join(corpusDir, 'labels.jsonl');

    if (!existsSync(corpusPath)) {
        throw new Error(`Corpus file not found: ${corpusPath}`);
    }
    if (!existsSync(labelsPath)) {
        throw new Error(`Labels file not found: ${labelsPath}`);
    }

    const scenarios = readFileSync(corpusPath, 'utf-8')
        .split('\n')
        .filter(l => l.trim().length > 0)
        .map(l => JSON.parse(l) as CorpusScenario);

    const labels = new Map<string, CorpusLabel>();
    readFileSync(labelsPath, 'utf-8')
        .split('\n')
        .filter(l => l.trim().length > 0)
        .forEach(l => {
            const rec = JSON.parse(l) as CorpusLabelRecord;
            labels.set(rec.NoteId, rec.Label);
        });

    return { scenarios, labels };
}

/** Rebuilds the report from the corpus, its labels and the observations, and writes it. */
function writeReport(args: MeasurementArgs, outDir: string, observations: readonly DecisionObservation[]): void {
    const { scenarios, labels } = LoadCorpusData(args.CorpusDir);
    const evaluated = BuildEvaluatedNotes(scenarios, labels, observations);
    const report = EvaluateMemoryGateMeasurement(evaluated.Notes, observations, args.Reps, evaluated);
    const { jsonPath, mdPath } = WriteMeasurementReportFiles(outDir, report, [REPO_ROOT]);
    const e = report.Exclusions;
    console.log(`not scored: ${e.FailedCalls} failed calls, ${e.NoAnswer} missing answers, ${e.UnscoredNotes} notes never answered, ${e.UnlabelledNotes} notes unlabelled`);
    console.log(`\nMeasurement completed successfully:\n   - ${jsonPath}\n   - ${mdPath}`);
}

/** The pinned model's ID, or undefined when no model is pinned. */
function resolvePinnedModelId(modelName: string | undefined): string | undefined {
    if (!modelName) {
        return undefined;
    }
    const model = AIEngine.Instance.Models.find(m => m.Name.trim().toLowerCase() === modelName.trim().toLowerCase());
    if (!model) {
        throw new Error(`Decision model '${modelName}' not found in AIEngine metadata`);
    }
    return model.ID;
}

async function runLiveMeasurement(
    args: MeasurementArgs,
    outDir: string
): Promise<void> {
    const { scenarios } = LoadCorpusData(args.CorpusDir);
    const ctx = await BootstrapAI();
    try {
        const prompt = AIEngine.Instance.Prompts.find(
            p => p.Name.trim().toLowerCase() === args.DecisionPrompt.trim().toLowerCase()
        );
        if (!prompt) {
            throw new Error(`Decision prompt '${args.DecisionPrompt}' not found in AIEngine metadata`);
        }
        const pinnedModelId = resolvePinnedModelId(args.DecisionModel);
        const runner = pinnedModelId ? new PinnedDecisionRunner() : new AIDecisionRunner();
        const observations: DecisionObservation[] = [];
        const observationsPath = join(outDir, OBSERVATIONS_FILE);
        mkdirSync(outDir, { recursive: true });
        writeFileSync(observationsPath, '');

        console.log(`── Running Memory Gate Measurement: ${scenarios.length} scenarios, ${args.Reps} reps ──`);
        for (let rep = 1; rep <= args.Reps; rep++) {
            console.log(`   Starting Repetition ${rep}/${args.Reps}...`);
            for (let sIdx = 0; sIdx < scenarios.length; sIdx++) {
                const scenario = scenarios[sIdx];
                const params = new AIDecisionParams();
                params.prompt = prompt;
                params.contextUser = ctx.user;
                params.State = BuildMemoryNoteState(scenario.Notes, scenario.Excerpt);
                params.Questions = BuildMemoryNoteQuestions(scenario.Notes);
                if (pinnedModelId) {
                    params.override = { modelId: pinnedModelId };
                }

                const start = Date.now();
                const result = await runner.ExecuteDecision(params);
                await runner.WaitForPendingPromptRunSaves();
                const scenarioObservations = ObservationsForDecision(scenario, rep, {
                    Success: result.success,
                    Answers: result.Answers,
                    ModelName: result.modelInfo?.modelName ?? args.DecisionModel ?? 'unknown',
                    LatencyMs: Date.now() - start,
                    CostUsd: result.promptRun?.TotalCost ?? result.promptRun?.Cost ?? 0,
                    PromptRunId: result.promptRun?.ID
                });
                if (!result.success) {
                    console.log(`      [Rep ${rep}] decision failed for ${scenario.Id}: ${result.errorMessage ?? 'no message'}`);
                }
                observations.push(...scenarioObservations);
                appendFileSync(observationsPath, scenarioObservations.map(o => `${SerializeObservation(o)}\n`).join(''));

                if ((sIdx + 1) % 10 === 0 || sIdx + 1 === scenarios.length) {
                    console.log(`      [Rep ${rep}] Evaluated ${sIdx + 1}/${scenarios.length} scenarios`);
                }
            }
        }

        writeReport(args, outDir, observations);
    } finally {
        await ctx.pool.close();
    }
}

/** Rebuilds the report from an earlier run's observations: no model call, no database. */
function rescore(args: MeasurementArgs, outDir: string, observationsFile: string): void {
    const { Observations, Skipped } = ParseDecisionObservations(readFileSync(observationsFile, 'utf-8'));
    console.log(`── Rescoring ${Observations.length} observations from ${observationsFile} (${Skipped} unreadable lines skipped) ──`);
    writeReport(args, outDir, Observations);
}

async function main(): Promise<void> {
    const args = ParseArgs(process.argv.slice(2));

    if (args.DryRun) {
        const outDir = args.OutDir ? AssertOutputOutsideRepo(args.OutDir, [REPO_ROOT]) : '(none provided)';
        console.log('── memory note gate measurement — DRY RUN (no model calls) ──');
        console.log(`   corpus dir     : ${args.CorpusDir || '(none provided)'}`);
        console.log(`   out dir        : ${outDir}`);
        console.log(`   reps           : ${args.Reps}`);
        console.log(`   decision prompt: ${args.DecisionPrompt}`);
        console.log(`   decision model : ${args.DecisionModel ?? '(default prompt model)'}`);
        console.log(`   rescore from   : ${args.Rescore ?? '(none: live decision calls)'}`);
        return;
    }

    const outDir = AssertOutputOutsideRepo(args.OutDir, [REPO_ROOT]);
    if (args.Rescore) {
        rescore(args, outDir, args.Rescore);
        return;
    }
    await runLiveMeasurement(args, outDir);
}

// Only invoke main when run directly as script
if (process.argv[1] && process.argv[1].endsWith('memory-note-gate-measurement.ts')) {
    main().then(() => process.exit(0)).catch((err: unknown) => {
        console.error(err instanceof Error ? err.message : String(err));
        process.exit(1);
    });
}
