/**
 * @fileoverview Fits Platt calibrations for any decision use and any decision model, in one run,
 * and writes them ready to paste into the model catalog.
 *
 * Two sources of labelled points:
 * - `--points <points.jsonl>`: one `CalibrationPoint` per line (`Use`, `Question`, `ModelName`,
 *   `ResolvedModel`, `RawProbability`, `Label`, optional `Weight` and `Fold`), as a measurement rig
 *   or an export writes them. No database is needed.
 * - `--labels <labels.jsonl>`: one label per line (`PromptRunID`, `Question`, and `Label` or
 *   `ExpectedValue`, optional `Use`, `Weight`, `Fold`), naming decision prompt runs already in the
 *   database: production runs, shadow runs or eval runs. The rig reads each run's model, resolved
 *   model and answer from `MJ: AI Prompt Runs` (connecting as the other rigs do, through `.env`) and
 *   builds the points. `--use` names the use for labels that name none.
 *
 * Points are grouped by (use, question, model, resolved model) and each group is fitted and scored
 * out of fold (`FitDecisionCalibrations` in `@memberjunction/testing-engine`). `--target-prior`
 * re-targets each fit's intercept from the corpus's class mix to production's.
 *
 * Writes, outside any repository (the points are derived from the corpus or from real
 * conversations):
 * - `calibrations.json`: `[{ ModelName, Calibrations: [{ Use, Question, ResolvedModel, A, B, FittedOn }] }]`.
 *   Paste each model's `Calibrations` into `ModelConfiguration.Decision.Calibrations` on its
 *   `MJ: AI Models` row in `metadata/ai-models/` (merge with the entries already there: replace an
 *   entry with the same `Use`, `Question` and `ResolvedModel`, keep the rest).
 * - `report.md`: every group's counts, raw and calibrated scores, parameters, or why it was refused.
 * - `points.jsonl`: the points fitted (numbers and keys only), to refit or audit later.
 *
 * USAGE:
 *   npx tsx packages/TestingFramework/integration-test-suite/rigs/fit-decision-calibration.ts \
 *     --out <dir> (--points <points.jsonl> | --labels <labels.jsonl> [--use <use>]) \
 *     [--target-prior 0.9 | --target-prior conversation-routing=0.9,*=0.3] \
 *     [--min-points 30] [--min-per-class 5] [--folds 5] [--seed <n>] [--threshold 0.5] \
 *     [--corpus-label "<text>"] [--force]
 *
 * Exit codes: 0 when at least one group was fitted, 2 when none was, 1 on an error.
 *
 * @module @memberjunction/integration-test-suite
 */

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RunView, type UserInfo } from '@memberjunction/core';
import { EscapeSQLString } from '@memberjunction/global';
import {
    AssertOutputOutsideRepo,
    BuildPointsFromPromptRuns,
    FindRepoRoot,
    FitDecisionCalibrations,
    LabelledPromptRunIDs,
    ParseCalibrationLabelsJsonl,
    ParseCalibrationPointsJsonl,
    RenderCalibrationFitReport,
    WriteGeneratedFiles,
    type CalibrationFitResult,
    type CalibrationPoint,
    type DecisionPromptRunRow,
    type JsonlLineError
} from '@memberjunction/testing-engine';
import { ParseFitCalibrationArgs, type FitCalibrationArgs } from '../src/calibration-fit/args';
import { BootstrapAI } from './lib/ai-bootstrap';

const RIG_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = FindRepoRoot(RIG_DIR) ?? resolve(RIG_DIR, '../../../..');
const GENERATOR = 'fit-decision-calibration';
const ID_CHUNK = 300;

/** Reports a file's unreadable lines, and stops when the file had nothing readable. */
function reportLineErrors(file: string, errors: readonly JsonlLineError[], readable: number): void {
    for (const error of errors.slice(0, 20)) {
        console.warn(`${file}:${error.Line}: ${error.Reason}`);
    }
    if (errors.length > 20) {
        console.warn(`${file}: … and ${errors.length - 20} more unreadable line(s)`);
    }
    if (readable === 0) {
        throw new Error(`${file} has no readable lines`);
    }
}

