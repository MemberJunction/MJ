/**
 * generate-prompt-eval-suite.ts — expands the corpus × matrix into runnable `MJ: Tests` records.
 *
 * The corpus states decisions; the matrix
 * states the conditions to observe them under; this multiplies them into one metadata record per
 * **cell**, so `mj test history` / `compare` and the Explorer dashboard work per cell rather than
 * per case. Cells being metadata is what makes a baseline-versus-native comparison a query rather than a
 * bespoke script.
 *
 * WHY A GENERATOR and not hand-written records: the corpus runs to dozens of cases,
 * and the matrix is models × tool modes × response formats. Hand-maintaining that product is how a
 * suite silently drifts out of sync with its corpus. The golden files stay the single source of
 * truth; everything here is derived and safe to delete and regenerate.
 *

 * KNOWN LIMITATION. Regenerating with DIFFERENT cell labels (e.g. after pinning models, which
 * renames every cell) leaves the previously-pushed records in the database as orphans. They are
 * not in the regenerated suite so they never run, but they do linger in `MJ: Tests`. Prune them
 * by name before re-pushing if a stale catalogue matters; the stable-ID scheme only protects
 * regenerations that keep the same labels.
 *
 * IT ALSO PRICES THE RUN. Every invocation writes an estimated-token manifest (test plan §9,
 * resolved) so an on-demand live-model run's spend is known before it starts rather than after.
 *
 * USAGE (from the repo root):
 *   npx tsx packages/TestingFramework/integration-test-suite/rigs/generate-prompt-eval-suite.ts
 *   … --matrix path/to/matrix.json --reps 20 --suite "Native Tool Calling — Baseline"
 *
 * A bare run reproduces the pinned matrix — see {@link PINNED_MATRIX_PATH}. Every run prints the
 * matrix it used, because the alternative is a suite that looks right and measures the wrong set.
 *
 * Then push and run:
 *   npx mj sync push --dir=metadata-optional/prompt-eval-corpus
 *   MJ_INTEGRATION_TEST=1 npx mj test suite --name "Native Tool Calling — Baseline"
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCorpusCase, type CorpusCase } from '@memberjunction/testing-engine';

// This package is native ESM, so __dirname does not exist.
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const CORPUS_DIR = join(REPO_ROOT, 'metadata-optional/prompt-eval-corpus/cases');
const OUT_DIR = join(REPO_ROOT, 'metadata-optional/prompt-eval-corpus/tests');

/** One matrix cell: the conditions a case is observed under. */
interface MatrixCell {
    label: string;
    toolCallingMode: 'envelope' | 'native';
    /** Control-flow arm for a native cell. Absent = the hybrid. */
    nativeControlFlow?: 'envelope' | 'implicit';
    /** Native-tool-results arm: tool-form history goes out as native tool turns. */
    nativeToolResults?: boolean;
    toolChoice?: 'auto' | 'none' | 'required';
    responseFormat?: 'Any' | 'JSON';
    /** `AIModelVendor`-shaped pinning. Omitted cells use the prompt's own model selection. */
    modelId?: string;
    vendorId?: string;
    /** Reasoning effort: 1-100, or a provider-named level such as `'xhigh'`. Part of cell identity. */
    effortLevel?: number | string;
    /** USD per 1M tokens, carried on the pin so the manifest can price a run offline. */
    inputPricePer1M?: number;
    outputPricePer1M?: number;
}

interface MatrixSpec {
    suiteName: string;
    cells: MatrixCell[];
    /** Oracles every cell runs. Deterministic only — llm-judge contributes no comparison weight. */
    oracles: Array<{ type: string; weight?: number; config?: Record<string, unknown> }>;
    reps: number;
}

/**
 * The pinned baseline matrix, written by `rigs/pin-eval-matrix.cjs`.
 *
 * When this file exists it is the default, and the in-code {@link BASELINE_FALLBACK} below is not
 * consulted. That precedence is the point: the pin and the fallback share a suite name, so a bare
 * run that silently fell back would replace a priced, pinned N-cell suite with a 1-cell unpriced
 * one *under the same name* — a corrupted baseline whose only symptom is a smaller test count.
 */
