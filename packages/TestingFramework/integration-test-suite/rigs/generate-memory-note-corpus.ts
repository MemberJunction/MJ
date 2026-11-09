/**
 * @fileoverview CLI rig to generate synthetic memory note scenarios and candidate notes
 * with ground truth labels and self-reported confidence scores.
 *
 * USAGE:
 *   npx tsx packages/TestingFramework/integration-test-suite/rigs/generate-memory-note-corpus.ts \
 *     --out <dir> [--scenarios 60] [--model "<MJ: AI Models name>"] [--seed 7] [--dry-run]
 *
 * @module @memberjunction/integration-test-suite
 */

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MJGlobal } from '@memberjunction/global';
import { BaseLLM, GetAIAPIKey } from '@memberjunction/ai';
import { AIEngine } from '@memberjunction/aiengine';
import { AssertOutputOutsideRepo, FindRepoRoot } from '@memberjunction/testing-engine';
import {
    FormatConversationExcerpt,
    GenerateScenarioWithRetry,
    PickGenerationModel,
    WriteCorpusFiles,
    type ResolvedGenerationModel
} from '../src/memory-gate-measurement/corpus-generator';
import { ScoreNotesWithRetry } from '../src/memory-gate-measurement/confidence-scorer';
import type { CorpusLabelRecord, CorpusNoteCandidate, CorpusScenario } from '../src/memory-gate-measurement/corpus-types';
import { BootstrapAI } from './lib/ai-bootstrap';

const RIG_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = FindRepoRoot(RIG_DIR) ?? resolve(RIG_DIR, '../../../..');

const DEFAULT_SCENARIOS = 60;
const DEFAULT_SEED = 7;

const USAGE = 'usage: generate-memory-note-corpus.ts --out <dir> [--scenarios 60] [--model "<name>"] [--seed 7] [--dry-run]';

export interface GenerateCorpusArgs {
    OutDir: string;
    Scenarios: number;
    Model: string | undefined;
    Seed: number;
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

export function ParseArgs(argv: readonly string[]): GenerateCorpusArgs {
    const isDryRun = argv.includes('--dry-run');
    const out = readFlag(argv, 'out');
    if (!out && !isDryRun) throw new Error(USAGE);

    return {
        OutDir: out ?? '',
        Scenarios: readInt(argv, 'scenarios', DEFAULT_SCENARIOS),
        Model: readFlag(argv, 'model'),
        Seed: readInt(argv, 'seed', DEFAULT_SEED),
        DryRun: isDryRun
    };
}

function createDriver(model: ResolvedGenerationModel): BaseLLM {
    const apiKey = GetAIAPIKey(model.DriverClass);
    if (!apiKey) {
        throw new Error(`No API key for driver '${model.DriverClass}': set AI_VENDOR_API_KEY__${model.DriverClass} in .env`);
    }
    const driver = MJGlobal.Instance.ClassFactory.CreateInstance<BaseLLM>(BaseLLM, model.DriverClass, apiKey);
    if (!driver) {
        throw new Error(`Driver class '${model.DriverClass}' is not registered on ClassFactory`);
    }
    return driver;
}

async function runLiveGeneration(
    args: GenerateCorpusArgs,
    outDir: string
): Promise<void> {
    const ctx = await BootstrapAI();
    try {
        const model = PickGenerationModel(
            AIEngine.Instance.Models,
            args.Model,
            driverClass => !!GetAIAPIKey(driverClass)
        );
        const driver = createDriver(model);

        console.log(`── Generating ${args.Scenarios} Memory Note Scenarios using ${model.Name} ──`);
        const corpusScenarios: CorpusScenario[] = [];
        const labelRecords: CorpusLabelRecord[] = [];

        for (let i = 0; i < args.Scenarios; i++) {
            const rawScenario = await GenerateScenarioWithRetry(driver, model.APIName, i, args.Scenarios);
            const excerpt = FormatConversationExcerpt(rawScenario.Turns);
            const scenarioId = `scenario-${i + 1}`;

            const scorableCandidates = rawScenario.Notes.map((n, idx) => ({
                NoteId: `${scenarioId}-n${idx + 1}`,
                Type: n.Type,
                ScopeLevel: n.ScopeLevel,
                Content: n.Content
            }));

            // Score confidence in a separate call that does NOT see the labels
            const confidenceScores = await ScoreNotesWithRetry(
                driver,
                model.APIName,
                excerpt,
                scorableCandidates
            );

            const scenarioNotes: CorpusNoteCandidate[] = rawScenario.Notes.map((n, idx) => {
                const noteId = scorableCandidates[idx].NoteId;
                // A note the scorer gave no usable score stays unscored, never a middling 50.
                const selfConfidence = confidenceScores[noteId] ?? null;

                labelRecords.push({ NoteId: noteId, Label: n.Label });

                return {
                    NoteId: noteId,
                    type: n.Type,
                    scopeLevel: n.ScopeLevel,
                    content: n.Content,
                    confidence: selfConfidence ?? undefined,
                    SelfConfidence: selfConfidence
                };
            });

            corpusScenarios.push({
                Id: scenarioId,
                Excerpt: excerpt,
                Notes: scenarioNotes
            });

            if ((i + 1) % 5 === 0 || i + 1 === args.Scenarios) {
                console.log(`   [${i + 1}/${args.Scenarios}] scenarios generated`);
            }
        }

        const { corpusPath, labelsPath } = WriteCorpusFiles(outDir, corpusScenarios, labelRecords, [REPO_ROOT]);
        console.log(`\nSuccessfully wrote corpus files:\n   - ${corpusPath}\n   - ${labelsPath}`);
    } finally {
        await ctx.pool.close();
    }
}

async function main(): Promise<void> {
    const args = ParseArgs(process.argv.slice(2));

    if (args.DryRun) {
        const outDir = args.OutDir ? AssertOutputOutsideRepo(args.OutDir, [REPO_ROOT]) : '(none provided)';
        console.log('── memory note corpus — DRY RUN (no model calls) ──');
        console.log(`   out          : ${outDir}`);
        console.log(`   scenarios    : ${args.Scenarios}`);
        console.log(`   seed         : ${args.Seed}`);
        console.log(`   model target : ${args.Model ?? '(best active LLM with key)'}`);
        console.log(`   calls planned: ${args.Scenarios * 2} (${args.Scenarios} scenario generation + ${args.Scenarios} confidence scoring)`);
        return;
    }

    const outDir = AssertOutputOutsideRepo(args.OutDir, [REPO_ROOT]);
    await runLiveGeneration(args, outDir);
}

// Only invoke main when run directly as script
if (process.argv[1] && process.argv[1].endsWith('generate-memory-note-corpus.ts')) {
    main().then(() => process.exit(0)).catch((err: unknown) => {
        console.error(err instanceof Error ? err.message : String(err));
        process.exit(1);
    });
}
