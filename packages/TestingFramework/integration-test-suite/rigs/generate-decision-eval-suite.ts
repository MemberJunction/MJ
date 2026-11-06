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
 *     --corpus <dir> --out <dir> [--decision conversation-routing|agent-discovery] [--matrix <file>] \
 *     [--reps N] [--label-source construction] [--suite <name>] [--limit N] [--force] [--dry-run]
 *
 * `--matrix` defaults to the committed template, metadata-optional/decision-eval/matrix/example.json,
 * whose cells pin no model: copy it outside the repository and fill in the model IDs locally.
 * `--dry-run` prints the counts and a cost estimate and writes nothing. It never pushes: it prints
 * the `mj sync push` command instead.
 *
 * `--decision agent-discovery` builds the agent-discovery suite instead (plan Task 3.1) from a corpus
 * written by `generate-discovery-corpus.ts` (`corpus.jsonl`, `labels.jsonl`, and `agents.json` for the
 * estimate). Its matrix cells take `baseline: "semantic-search"` or a model pinning, with no
 * `stateLayout`; without `--matrix` it runs the decision as the prompt selects its model beside the
 * `semantic-search` baseline. A baseline cell's records run once: its search makes no model call.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    AssertOutputOutsideRepo,
    BuildDecisionEvalSuiteRecord,
    BuildDecisionEvalTestRecord,
    BuildDiscoveryEvalTestRecord,
    DECISION_EVAL_DECISIONS,
    DEFAULT_DECISION_EVAL_REPS,
    DEFAULT_DECISION_EVAL_SUITE_NAME,
    DEFAULT_DISCOVERY_EVAL_MATRIX,
    DEFAULT_DISCOVERY_EVAL_SUITE_NAME,
    DEFAULT_LABEL_SOURCE,
    DiscoveryCatalogSnapshotSchema,
    DiscoveryCellRepeats,
    EstimateDecisionEvalRun,
    EstimateDiscoveryEvalRun,
    FindRepoRoot,
    IsDecidableOffline,
    JoinDecisionCorpus,
    JoinDiscoveryCorpus,
    ParseDecisionCorpus,
    ParseDecisionEvalMatrix,
    ParseDecisionLabels,
    ParseDiscoveryCorpus,
    ParseDiscoveryEvalMatrix,
    ParseDiscoveryLabels,
    SelectDiscoveryLabelSource,
    SelectLabelSource,
    WriteGeneratedFiles,
    type DecisionEvalDecision,
    type DecisionEvalMatrix,
    type DiscoveryCatalogAgent,
    type DiscoveryEvalMatrix,
    type GeneratedFile,
    type LabelledDecisionPoint,
    type LabelledDiscoveryRequest,
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

const USAGE = 'usage: generate-decision-eval-suite.ts --corpus <dir> --out <dir> [--decision conversation-routing|agent-discovery] '
    + '[--matrix <file>] [--reps N] [--label-source construction] [--suite <name>] [--limit N] [--force] [--dry-run]';