const PINNED_MATRIX_PATH = 'metadata-optional/prompt-eval-corpus/matrix/envelope-baseline.json';

/**
 * Pre-pinning fallback: today's path, nothing native.
 *
 * Deliberately ONE cell. A baseline's job is to quantify the current state, and adding native cells
 * to it would defeat the purpose — the baseline is the thing native runs are compared
 * *against*. A comparison adds cells by passing `--matrix`.
 *
 * Reachable only before the matrix has been pinned; once {@link PINNED_MATRIX_PATH} exists, it wins.
 */
const BASELINE_FALLBACK: MatrixSpec = {
    suiteName: 'Native Tool Calling — Envelope Baseline',
    cells: [{ label: 'envelope', toolCallingMode: 'envelope', responseFormat: 'Any' }],
    oracles: [
        // Metric 1/2 — usable output. The malformed-rate headline.
        { type: 'response-well-formed', weight: 0.3 },
        // Metrics 3/4/5 — the decision itself, decomposed in its details.
        { type: 'agent-decision-match', weight: 0.7 }
    ],
    reps: 20
};

function readFlag(argv: string[], name: string): string | undefined {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? argv[i + 1] : undefined;
}

/**
 * Filesystem-safe form of a cell label.
 *
 * Cell labels carry the provider's own API name, and some contain a path separator
 * (Groq serves GPT-OSS-120B as `openai/gpt-oss-120b`). The label stays human-readable in the
 * record's Name; only the filename is sanitized.
 */
function fileSafe(label: string): string {
    return label.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
}

function loadCorpus(): CorpusCase[] {
    return readdirSync(CORPUS_DIR)
        .filter((f) => f.endsWith('.json'))
        // parseCorpusCase validates: a corpus that generates is a corpus that can score.
        .map((f) => parseCorpusCase(JSON.parse(readFileSync(join(CORPUS_DIR, f), 'utf8')) as unknown));
}

/**
 * A stable UUID per (case, cell).
 *
 * Regenerating must UPDATE the same records rather than orphan them and mint new ones — otherwise
 * every regeneration breaks `mj test history` for that cell, which is the one thing a longitudinal
 * comparison cannot survive. Derived deterministically from the identity of the cell.
 */
function stableId(caseId: string, cellLabel: string): string {
    let hash = 0x811c9dc5;
    for (const char of `${caseId}::${cellLabel}`) {
        hash = Math.imul(hash ^ char.charCodeAt(0), 0x01000193) >>> 0;
    }
    // Expand the 32-bit hash across a v4-shaped UUID; collisions across a few hundred cells are
    // vanishingly unlikely and would surface immediately as a duplicate-key push error.
    const hex = hash.toString(16).padStart(8, '0');
    const tail = Array.from({ length: 3 }, (_, i) => (Math.imul(hash + i + 1, 0x01000193) >>> 0).toString(16).padStart(8, '0')).join('');
    return `${hex}-${tail.slice(0, 4)}-4${tail.slice(4, 7)}-a${tail.slice(7, 10)}-${tail.slice(10, 22)}`.toUpperCase();
}