function readPointsFile(path: string): CalibrationPoint[] {
    const { Points, Errors } = ParseCalibrationPointsJsonl(readFileSync(path, 'utf-8'));
    reportLineErrors(path, Errors, Points.length);
    return Points;
}

/** The labelled decision prompt runs, read in batches of IDs. */
async function loadPromptRuns(rv: RunView, ids: readonly string[], user: UserInfo): Promise<DecisionPromptRunRow[]> {
    const batches = Array.from({ length: Math.ceil(ids.length / ID_CHUNK) }, (_, i) => ids.slice(i * ID_CHUNK, (i + 1) * ID_CHUNK));
    const results = await rv.RunViews<DecisionPromptRunRow>(batches.map(batch => ({
        EntityName: 'MJ: AI Prompt Runs',
        ExtraFilter: `ID IN (${batch.map(id => `'${EscapeSQLString(id)}'`).join(', ')})`,
        Fields: ['ID', 'Model', 'Result', 'ModelSpecificResponseDetails', 'Success'],
        IgnoreMaxRows: true,
        ResultType: 'simple' as const
    })), user);
    return results.flatMap(result => {
        if (!result.Success) {
            throw new Error(`Could not read the decision prompt runs: ${result.ErrorMessage ?? 'no message'}`);
        }
        return result.Results;
    });
}

/** Builds the points from labels joined to their decision prompt runs in the database. */
async function readLabelledRuns(path: string, use: string | undefined): Promise<CalibrationPoint[]> {
    const { Labels, Errors } = ParseCalibrationLabelsJsonl(readFileSync(path, 'utf-8'));
    reportLineErrors(path, Errors, Labels.length);
    const ctx = await BootstrapAI();
    try {
        const runs = await loadPromptRuns(new RunView(ctx.provider), LabelledPromptRunIDs(Labels), ctx.user);
        const { Points, Unused } = BuildPointsFromPromptRuns(runs, Labels, use);
        for (const unused of Unused.slice(0, 20)) {
            console.warn(`label ${unused.PromptRunID} / ${unused.Question}: ${unused.Reason}`);
        }
        if (Unused.length > 20) {
            console.warn(`… and ${Unused.length - 20} more unused label(s)`);
        }
        console.log(`${Points.length} point(s) from ${runs.length} run(s); ${Unused.length} label(s) unused`);
        return Points;
    } finally {
        await ctx.pool.close();
    }
}

function fit(points: readonly CalibrationPoint[], args: FitCalibrationArgs): CalibrationFitResult {
    return FitDecisionCalibrations(points, {
        TargetPrior: args.TargetPrior,
        MinPoints: args.MinPoints,
        MinPerClass: args.MinPerClass,
        Folds: args.Folds,
        Seed: args.Seed,
        Threshold: args.Threshold,
        CorpusLabel: args.CorpusLabel
    });
}

function writeOutput(outDir: string, points: readonly CalibrationPoint[], result: CalibrationFitResult, force: boolean): void {
    WriteGeneratedFiles(outDir, [
        { RelativePath: 'calibrations.json', Content: `${JSON.stringify(result.Entries, null, 2)}\n` },
        { RelativePath: 'report.md', Content: RenderCalibrationFitReport(result) },
        { RelativePath: 'points.jsonl', Content: points.map(p => JSON.stringify(p)).join('\n') + '\n' }
    ], { Generator: GENERATOR, Replace: force });
}

async function main(): Promise<number> {
    const args = ParseFitCalibrationArgs(process.argv.slice(2));
    const outDir = AssertOutputOutsideRepo(args.OutDir, [REPO_ROOT]);
    const points = args.Source.Kind === 'points'
        ? readPointsFile(args.Source.PointsPath)
        : await readLabelledRuns(args.Source.LabelsPath, args.Source.Use);
    const result = fit(points, args);
    writeOutput(outDir, points, result, args.Force);
    const fitted = result.Groups.filter(g => g.Entry).length;
    console.log(`${fitted} of ${result.Groups.length} group(s) fitted; ${result.Skipped.length} point(s) skipped`);
    console.log(`wrote ${join(outDir, 'calibrations.json')}, report.md and points.jsonl`);
    return fitted > 0 ? 0 : 2;
}

main().then(code => process.exit(code)).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
});
