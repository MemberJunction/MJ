/**
 * @fileoverview Crash-safe incremental result persistence (DR-D5).
 * @module @memberjunction/testing-cli
 *
 * `results.json` is written once, after the whole suite returns. An OOM at
 * hour 7 (or a `docker stop`) therefore lost every outcome. This sink persists
 * results AS they complete, next to that final file:
 *
 *   - `results.jsonl` — one line per ATTEMPT (prior failed attempts + the final
 *     result), appended synchronously the moment each test resolves. This is the
 *     durable, append-only truth a crashed run leaves behind.
 *   - `results.partial.json` — an atomically-rewritten snapshot (tmp + rename)
 *     with a `status` of `Running` / `Cancelled` / `Crashed` / `Completed`, so
 *     `status`/`rerun-failures` (DR-F3/F4) and mid-run reporting have a single
 *     self-consistent view without replaying the JSONL.
 *
 * Both live in the run directory derived from the `--output` path
 * (`<RUN_DIR>/results.json` → `<RUN_DIR>/results.{jsonl,partial.json}`), so no
 * new config or RUN_ID plumbing is needed inside the CLI.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { TestRunResult } from '@memberjunction/testing-engine-base';

/** Terminal snapshot state for `results.partial.json`. */
export type PartialStatus = 'Running' | 'Completed' | 'Cancelled' | 'Crashed';

/** One `results.jsonl` record — a single attempt of a single test. */
interface AttemptLine {
    runId: string;
    testId: string;
    testName: string;
    attempt: number;
    isFinal: boolean;
    status: string;
    score: number;
    durationMs: number;
    workerIndex?: number;
    flaky?: boolean;
    error?: string;
    ts: string;
}

/** Compact per-test row in the partial snapshot (no screenshots/oracle payloads). */
interface PartialTestRow {
    testId: string;
    testName: string;
    status: string;
    score: number;
    durationMs: number;
    workerIndex?: number;
    attempts?: number;
    flaky?: boolean;
}

export class IncrementalResultsSink {
    private readonly completed: TestRunResult[] = [];
    private finalized = false;

    private constructor(
        private readonly runId: string,
        private readonly jsonlPath: string,
        private readonly partialPath: string,
        private readonly suiteName: string,
    ) {}

    /**
     * Build a sink writing alongside `outputPath`. Returns null when no output
     * path is configured (ad-hoc console runs) — then persistence is a no-op and
     * behavior is byte-for-byte unchanged.
     */
    static forOutput(outputPath: string | undefined, suiteName: string): IncrementalResultsSink | null {
        if (!outputPath) return null;
        const abs = path.resolve(outputPath);
        const runDir = path.dirname(abs);
        const runId = path.basename(runDir);
        return new IncrementalResultsSink(
            runId,
            path.join(runDir, 'results.jsonl'),
            path.join(runDir, 'results.partial.json'),
            suiteName,
        );
    }

    /**
     * Engine `onTestComplete` hook. Cheap + guarded: a disk hiccup here must
     * never disrupt the run, so every write is best-effort.
     */
    readonly onTestComplete = (result: TestRunResult): void => {
        this.completed.push(result);
        try {
            this.appendAttemptLines(result);
            this.writePartial('Running');
        } catch {
            /* best-effort — losing one incremental write must not fail the suite */
        }
    };

    /** Flush a terminal partial snapshot. Idempotent; safe from a signal handler. */
    finalize(status: Exclude<PartialStatus, 'Running'>): void {
        if (this.finalized) return;
        this.finalized = true;
        try {
            this.writePartial(status);
        } catch {
            /* best-effort */
        }
    }

    get completedCount(): number {
        return this.completed.length;
    }

    /** Expand a resolved result into one JSONL line per attempt and append them. */
    private appendAttemptLines(result: TestRunResult): void {
        const now = new Date().toISOString();
        const priors = result.priorAttempts ?? [];
        const lines: AttemptLine[] = [];

        for (const p of priors) {
            lines.push({
                runId: this.runId,
                testId: result.testId,
                testName: result.testName,
                attempt: p.attempt,
                isFinal: false,
                status: p.status,
                score: p.score,
                durationMs: p.durationMs,
                error: p.errorMessage,
                ts: now,
            });
        }

        lines.push({
            runId: this.runId,
            testId: result.testId,
            testName: result.testName,
            attempt: result.attempts ?? priors.length + 1,
            isFinal: true,
            status: result.status,
            score: result.score,
            durationMs: result.durationMs,
            workerIndex: result.workerIndex,
            flaky: result.flaky,
            error: result.errorMessage,
            ts: now,
        });

        fs.appendFileSync(this.jsonlPath, lines.map(l => JSON.stringify(l)).join('\n') + '\n');
    }

    /** Rewrite the partial snapshot atomically (tmp file + rename). */
    private writePartial(status: PartialStatus): void {
        const counts = { passed: 0, failed: 0, error: 0, timeout: 0, skipped: 0, flaky: 0 };
        const tests: PartialTestRow[] = [];
        for (const r of this.completed) {
            if (r.status === 'Passed') counts.passed++;
            else if (r.status === 'Failed') counts.failed++;
            else if (r.status === 'Error') counts.error++;
            else if (r.status === 'Timeout') counts.timeout++;
            else if (r.status === 'Skipped') counts.skipped++;
            if (r.flaky) counts.flaky++;
            tests.push({
                testId: r.testId,
                testName: r.testName,
                status: r.status,
                score: r.score,
                durationMs: r.durationMs,
                workerIndex: r.workerIndex,
                attempts: r.attempts,
                flaky: r.flaky,
            });
        }

        const snapshot = {
            status,
            runId: this.runId,
            suiteName: this.suiteName,
            updatedAt: new Date().toISOString(),
            completed: this.completed.length,
            counts,
            tests,
        };

        const tmp = `${this.partialPath}.tmp`;
        fs.writeFileSync(tmp, JSON.stringify(snapshot, null, 2));
        fs.renameSync(tmp, this.partialPath);
    }
}