function buildTestRecord(testCase: CorpusCase, cell: MatrixCell, spec: MatrixSpec): Record<string, unknown> {
    return {
        fields: {
            // `TypeID`, not `TestTypeID` — the generated ORM's field name for MJ: Tests.
            TypeID: '@lookup:MJ: Test Types.Name=Prompt Eval',
            Name: `${testCase.id} [${cell.label}]`,
            Description: testCase.description,
            // These three are JSON columns: mj-sync serializes the object, so passing a
            // pre-stringified blob would double-encode it.
            InputDefinition: {
                payload: testCase.input.payload ?? {},
                conversationMessages: testCase.input.conversationMessages ?? [],
                templateData: testCase.input.templateData ?? {}
            },
            ExpectedOutcomes: { caseId: testCase.id, expect: testCase.expect },
            Configuration: {
                agentName: testCase.agent,
                modelId: cell.modelId,
                vendorId: cell.vendorId,
                effortLevel: cell.effortLevel,
                toolCallingMode: cell.toolCallingMode,
                nativeControlFlow: cell.nativeControlFlow,
                nativeToolResults: cell.nativeToolResults,
                // A case may force the choice (forced-control-flow cases run at 'none', as production does on the final iteration).
                toolChoice: testCase.input.toolChoice ?? cell.toolChoice,
                responseFormat: cell.responseFormat,
                // The decision oracle's config IS the expectation, translated at generation time
                // from the golden file rather than duplicated by hand into metadata.
                oracles: spec.oracles.map((o) =>
                    o.type === 'agent-decision-match'
                        ? { ...o, config: { ...(o.config ?? {}), ...testCase.expect } }
                        : o),
                scoringWeights: Object.fromEntries(spec.oracles.map((o) => [o.type, o.weight ?? 1]))
            },
            // The matrix's repetition count, ON THE RECORD — `TestEngine` reads `RepeatCount` (or a
            // `--flaky-check` override) and runs that many iterations, each persisting its own
            // `MJ: Test Run`. `reps` once reached only the cost estimate, so a matrix
            // asking for N=3 priced 1,026 calls and silently ran 342 of them at N=1 — a manifest
            // that overstates by 3x is worse than none, and the repetition the plan wants for
            // rate-based comparison never happened.
            RepeatCount: spec.reps,
            Status: 'Active'
        },
        primaryKey: { ID: stableId(testCase.id, cell.label) }
    };
}

/** The measured per-agent prompt sizes, if they have been generated. */
interface PromptSizeBaseline {
    measuredAt: string;
    defaultTokens: number;
    perAgent: Record<string, number>;
}

function loadPromptSizes(): PromptSizeBaseline | null {
    const path = join(REPO_ROOT, 'metadata-optional/prompt-eval-corpus/matrix/prompt-size-baseline.json');
    try {
        return JSON.parse(readFileSync(path, 'utf-8')) as PromptSizeBaseline;
    } catch {
        return null;
    }
}

/**
 * Prices a full run.
 *
 * The prompt is ~99% of the cost and the corpus text is ~0.4% of it, so this estimate is really an
 * estimate of ONE number: how big the composed prompt is per agent. That was a flat 12,000-token
 * guess until it was measured, and the guess was 38% low — the Loop agent-type system prompt alone
 * is ~12,700 tokens before any agent's own prompt or action catalog. A cost manifest that is wrong
 * by that much is worse than none, because it gets believed.
 *
 * So it now reads measured per-agent sizes from `matrix/prompt-size-baseline.json`
 * (regenerate with `rigs/measure-prompt-sizes.cjs`) and falls back to the measured mean for an
 * agent it has no figure for. Still a floor, not a ceiling: chars/4, and the rendered action
 * catalog is larger than the raw metadata it is measured from.
 */
/** A decision envelope is short. Reasoning models bill thinking as output, so this reads LOW. */
const ASSUMED_COMPLETION_TOKENS = 250;

interface RunEstimate {
    promptTokens: number;
    completionTokens: number;
    /** USD, or `null` when no cell carries a price. */
    usd: number | null;
    perCell: Array<{ label: string; usd: number | null }>;
    source: string;
}

