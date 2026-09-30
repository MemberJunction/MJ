/**
 * @fileoverview CLI measurement rig comparing the memory note typed decision gate
 * against self-reported confidence.
 *
 * USAGE:
 *   npx tsx packages/TestingFramework/integration-test-suite/rigs/memory-note-gate-measurement.ts \
 *     --corpus <dir> --out <dir> [--reps 2] [--decision-prompt "Default Decision"] [--decision-model "<name>"] [--dry-run]
 *
 * @module @memberjunction/integration-test-suite
 */

import { readFileSync, existsSync } from 'node:fs';
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
import {
    EvaluateMemoryGateMeasurement,
    type EvaluatedNote
} from '../src/memory-gate-measurement/evaluator';
import { WriteMeasurementReportFiles } from '../src/memory-gate-measurement/report-builder';
import { BootstrapAI } from './lib/ai-bootstrap';

const RIG_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = FindRepoRoot(RIG_DIR) ?? resolve(RIG_DIR, '../../../..');

const DEFAULT_REPS = 2;
const DEFAULT_DECISION_PROMPT = 'Default Decision';

const USAGE = 'usage: memory-note-gate-measurement.ts --corpus <dir> --out <dir> [--reps 2] [--decision-prompt "Default Decision"] [--decision-model "<name>"] [--dry-run]';

export interface MeasurementArgs {
    CorpusDir: string;
    OutDir: string;
    Reps: number;
    DecisionPrompt: string;
    DecisionModel: string | undefined;
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

async function runLiveMeasurement(
    args: MeasurementArgs,
    outDir: string
): Promise<void> {
    const { scenarios, labels } = LoadCorpusData(args.CorpusDir);
    const ctx = await BootstrapAI();
    try {
        const prompt = AIEngine.Instance.Prompts.find(
            p => p.Name.trim().toLowerCase() === args.DecisionPrompt.trim().toLowerCase()
        );
        if (!prompt) {
            throw new Error(`Decision prompt '${args.DecisionPrompt}' not found in AIEngine metadata`);
        }

        let pinnedModelId: string | undefined;
        if (args.DecisionModel) {
            const model = AIEngine.Instance.Models.find(
                m => m.Name.trim().toLowerCase() === args.DecisionModel!.trim().toLowerCase()
            );
            if (!model) {
                throw new Error(`Decision model '${args.DecisionModel}' not found in AIEngine metadata`);
            }
            pinnedModelId = model.ID;
        }

        const runner = pinnedModelId ? new PinnedDecisionRunner() : new AIDecisionRunner();
        const observations: DecisionObservation[] = [];
        const evaluatedNotesMap = new Map<string, EvaluatedNote>();

        console.log(`── Running Memory Gate Measurement: ${scenarios.length} scenarios, ${args.Reps} reps ──`);
        for (let rep = 1; rep <= args.Reps; rep++) {
            console.log(`   Starting Repetition ${rep}/${args.Reps}...`);
            for (let sIdx = 0; sIdx < scenarios.length; sIdx++) {
                const scenario = scenarios[sIdx];
                const questions = BuildMemoryNoteQuestions(scenario.Notes);
                const state = BuildMemoryNoteState(scenario.Notes, scenario.Excerpt);

                const params = new AIDecisionParams();
                params.prompt = prompt;
                params.contextUser = ctx.user;
                params.State = state;
                params.Questions = questions;
                if (pinnedModelId) {
                    params.override = { modelId: pinnedModelId };
                }

                const start = Date.now();
                const result = await runner.ExecuteDecision(params);
                await runner.WaitForPendingPromptRunSaves();
                const latencyMs = Date.now() - start;
                const costUsd = result.promptRun?.TotalCost ?? result.promptRun?.Cost ?? 0;
                const modelName = result.modelInfo?.modelName ?? args.DecisionModel ?? 'unknown';

                scenario.Notes.forEach((note, nIdx) => {
                    const key = `n${nIdx + 1}`;
                    const ans = result.Answers[key];
                    const rawProb = (ans && ans.Kind === 'Likelihood' && typeof ans.Probability === 'number')
                        ? ans.Probability
                        : 0.5;

                    observations.push({
                        ScenarioId: scenario.Id,
                        NoteId: note.NoteId,
                        Rep: rep,
                        RawProbability: rawProb,
                        ModelName: modelName,
                        LatencyMs: latencyMs,
                        CostUsd: costUsd / scenario.Notes.length,
                        PromptRunId: result.promptRun?.ID
                    });

                    // Build evaluated note baseline on rep 1
                    if (rep === 1) {
                        const label = labels.get(note.NoteId) ?? 'wrong';
                        evaluatedNotesMap.set(note.NoteId, {
                            ScenarioId: scenario.Id,
                            NoteId: note.NoteId,
                            Label: label,
                            IsDurable: label === 'durable',
                            SelfConfidence: note.SelfConfidence,
                            DecisionRawProbability: rawProb,
                            ModelName: modelName
                        });
                    }
                });

                if ((sIdx + 1) % 10 === 0 || sIdx + 1 === scenarios.length) {
                    console.log(`      [Rep ${rep}] Evaluated ${sIdx + 1}/${scenarios.length} scenarios`);
                }
            }
        }

        const evaluatedNotes = Array.from(evaluatedNotesMap.values());
        const report = EvaluateMemoryGateMeasurement(evaluatedNotes, observations, args.Reps);
        const { jsonPath, mdPath } = WriteMeasurementReportFiles(outDir, report, [REPO_ROOT]);

        console.log(`\nMeasurement completed successfully:\n   - ${jsonPath}\n   - ${mdPath}`);
    } finally {
        await ctx.pool.close();
    }
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
        return;
    }

    const outDir = AssertOutputOutsideRepo(args.OutDir, [REPO_ROOT]);
    await runLiveMeasurement(args, outDir);
}

// Only invoke main when run directly as script
if (process.argv[1] && process.argv[1].endsWith('memory-note-gate-measurement.ts')) {
    main().then(() => process.exit(0)).catch((err: unknown) => {
        console.error(err instanceof Error ? err.message : String(err));
        process.exit(1);
    });
}
