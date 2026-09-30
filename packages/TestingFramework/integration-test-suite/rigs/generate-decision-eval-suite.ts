/**
 * generate-decision-eval-suite.ts — expands a labelled decision corpus × a matrix of cells into
 * runnable `MJ: Tests` records of the `Decision Eval` test type (plan Tasks 2.1 and 2.2).
 *
 * One record per (point, cell), named `<point id> [<cell label>]`, with a stable ID so regenerating
 * updates records rather than orphaning them, and `RepeatCount` repeats (default 5), so each case's
 * repeatability is measured. Everything that matters is in the testing engine
 * (`@memberjunction/testing-engine`, `decision-eval/`) and unit-tested there; this file reads the
 * files, writes the output and prints the command to push it.
 *
 * THE CORPUS NEVER ENTERS THE REPOSITORY. The corpus is read from `--corpus` (or
 * `MJ_DECISION_EVAL_CORPUS_DIR`), and every generated record carries a corpus point verbatim, so
 * `--out` must be outside every git working tree: the rig refuses outright otherwise.
 *
 * IT NEVER DELETES WHAT IT DIDN'T WRITE. Outside a repository nothing can recover a file, so `--out`
 * must be a new or empty directory. `--force` lets it replace an earlier run there: it removes only
 * the files that run listed in its `generated-files.json`, keeps everything else, and refuses to
 * overwrite a file it didn't write (`WriteGeneratedFiles` in the testing engine).
 *
 * USAGE (from the repo root):
 *   npx tsx packages/TestingFramework/integration-test-suite/rigs/generate-decision-eval-suite.ts \
 *     --corpus <dir> --out <dir> [--matrix <file>] [--reps N] [--label-source construction] \
 *     [--suite <name>] [--limit N] [--force] [--dry-run]
 *
 * `--matrix` defaults to the committed template, metadata-optional/decision-eval/matrix/example.json,
 * whose cells pin no model: copy it outside the repository and fill in the model IDs locally.
 * `--dry-run` prints the counts and a cost estimate and writes nothing. It never pushes: it prints
 * the `mj sync push` command instead.
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    AssertOutputOutsideRepo,
    BuildDecisionEvalSuiteRecord,
    BuildDecisionEvalTestRecord,
    DEFAULT_DECISION_EVAL_REPS,
    DEFAULT_DECISION_EVAL_SUITE_NAME,
    DEFAULT_LABEL_SOURCE,
    EstimateDecisionEvalRun,
    FindRepoRoot,
    IsDecidableOffline,
    JoinDecisionCorpus,
    ParseDecisionCorpus,
    ParseDecisionEvalMatrix,
    ParseDecisionLabels,
    SelectLabelSource,
    WriteGeneratedFiles,
    type DecisionEvalMatrix,
    type GeneratedFile,
    type LabelledDecisionPoint,
    type SyncRecord,
    type WriteGeneratedFilesResult
} from '@memberjunction/testing-engine';

// This package is native ESM, so __dirname does not exist.
const RIG_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = FindRepoRoot(RIG_DIR) ?? resolve(RIG_DIR, '../../../..');
const TEMPLATE_MATRIX = join(REPO_ROOT, 'metadata-optional/decision-eval/matrix/example.json');
const CORPUS_ENV = 'MJ_DECISION_EVAL_CORPUS_DIR';
/** Recorded in the output's manifest: only a manifest this rig wrote lets `--force` remove files. */
const GENERATOR = 'generate-decision-eval-suite';

const USAGE = 'usage: generate-decision-eval-suite.ts --corpus <dir> --out <dir> [--matrix <file>] [--reps N] '
    + '[--label-source construction] [--suite <name>] [--limit N] [--force] [--dry-run]';

/** The command line, read. */
interface GeneratorArgs {
    CorpusDir: string;
    OutDir: string;
    MatrixPath: string;
    Reps: number | null;
    LabelSource: string;
    Suite: string | null;
    Limit: number | null;
    /** Replace an earlier run of this rig in `OutDir`: only the files its manifest lists. */
    Force: boolean;
    DryRun: boolean;
}

/** What was generated, for the summary. */
interface GeneratedSuite {
    SuiteName: string;
    Reps: number;
    Matrix: DecisionEvalMatrix;
    Cases: LabelledDecisionPoint[];
    PointCount: number;
    UnlabelledCount: number;
    OrphanLabelCount: number;
    Records: SyncRecord[];
    Names: string[];
}

function readFlag(argv: readonly string[], name: string): string | undefined {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? argv[i + 1] : undefined;
}

function readPositiveInt(argv: readonly string[], name: string): number | null {
    const raw = readFlag(argv, name);
    if (raw === undefined) {
        return null;
    }
    const value = Number.parseInt(raw, 10);
    if (!Number.isInteger(value) || value < 1) {
        throw new Error(`--${name} must be a positive whole number, got '${raw}'`);
    }
    return value;
}