function estimateRun(cases: CorpusCase[], spec: MatrixSpec): RunEstimate {
    const sizes = loadPromptSizes();
    const fallback = sizes?.defaultTokens ?? 12000;
    const promptPerPass = cases.reduce((sum, c) =>
        sum + Math.ceil(JSON.stringify(c.input).length / 4) + (sizes?.perAgent[c.agent] ?? fallback), 0);
    const completionPerPass = cases.length * ASSUMED_COMPLETION_TOKENS;

    const perCell = spec.cells.map((cell) => ({
        label: cell.label,
        usd: cell.inputPricePer1M === undefined || cell.outputPricePer1M === undefined
            ? null
            : ((promptPerPass * cell.inputPricePer1M) + (completionPerPass * cell.outputPricePer1M)) / 1e6 * spec.reps
    }));
    const priced = perCell.filter((c): c is { label: string; usd: number } => c.usd !== null);
    return {
        promptTokens: promptPerPass * spec.cells.length * spec.reps,
        completionTokens: completionPerPass * spec.cells.length * spec.reps,
        usd: priced.length === 0 ? null : priced.reduce((a, c) => a + c.usd, 0),
        perCell,
        source: sizes ? `measured ${sizes.measuredAt.slice(0, 10)}` : 'UNMEASURED — run rigs/measure-prompt-sizes.cjs'
    };
}

function main(): void {
    const argv = process.argv.slice(2);
    // Explicit --matrix wins; otherwise the pinned file if it exists; only then the in-code
    // fallback. See PINNED_MATRIX_PATH for why the fallback must never be reached silently.
    const explicit = readFlag(argv, 'matrix');
    const pinned = join(REPO_ROOT, PINNED_MATRIX_PATH);
    const matrixPath = explicit ? resolve(explicit) : existsSync(pinned) ? pinned : undefined;
    const spec: MatrixSpec = {
        ...(matrixPath ? JSON.parse(readFileSync(matrixPath, 'utf8')) as MatrixSpec : BASELINE_FALLBACK)
    };
    const matrixSource = matrixPath ? relative(REPO_ROOT, matrixPath) : 'in-code fallback (matrix not pinned)';
    spec.reps = Number.parseInt(readFlag(argv, 'reps') ?? String(spec.reps), 10);
    spec.suiteName = readFlag(argv, 'suite') ?? spec.suiteName;

    // `--dry-run` prices a candidate matrix WITHOUT touching disk. It exists because the only way
    // to answer "what would this cost" used to be to generate it, and generating replaces the
    // current suite wholesale — so asking the question destroyed the answer to the previous one.
    const dryRun = argv.includes('--dry-run');

    const cases = loadCorpus();
    if (!dryRun) {
        // Regenerate from scratch: a stale record for a deleted case would keep running forever.
        rmSync(OUT_DIR, { recursive: true, force: true });
        mkdirSync(OUT_DIR, { recursive: true });
    }

    const names: string[] = [];
    for (const testCase of cases) {
        for (const cell of spec.cells) {
            const record = buildTestRecord(testCase, cell, spec);
            if (!dryRun) {
                writeFileSync(join(OUT_DIR, `.${testCase.id}--${fileSafe(cell.label)}.json`), `${JSON.stringify(record, null, 2)}\n`);
            }
            names.push((record.fields as { Name: string }).Name);
        }
    }
    if (dryRun) {
        reportRun(spec, cases, names, matrixSource, true);
        return;
    }
    writeFileSync(join(OUT_DIR, '.mj-sync.json'), `${JSON.stringify({ entity: 'MJ: Tests', filePattern: '**/.*.json' }, null, 2)}\n`);

    // WHICH matrix these records came from. The generated set is single-tenant — one matrix at a
    // time — so regenerating for one matrix replaces another on disk, and a drift check with a
    // hardcoded matrix path then reports the *deliberate* switch as staleness. Recording the
    // provenance lets check PE2 validate coverage against the matrix actually used while still
    // requiring that it be one of the pinned files, which is the part worth policing.
    writeFileSync(join(OUT_DIR, 'generated-from.json'), `${JSON.stringify({
        matrix: matrixPath ? relative(REPO_ROOT, matrixPath) : null,
        suiteName: spec.suiteName,
        reps: spec.reps,
        cells: spec.cells.length,
        cases: cases.length,
        generatedAt: new Date().toISOString()
    }, null, 2)}\n`);

    const suiteDir = join(REPO_ROOT, 'metadata-optional/prompt-eval-corpus/test-suites');
    mkdirSync(suiteDir, { recursive: true });
    writeFileSync(join(suiteDir, '.mj-sync.json'), `${JSON.stringify({ entity: 'MJ: Test Suites', filePattern: '**/.*.json' }, null, 2)}\n`);
    // Suite membership is a relatedEntities block on the suite, keyed back with @parent:ID —
    // the same shape the shipped integration suite uses.
    writeFileSync(join(suiteDir, '.prompt-eval-suite.json'), `${JSON.stringify([{
        fields: {
            Name: spec.suiteName,
            Description: `Generated from ${cases.length} corpus case(s) × ${spec.cells.length} cell(s). Regenerate with rigs/generate-prompt-eval-suite.ts — do not hand-edit.`,
            Status: 'Active'
        },
        primaryKey: { ID: stableId(spec.suiteName, 'suite') },
        relatedEntities: {
            'MJ: Test Suite Tests': names.map((name, i) => ({
                fields: { SuiteID: '@parent:ID', TestID: `@lookup:MJ: Tests.Name=${name}`, Sequence: i + 1, Status: 'Active' },
                primaryKey: { ID: stableId(name, 'membership') }
            }))
        }
    }], null, 2)}\n`);

    // Root sync config. `emitSyncNotes: false` matters: without it every push writes sync/checksum
    // blocks back into these generated files, which are regenerated anyway — pure diff noise.
    writeFileSync(join(REPO_ROOT, 'metadata-optional/prompt-eval-corpus/.mj-sync.json'), `${JSON.stringify({
        version: '1.0.0',
        push: { autoCreateMissingRecords: true },
        directoryOrder: ['tests', 'test-suites'],
        emitSyncNotes: false
    }, null, 2)}\n`);

    reportRun(spec, cases, names, matrixSource, false);
}

