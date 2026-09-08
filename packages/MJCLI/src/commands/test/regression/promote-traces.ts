import { Command, Flags } from '@oclif/core';
import { existsSync, mkdirSync, readdirSync, readFileSync, copyFileSync } from 'node:fs';
import path from 'node:path';
import { resolveRunDir, isInsideMonorepo } from '../../../lib/regression/docker-helpers.js';

/** Committed, `:ro`-mounted replay-trace store (Decision D1), relative to the repo root. */
const COMMITTED_TRACE_DIR = 'metadata-optional/regression-test/tests/regression/traces';

/** Drift classification for one candidate vs its committed baseline. */
type DriftKind = 'new' | 'unchanged' | 'selector-drift' | 'meaningful-drift';

/** The subset of a serialized trace this review reads (see @memberjunction/computer-use ComputerUseTrace). */
interface TraceView {
    Steps?: TraceStepView[];
    GoalPostconditions?: unknown[];
}
interface TraceStepView {
    Action?: { Method?: string; Url?: string; Target?: { Role?: string; Name?: string; Selector?: string } };
    Postcondition?: { UrlPattern?: string };
}

interface CandidateReport {
    file: string;
    kind: DriftKind;
    details: string[];
}

/**
 * `mj test regression promote-traces` — the human review gate that lands
 * a run's recorded trace CANDIDATES into the git-committed store.
 *
 * A recording run writes candidates to `<run>/traces-out/`; they reach
 * the repo only here, so UI drift is a reviewed diff instead of a bot commit.
 * For each candidate this classifies the change against the committed baseline —
 * `new` (no baseline), `unchanged`, `selector-drift` (routine, heal-class:
 * selector changed but role+name held), or `meaningful-drift` (steps added or
 * removed, or a method/url/target-identity/postcondition change — the "this PR
 * changed the UI" signal) — then copies accepted candidates into the store and
 * leaves the working tree for a normal reviewed commit/PR.
 *
 * The diff here is a deliberately dependency-light structural summary; the
 * engine's `diffTraces` is the richer in-suite drift tool.
 */
export default class TestRegressionPromoteTraces extends Command {
    static description =
        'Review and promote a run\'s recorded replay-trace candidates (traces-out/) into the ' +
        'committed store at metadata-optional/regression-test/tests/regression/traces/. ' +
        'Classifies drift (new / unchanged / selector-drift / meaningful-drift), copies accepted ' +
        'traces, and leaves the working tree for a reviewed commit.';

    static examples = [
        '<%= config.bin %> <%= command.id %>',
        '<%= config.bin %> <%= command.id %> --dry-run',
        '<%= config.bin %> <%= command.id %> --run run-20260722T073420Z --test T042',
        '<%= config.bin %> <%= command.id %> --json',
    ];

    static flags = {
        run: Flags.string({
            description: 'Run id (or path) whose traces-out/ to promote. Defaults to the newest run.',
        }),
        test: Flags.string({
            description: 'Promote only this test (e.g. T042 or T042.trace.json).',
        }),
        'dry-run': Flags.boolean({
            description: 'Show the drift report without copying anything.',
            default: false,
        }),
        json: Flags.boolean({
            description: 'Emit the drift report as JSON (for CI annotation).',
            default: false,
        }),
    };

    async run(): Promise<void> {
        const { flags } = await this.parse(TestRegressionPromoteTraces);

        if (!isInsideMonorepo()) {
            this.error('promote-traces is monorepo-shaped — run it from the MemberJunction repo root.');
        }

        const runDir = resolveRunDir(flags.run);
        if (!runDir) {
            this.error(flags.run
                ? `Run not found: ${flags.run}`
                : 'No regression runs found under docker/regression/test-results/.');
        }

        const outDir = path.join(runDir, 'traces-out');
        if (!existsSync(outDir)) {
            this.error(`No traces-out/ in ${runDir}. A run records candidates only from green, ` +
                `recordable LLM-tier passes — check that the run produced any.`);
        }

        const committedDir = path.resolve(COMMITTED_TRACE_DIR);
        const report = this.buildReport(outDir, committedDir, flags.test);

        if (flags.json) {
            this.log(JSON.stringify({ runDir, committedDir, dryRun: flags['dry-run'], candidates: report }, null, 2));
        } else {
            this.printReport(outDir, committedDir, report, flags['dry-run']);
        }

        if (report.length === 0) {
            if (!flags.json) this.log('No candidate traces to promote.');
            return;
        }

        if (!flags['dry-run']) {
            mkdirSync(committedDir, { recursive: true });
            for (const r of report) {
                copyFileSync(path.join(outDir, r.file), path.join(committedDir, r.file));
            }
            if (!flags.json) {
                this.log(`\nCopied ${report.length} trace(s) into ${COMMITTED_TRACE_DIR}. ` +
                    `Review the working tree, then commit.`);
            }
        }
    }