function parseArgs(argv: readonly string[]): GeneratorArgs {
    const corpus = readFlag(argv, 'corpus') ?? process.env[CORPUS_ENV];
    const out = readFlag(argv, 'out');
    if (!corpus || !out) {
        throw new Error(`${USAGE}\n(--corpus may also come from ${CORPUS_ENV})`);
    }
    return {
        CorpusDir: resolve(corpus),
        OutDir: out,
        MatrixPath: resolve(readFlag(argv, 'matrix') ?? TEMPLATE_MATRIX),
        Reps: readPositiveInt(argv, 'reps'),
        LabelSource: readFlag(argv, 'label-source') ?? DEFAULT_LABEL_SOURCE,
        Suite: readFlag(argv, 'suite') ?? null,
        Limit: readPositiveInt(argv, 'limit'),
        Force: argv.includes('--force'),
        DryRun: argv.includes('--dry-run')
    };
}

/** Reads and validates the corpus, the labels and the matrix, and builds every record. */
function generate(args: GeneratorArgs): GeneratedSuite {
    const points = ParseDecisionCorpus(readFileSync(join(args.CorpusDir, 'corpus.jsonl'), 'utf8'), 'corpus.jsonl');
    const labels = ParseDecisionLabels(readFileSync(join(args.CorpusDir, 'labels.jsonl'), 'utf8'), 'labels.jsonl');
    const joined = JoinDecisionCorpus(points, SelectLabelSource(labels, args.LabelSource, 'labels.jsonl'));
    const cases = args.Limit === null ? joined.Cases : joined.Cases.slice(0, args.Limit);
    const matrix = ParseDecisionEvalMatrix(readFileSync(args.MatrixPath, 'utf8'), args.MatrixPath);
    const reps = args.Reps ?? matrix.reps ?? DEFAULT_DECISION_EVAL_REPS;
    const records = cases.flatMap(c => matrix.cells.map(cell => BuildDecisionEvalTestRecord(c, cell, reps, args.LabelSource)));
    return {
        SuiteName: args.Suite ?? matrix.suiteName ?? DEFAULT_DECISION_EVAL_SUITE_NAME,
        Reps: reps,
        Matrix: matrix,
        Cases: cases,
        PointCount: points.length,
        UnlabelledCount: joined.UnlabelledPointIds.length,
        OrphanLabelCount: joined.OrphanLabelCount,
        Records: records,
        Names: records.map(r => String(r.fields.Name))
    };
}

function jsonFile(relativePath: string, value: object): GeneratedFile {
    return { RelativePath: relativePath, Content: `${JSON.stringify(value, null, 2)}\n` };
}

/**
 * Writes the records, the suite, the sync configs and the provenance into the output directory.
 * With `--force`, the previous run's files are replaced, so a stale record for a dropped point
 * doesn't keep running forever; nothing the rig didn't write is touched.
 */
function writeSuite(outDir: string, args: GeneratorArgs, suite: GeneratedSuite): WriteGeneratedFilesResult {
    const description = `Generated from ${suite.Cases.length} labelled decision point(s) × ${suite.Matrix.cells.length} cell(s). `
        + 'Regenerate with rigs/generate-decision-eval-suite.ts; do not hand-edit.';
    const files: GeneratedFile[] = [
        ...suite.Records.map(record => jsonFile(`tests/.${record.primaryKey.ID}.json`, record)),
        jsonFile('tests/.mj-sync.json', { entity: 'MJ: Tests', filePattern: '**/.*.json' }),
        jsonFile('test-suites/.mj-sync.json', { entity: 'MJ: Test Suites', filePattern: '**/.*.json' }),
        jsonFile('test-suites/.decision-eval-suite.json', [BuildDecisionEvalSuiteRecord(suite.SuiteName, suite.Names, description)]),
        // `emitSyncNotes: false`: every push would otherwise write sync blocks back into generated files.
        jsonFile('.mj-sync.json', {
            version: '1.0.0',
            push: { autoCreateMissingRecords: true },
            directoryOrder: ['tests', 'test-suites'],
            emitSyncNotes: false
        }),
        jsonFile('generated-from.json', provenance(args, suite))
    ];
    return WriteGeneratedFiles(outDir, files, { Generator: GENERATOR, Replace: args.Force });
}

/** Where a generated suite came from: `generated-from.json`. */
interface GenerationProvenance {
    corpus: string;
    labelSource: string;
    matrix: string;
    suiteName: string;
    reps: number;
    cells: string[];
    points: number;
    records: number;
    generatedAt: string;
}

/** Where the suite came from, for `generated-from.json`. */
function provenance(args: GeneratorArgs, suite: GeneratedSuite): GenerationProvenance {
    return {
        corpus: args.CorpusDir,
        labelSource: args.LabelSource,
        matrix: args.MatrixPath,
        suiteName: suite.SuiteName,
        reps: suite.Reps,
        cells: suite.Matrix.cells.map(c => c.label),
        points: suite.Cases.length,
        records: suite.Records.length,
        generatedAt: new Date().toISOString()
    };
}