/** Prints the run summary and the cost manifest. Shared by the real run and `--dry-run`. */
function reportRun(spec: MatrixSpec, cases: CorpusCase[], names: string[], matrixSource: string, dryRun: boolean): void {
    const estimate = estimateRun(cases, spec);
    console.log(dryRun ? `── prompt-eval suite — DRY RUN (nothing written) ──` : `── prompt-eval suite generated ──`);
    console.log(`   matrix     : ${matrixSource}`);
    console.log(`   corpus     : ${cases.length} case(s)`);
    console.log(`   cells      : ${spec.cells.map((c) => c.label).join(', ')}`);
    console.log(`   records    : ${names.length} test(s)${dryRun ? ' (would be written)' : ` → ${OUT_DIR}`}`);
    console.log(`   suite      : ${spec.suiteName}`);
    console.log(`   reps/cell  : ${spec.reps}`);
    console.log(`   live calls : ${(names.length * spec.reps).toLocaleString()}`);
    const money = estimate.usd === null ? 'unpriced (no cell carries a price)' : `~$${estimate.usd.toFixed(2)}`;
    console.log(`   EST. SPEND : ${money}  ·  ~${estimate.promptTokens.toLocaleString()} prompt + ~${estimate.completionTokens.toLocaleString()} completion tokens`);
    console.log(`                (${estimate.source}; a FLOOR — chars/4, raw catalog not rendered, and reasoning models bill thinking as output)`);
    for (const cell of estimate.perCell.slice().sort((a, b) => (b.usd ?? 0) - (a.usd ?? 0))) {
        console.log(`                  ${cell.usd === null ? '     ?' : `$${cell.usd.toFixed(2)}`.padStart(8)}  ${cell.label}`);
    }
    console.log(dryRun
        ? `\n   dry run — re-run without --dry-run to write ${names.length} record(s)`
        : `\n   next: npx mj sync push --dir=metadata-optional/prompt-eval-corpus`);
}

main();