    /** Classify every candidate in `outDir` against the committed baseline. */
    private buildReport(outDir: string, committedDir: string, testFilter?: string): CandidateReport[] {
        let files = readdirSync(outDir).filter(f => f.endsWith('.trace.json'));
        if (testFilter) {
            const want = testFilter.endsWith('.trace.json') ? testFilter : `${testFilter}.trace.json`;
            files = files.filter(f => f === want);
        }
        files.sort();
        return files.map(file => {
            const candidate = this.readTrace(path.join(outDir, file));
            const committedPath = path.join(committedDir, file);
            const prior = existsSync(committedPath) ? this.readTrace(committedPath) : null;
            const { kind, details } = classifyTraceDiff(prior, candidate);
            return { file, kind, details };
        });
    }

    private printReport(outDir: string, committedDir: string, report: CandidateReport[], dryRun: boolean): void {
        this.log(`Promoting from ${outDir}`);
        this.log(`         into ${committedDir}${dryRun ? '   (dry run — nothing copied)' : ''}\n`);
        const counts: Record<DriftKind, number> = { 'new': 0, 'unchanged': 0, 'selector-drift': 0, 'meaningful-drift': 0 };
        for (const r of report) {
            counts[r.kind]++;
            const detail = r.details.length ? `  — ${r.details.join('; ')}` : '';
            this.log(`  ${symbolFor(r.kind)} ${r.file.padEnd(24)} ${r.kind}${detail}`);
        }
        this.log(`\n  ${report.length} candidate(s): ${counts['new']} new, ${counts['unchanged']} unchanged, ` +
            `${counts['selector-drift']} selector-drift, ${counts['meaningful-drift']} meaningful-drift`);
        if (counts['meaningful-drift'] > 0) {
            this.log('  ⚠ meaningful-drift indicates a UI change — confirm it was intended before committing.');
        }
    }

    /** Parse a serialized trace file into the review view. Errors clearly on malformed JSON. */
    private readTrace(filePath: string): TraceView {
        try {
            return JSON.parse(readFileSync(filePath, 'utf8')) as TraceView;
        } catch (e) {
            this.error(`Malformed trace ${filePath}: ${e instanceof Error ? e.message : String(e)}`);
        }
    }
}

/** Console glyph per drift kind. */
function symbolFor(kind: DriftKind): string {
    switch (kind) {
        case 'new': return '+';
        case 'unchanged': return '=';
        case 'selector-drift': return '~';
        case 'meaningful-drift': return '!';
    }
}

/**
 * Structural diff → worst-of-steps classification. A missing baseline is
 * `new`; a step count change or any method / navigate-url / target-identity
 * (role+name) / postcondition-url change is `meaningful-drift`; a bare selector
 * change with role+name intact is `selector-drift`; otherwise `unchanged`.
 */
export function classifyTraceDiff(prior: TraceView | null, candidate: TraceView): { kind: DriftKind; details: string[] } {
    if (!prior) {
        return { kind: 'new', details: ['no committed baseline'] };
    }
    const a = prior.Steps ?? [];
    const b = candidate.Steps ?? [];
    const details: string[] = [];
    let meaningful = false;
    let selector = false;

    if (a.length !== b.length) {
        meaningful = true;
        details.push(`step count ${a.length}→${b.length}`);
    }

    const n = Math.min(a.length, b.length);
    for (let i = 0; i < n; i++) {
        const sa = a[i].Action ?? {};
        const sb = b[i].Action ?? {};
        if ((sa.Method ?? '') !== (sb.Method ?? '')) {
            meaningful = true;
            details.push(`step ${i}: method ${sa.Method ?? '∅'}→${sb.Method ?? '∅'}`);
        }
        if ((sa.Url ?? '') !== (sb.Url ?? '')) {
            meaningful = true;
            details.push(`step ${i}: navigate url changed`);
        }
        const ta = sa.Target ?? {};
        const tb = sb.Target ?? {};
        if ((ta.Role ?? '') !== (tb.Role ?? '') || (ta.Name ?? '') !== (tb.Name ?? '')) {
            meaningful = true;
            details.push(`step ${i}: target role/name changed`);
        } else if ((ta.Selector ?? '') !== (tb.Selector ?? '')) {
            selector = true;
            details.push(`step ${i}: selector drift`);
        }
        if ((a[i].Postcondition?.UrlPattern ?? '') !== (b[i].Postcondition?.UrlPattern ?? '')) {
            meaningful = true;
            details.push(`step ${i}: postcondition url changed`);
        }
    }

    if (meaningful) return { kind: 'meaningful-drift', details };
    if (selector) return { kind: 'selector-drift', details };
    return { kind: 'unchanged', details: [] };
}