/** The command line, read. */
interface GeneratorArgs {
    Decision: DecisionEvalDecision;
    CorpusDir: string;
    OutDir: string;
    /** The matrix file, or null for the decision's default (routing's is the committed template). */
    MatrixPath: string | null;
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

/** `--decision`, or conversation routing when it is absent. */
function readDecision(argv: readonly string[]): DecisionEvalDecision {
    const raw = readFlag(argv, 'decision') ?? 'conversation-routing';
    const decision = DECISION_EVAL_DECISIONS.find(d => d === raw);
    if (!decision) {
        throw new Error(`--decision must be one of ${DECISION_EVAL_DECISIONS.join(', ')}, got '${raw}'`);
    }
    return decision;
}

function parseArgs(argv: readonly string[]): GeneratorArgs {
    const corpus = readFlag(argv, 'corpus') ?? process.env[CORPUS_ENV];
    const out = readFlag(argv, 'out');
    if (!corpus || !out) {
        throw new Error(`${USAGE}\n(--corpus may also come from ${CORPUS_ENV})`);
    }
    const matrix = readFlag(argv, 'matrix');
    return {
        Decision: readDecision(argv),
        CorpusDir: resolve(corpus),
        OutDir: out,
        MatrixPath: matrix ? resolve(matrix) : null,
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
    const matrixPath = args.MatrixPath ?? TEMPLATE_MATRIX;
    const matrix = ParseDecisionEvalMatrix(readFileSync(matrixPath, 'utf8'), matrixPath);
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
    return writeSyncFiles(outDir, args, suite.Records, BuildDecisionEvalSuiteRecord(suite.SuiteName, suite.Names, description), provenance(args, suite));
}

/**
 * Writes the test records, the suite record, the sync configs and the provenance, through
 * `WriteGeneratedFiles`: with `--force` only an earlier run's own files are replaced.
 */
function writeSyncFiles(
    outDir: string,
    args: GeneratorArgs,
    records: readonly SyncRecord[],
    suiteRecord: SyncRecord,
    generatedFrom: object
): WriteGeneratedFilesResult {
    const files: GeneratedFile[] = [
        ...records.map(record => jsonFile(`tests/.${record.primaryKey.ID}.json`, record)),
        jsonFile('tests/.mj-sync.json', { entity: 'MJ: Tests', filePattern: '**/.*.json' }),
        jsonFile('test-suites/.mj-sync.json', { entity: 'MJ: Test Suites', filePattern: '**/.*.json' }),
        jsonFile('test-suites/.decision-eval-suite.json', [suiteRecord]),
        // `emitSyncNotes: false`: every push would otherwise write sync blocks back into generated files.
        jsonFile('.mj-sync.json', {
            version: '1.0.0',
            push: { autoCreateMissingRecords: true },
            directoryOrder: ['tests', 'test-suites'],
            emitSyncNotes: false
        }),
        jsonFile('generated-from.json', generatedFrom)
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
        matrix: args.MatrixPath ?? TEMPLATE_MATRIX,
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
    console.log(`   matrix       : ${args.MatrixPath ?? TEMPLATE_MATRIX}`);
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
    reportWritten(outDir, written);
    for (const warning of warnings(suite)) {
        console.log(`   ⚠ ${warning}`);
    }
    console.log(args.DryRun
        ? `\n   dry run: re-run without --dry-run to write ${suite.Records.length} record(s) to ${outDir}`
        : `\n   next (push the 'Decision Eval' test type from metadata/test-types first):\n     npx mj sync push --dir=${outDir}`);
}

/** What replacing an earlier run did: the files removed, and any left alone because this rig didn't write them. */
function reportWritten(outDir: string, written: WriteGeneratedFilesResult | null): void {
    if (written && written.Removed > 0) {
        console.log(`   replaced     : ${written.Removed} file(s) of the earlier run no longer generated were removed`);
    }
    if (written && written.Kept.length > 0) {
        console.log(`   ⚠ ${written.Kept.length} file(s) in ${outDir} were not written by this rig and were left alone `
            + `(${written.Kept.slice(0, 3).join(', ')}${written.Kept.length > 3 ? ', …' : ''}). mj sync may pick up any under tests/ or test-suites/.`);
    }
}

function main(): void {
    const args = parseArgs(process.argv.slice(2));
    // Refuse before reading a single corpus line: nothing derived from it may land in a repository.
    const outDir = AssertOutputOutsideRepo(args.OutDir, [REPO_ROOT]);
    if (args.Decision === 'agent-discovery') {
        mainDiscovery(args, outDir);
        return;
    }
    const suite = generate(args);
    const written = args.DryRun ? null : writeSuite(outDir, args, suite);
    report(args, outDir, suite, written);
}

// ── agent discovery (--decision agent-discovery) ───────────────────────────────────────────────

/** What was generated for the agent-discovery suite. */
interface GeneratedDiscoverySuite {
    SuiteName: string;
    Reps: number;
    Matrix: DiscoveryEvalMatrix;
    Cases: LabelledDiscoveryRequest[];
    RequestCount: number;
    UnlabelledCount: number;
    OrphanLabelCount: number;
    /** The corpus's catalog snapshot, when it has `agents.json`. */
    Catalog: DiscoveryCatalogAgent[] | null;
    Records: SyncRecord[];
    Names: string[];
}

/** Reads and validates the discovery corpus, its labels, its catalog snapshot and the matrix, and builds every record. */
function generateDiscovery(args: GeneratorArgs): GeneratedDiscoverySuite {
    const requests = ParseDiscoveryCorpus(readFileSync(join(args.CorpusDir, 'corpus.jsonl'), 'utf8'), 'corpus.jsonl');
    const labels = ParseDiscoveryLabels(readFileSync(join(args.CorpusDir, 'labels.jsonl'), 'utf8'), 'labels.jsonl');
    const joined = JoinDiscoveryCorpus(requests, SelectDiscoveryLabelSource(labels, args.LabelSource, 'labels.jsonl'));
    const cases = args.Limit === null ? joined.Cases : joined.Cases.slice(0, args.Limit);
    const matrix = args.MatrixPath ? ParseDiscoveryEvalMatrix(readFileSync(args.MatrixPath, 'utf8'), args.MatrixPath) : DEFAULT_DISCOVERY_EVAL_MATRIX;
    const reps = args.Reps ?? matrix.reps ?? DEFAULT_DECISION_EVAL_REPS;
    const records = cases.flatMap(c => matrix.cells.map(cell => BuildDiscoveryEvalTestRecord(c, cell, reps, args.LabelSource)));
    const catalogPath = join(args.CorpusDir, 'agents.json');
    return {
        SuiteName: args.Suite ?? matrix.suiteName ?? DEFAULT_DISCOVERY_EVAL_SUITE_NAME,
        Reps: reps,
        Matrix: matrix,
        Cases: cases,
        RequestCount: requests.length,
        UnlabelledCount: joined.UnlabelledRequestIds.length,
        OrphanLabelCount: joined.OrphanLabelCount,
        Catalog: existsSync(catalogPath) ? DiscoveryCatalogSnapshotSchema.parse(JSON.parse(readFileSync(catalogPath, 'utf8'))).agents : null,
        Records: records,
        Names: records.map(r => String(r.fields.Name))
    };
}

/** Writes the discovery suite, as `writeSyncFiles` writes any suite. */
function writeDiscoverySuite(outDir: string, args: GeneratorArgs, suite: GeneratedDiscoverySuite): WriteGeneratedFilesResult {
    const description = `Generated from ${suite.Cases.length} labelled agent-discovery request(s) × ${suite.Matrix.cells.length} cell(s). `
        + 'Regenerate with rigs/generate-decision-eval-suite.ts --decision agent-discovery; do not hand-edit.';
    return writeSyncFiles(outDir, args, suite.Records, BuildDecisionEvalSuiteRecord(suite.SuiteName, suite.Names, description), {
        decision: 'agent-discovery',
        corpus: args.CorpusDir,
        labelSource: args.LabelSource,
        matrix: args.MatrixPath ?? '(default: decision + semantic-search)',
        suiteName: suite.SuiteName,
        reps: suite.Reps,
        cells: suite.Matrix.cells.map(c => c.label),
        requests: suite.Cases.length,
        records: suite.Records.length,
        generatedAt: new Date().toISOString()
    });
}

/** Prints the discovery suite's counts, the estimate, any warnings, and what to do next. */
function reportDiscovery(args: GeneratorArgs, outDir: string, suite: GeneratedDiscoverySuite, written: WriteGeneratedFilesResult | null): void {
    const agentCases = suite.Cases.filter(c => c.Label.label === 'agent').length;
    const estimate = EstimateDiscoveryEvalRun(suite.Cases, suite.Matrix.cells, suite.Reps, suite.Catalog ?? []);
    const calls = suite.Matrix.cells.reduce((sum, cell) => sum + suite.Cases.length * DiscoveryCellRepeats(cell, suite.Reps), 0);
    console.log(args.DryRun ? '── agent-discovery suite — DRY RUN (nothing written) ──' : '── agent-discovery suite generated ──');
    console.log(`   matrix       : ${args.MatrixPath ?? '(default: decision + semantic-search)'}`);
    console.log(`   label source : ${args.LabelSource}`);
    console.log(`   corpus       : ${suite.RequestCount} request(s); ${suite.Cases.length} labelled and used (agent ${agentCases}, none ${suite.Cases.length - agentCases})`);
    console.log(`   catalog      : ${suite.Catalog ? `${suite.Catalog.length} agent(s) in agents.json` : 'no agents.json: the estimate leaves out the options'}`);
    console.log(`   cells        : ${suite.Matrix.cells.map(c => c.baseline ? `${c.label} (baseline)` : c.label).join(', ')}`);
    console.log(`   records      : ${suite.Records.length} test(s)${args.DryRun ? ' (would be written)' : ` → ${join(outDir, 'tests')}`}`);
    console.log(`   suite        : ${suite.SuiteName}`);
    console.log(`   reps/record  : ${suite.Reps} (baseline cells: 1)`);
    console.log(`   runs         : ${calls.toLocaleString()}`);
    const money = estimate.USD === null ? 'unpriced (a decision cell carries no price)' : `~$${estimate.USD.toFixed(2)}`;
    console.log(`   EST. SPEND   : ${money}  ·  ~${estimate.PromptTokens.toLocaleString()} prompt + ~${estimate.CompletionTokens.toLocaleString()} completion tokens`);
    reportWritten(outDir, written);
    const unpinned = suite.Matrix.cells.filter(c => !c.baseline && !c.modelId && !c.vendorId).map(c => c.label);
    if (unpinned.length > 0) {
        console.log(`   ⚠ ${unpinned.join(', ')} pin(s) no model: they run whatever the decision prompt selects, with its failover.`);
    }
    if (suite.UnlabelledCount > 0 || suite.OrphanLabelCount > 0) {
        console.log(`   ⚠ ${suite.UnlabelledCount} request(s) unlabelled by this source; ${suite.OrphanLabelCount} label(s) name no request.`);
    }
    console.log(args.DryRun
        ? `\n   dry run: re-run without --dry-run to write ${suite.Records.length} record(s) to ${outDir}`
        : `\n   next (push the 'Decision Eval' test type from metadata/test-types first):\n     npx mj sync push --dir=${outDir}`);
}

/** The agent-discovery path. */
function mainDiscovery(args: GeneratorArgs, outDir: string): void {
    const suite = generateDiscovery(args);
    const written = args.DryRun ? null : writeDiscoverySuite(outDir, args, suite);
    reportDiscovery(args, outDir, suite, written);
}

try {
    main();
} catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
}
