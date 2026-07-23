/**
 * Trace store (RI-B2) — the driver's read/write path for committed replay traces.
 *
 * Two directories, two roles (Decision D1):
 *  - The COMMITTED store (`resolveTraceDir`) holds one `T{NNN}.trace.json` per
 *    test, git-committed and mounted `:ro` into the runner. The driver REPLAYS
 *    from here (RI-C1). Absent trace ⇒ `loadTrace` returns null ⇒ LLM tier — the
 *    correct, safe default for a not-yet-recorded test.
 *  - The per-run CANDIDATE dir (`resolveTraceOutDir`) is where a green LLM run
 *    RECORDS a fresh trace (RI-B1). Candidates reach the committed store only
 *    through the human-reviewed `mj test regression promote-traces` step (RI-B3)
 *    — a run never writes the committed store directly.
 *
 * Traces are plain driver-read JSON files, never mj-sync entities — they never
 * touch the DB. Pure data classes (no methods), so a parsed object structurally
 * satisfies the replay engine, which only reads fields.
 */
import { mkdir, readFile, rename, writeFile } from 'fs/promises';
import * as path from 'path';
import { ComputerUseTrace } from '@memberjunction/computer-use';

/** Default committed store, relative to the process CWD (the container's /app). */
const DEFAULT_TRACE_DIR = 'metadata-optional/regression-test/tests/regression/traces';
/** Default per-run candidate out dir, relative to the process CWD. */
const DEFAULT_TRACE_OUT_DIR = 'test-results/traces-out';

/** Minimal shape the store needs from a test row to key its trace file. */
export interface TraceKeyedTest {
    ID: string;
    Name?: string | null;
}

/**
 * The committed store the driver replays FROM. Overridable via `CU_TRACE_DIR`
 * (the DR-E2 env contract entry the runner sets to the `:ro` mount path).
 */
export function resolveTraceDir(): string {
    return process.env.CU_TRACE_DIR || path.join(process.cwd(), DEFAULT_TRACE_DIR);
}

/**
 * The per-run candidate dir the driver records INTO. Overridable via
 * `CU_TRACE_OUT_DIR` (defaults under the run's `test-results/` so promotion can
 * find it after the run).
 */
export function resolveTraceOutDir(): string {
    return process.env.CU_TRACE_OUT_DIR || path.join(process.cwd(), DEFAULT_TRACE_OUT_DIR);
}

/**
 * Stable on-disk file name for a test's trace: the human-readable `T{NNN}` name
 * prefix when present (so a trace diff in a PR is legible), else the test's ID.
 * Load and record MUST agree, so both go through this one helper.
 */
export function traceFileName(test: TraceKeyedTest): string {
    const match = /^(T\d+)\b/.exec((test.Name ?? '').trim());
    const key = match ? match[1] : test.ID;
    return `${key}.trace.json`;
}

/**
 * Parse a serialized trace into a {@link ComputerUseTrace}. Returns null on
 * malformed JSON or a shape that isn't a trace — the caller then falls to the
 * LLM tier rather than replaying garbage. Structural: the trace classes are
 * data-only, so the parsed object is used directly (replay reads fields only).
 */
export function deserializeTrace(json: string): ComputerUseTrace | null {
    let parsed: ComputerUseTrace;
    try {
        parsed = JSON.parse(json) as ComputerUseTrace;
    } catch {
        return null;
    }
    if (!parsed || typeof parsed.TestId !== 'string' || !Array.isArray(parsed.Steps)) {
        return null;
    }
    return parsed;
}

/**
 * Load a committed trace by file name; null when the file is absent (not yet
 * recorded → LLM tier) or malformed. Never throws.
 */
export async function loadTrace(fileName: string, dir: string = resolveTraceDir()): Promise<ComputerUseTrace | null> {
    let raw: string;
    try {
        raw = await readFile(path.join(dir, fileName), 'utf8');
    } catch {
        return null;
    }
    return deserializeTrace(raw);
}

/**
 * Write a recorded candidate trace to the per-run out dir (atomic tmp+rename so
 * a concurrent reader never sees a half-written file). Returns the path written.
 */
export async function persistCandidateTrace(
    trace: ComputerUseTrace,
    fileName: string,
    outDir: string = resolveTraceOutDir()
): Promise<string> {
    await mkdir(outDir, { recursive: true });
    const full = path.join(outDir, fileName);
    const tmp = `${full}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify(trace, null, 2), 'utf8');
    await rename(tmp, full);
    return full;
}