/** Warnings worth reading before spending a run. */
function warnings(suite: GeneratedSuite): string[] {
    const out: string[] = [];
    const unpinned = suite.Matrix.cells.filter(c => !c.modelId && !c.vendorId).map(c => c.label);
    if (unpinned.length > 0) {
        out.push(`${unpinned.length} cell(s) pin no model (${unpinned.join(', ')}): they run whatever the decision prompt selects, `
            + 'with its failover. Fill modelId in locally (see the template matrix).');
    }
    const sampled = suite.Matrix.cells.filter(c => c.temperature !== undefined || c.seed !== undefined).map(c => c.label);
    if (sampled.length > 0) {
        out.push(`${sampled.join(', ')} ask(s) for a temperature or seed: the decision path does not pass them to the model, `
            + 'so each run records them as not applied.');
    }
    const undecidable = suite.Cases.filter(c => !IsDecidableOffline(c.Point)).length;
    if (undecidable > 0) {
        out.push(`${undecidable} point(s) have nothing to decide (the previous agent never answered in the history): `
            + 'production makes no call there, so their runs will be Skipped, with no model call.');
    }
    if (suite.UnlabelledCount > 0) {
        out.push(`${suite.UnlabelledCount} point(s) have no label from this source and are left out.`);
    }
    if (suite.OrphanLabelCount > 0) {
        out.push(`${suite.OrphanLabelCount} label(s) name a point the corpus doesn't have.`);
    }
    return out;
}

/** Prints the counts, the estimate, any warnings, and what to do next. */
function report(args: GeneratorArgs, outDir: string, suite: GeneratedSuite, written: WriteGeneratedFilesResult | null): void {
    const byLabel = (label: string) => suite.Cases.filter(c => c.Label === label).length;
    const estimate = EstimateDecisionEvalRun(suite.Cases, suite.Matrix.cells, suite.Reps);
    console.log(args.DryRun ? '── decision-eval suite — DRY RUN (nothing written) ──' : '── decision-eval suite generated ──');
    console.log(`   matrix       : ${args.MatrixPath}`);
    console.log(`   label source : ${args.LabelSource}`);
    console.log(`   corpus       : ${suite.PointCount} point(s); ${suite.Cases.length} labelled and used`
        + ` (continue ${byLabel('continue')}, switch ${byLabel('switch')}, ambiguous ${byLabel('ambiguous')})`);
    console.log(`   cells        : ${suite.Matrix.cells.map(c => c.label).join(', ')}`);
    console.log(`   records      : ${suite.Records.length} test(s)${args.DryRun ? ' (would be written)' : ` → ${join(outDir, 'tests')}`}`);
    console.log(`   suite        : ${suite.SuiteName}`);
    console.log(`   reps/record  : ${suite.Reps}`);
    console.log(`   live calls   : ${(suite.Records.length * suite.Reps).toLocaleString()}`);
    const money = estimate.USD === null ? 'unpriced (no cell carries a price)' : `~$${estimate.USD.toFixed(2)}`;
    console.log(`   EST. SPEND   : ${money}  ·  ~${estimate.PromptTokens.toLocaleString()} prompt + ~${estimate.CompletionTokens.toLocaleString()} completion tokens`);
    console.log('                  (a FLOOR: state and questions at chars/4 plus a fixed prompt allowance; reasoning models bill thinking as output)');
    for (const cell of estimate.PerCell) {
        console.log(`                  ${cell.USD === null ? '     ?' : `$${cell.USD.toFixed(2)}`.padStart(8)}  ${cell.Label}`);
    }
    if (written && written.Removed > 0) {
        console.log(`   replaced     : ${written.Removed} file(s) of the earlier run no longer generated were removed`);
    }
    if (written && written.Kept.length > 0) {
        console.log(`   ⚠ ${written.Kept.length} file(s) in ${outDir} were not written by this rig and were left alone `
            + `(${written.Kept.slice(0, 3).join(', ')}${written.Kept.length > 3 ? ', …' : ''}). mj sync may pick up any under tests/ or test-suites/.`);
    }
    for (const warning of warnings(suite)) {
        console.log(`   ⚠ ${warning}`);
    }
    console.log(args.DryRun
        ? `\n   dry run: re-run without --dry-run to write ${suite.Records.length} record(s) to ${outDir}`
        : `\n   next (push the 'Decision Eval' test type from metadata/test-types first):\n     npx mj sync push --dir=${outDir}`);
}

function main(): void {
    const args = parseArgs(process.argv.slice(2));
    // Refuse before reading a single corpus line: nothing derived from it may land in a repository.
    const outDir = AssertOutputOutsideRepo(args.OutDir, [REPO_ROOT]);
    const suite = generate(args);
    const written = args.DryRun ? null : writeSuite(outDir, args, suite);
    report(args, outDir, suite, written);
}

try {
    main();
} catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
}
