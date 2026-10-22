import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { IntegrationProgressReader } from './IntegrationProgressReader.js';
import type { IntegrationRunResult } from './types.js';

/**
 * Closes out run artifacts that a process death left open.
 *
 * A run is marked terminal by the process that owns it, when it finishes. A process that is KILLED
 * — OOM killer, SIGKILL, host reboot — never gets to do that, so its `result.json` is never written
 * and the run reads as `isInFlight` forever. Nothing distinguishes it from a run still doing work:
 * the wizard spins indefinitely, the active-operations panel shows a live step that will never
 * advance, and no failure is reported anywhere, because the only process that could have reported
 * it is the one that died.
 *
 * Observed 2026-09-14: an RSU run was OOM-killed during CompileTypeScript. Hours later the workspace
 * was healthy and idle, and that run still read as in-flight at step 'CompileTypeScript'.
 *
 * The reconciliation is sound because run artifacts are PROCESS-LOCAL: every run this process can
 * see that is still in flight when this process is starting up necessarily belongs to a process that
 * no longer exists. That is only true at boot, before anything has started a run, which is the one
 * moment this may safely run.
 *
 * `'killed'` is already the artifact vocabulary's term for this exit, so consumers that classify by
 * `exitReason` need no change to understand the result.
 *
 * KNOWN LIMIT — assumes ONE process per artifact directory, which is the same single-writer
 * assumption the surrounding services document. If MJAPI is ever scaled past one replica sharing a
 * directory, a starting replica would close out a sibling's live runs. Gate the call, not this
 * function, if that day comes.
 */
export async function SweepInterruptedRuns(
    rootDir?: string,
    log: (message: string) => void = () => {},
): Promise<{ Swept: string[]; Failed: string[] }> {
    const reader = rootDir ? new IntegrationProgressReader(rootDir) : new IntegrationProgressReader();
    const swept: string[] = [];
    const failed: string[] = [];

    let inFlight: Awaited<ReturnType<IntegrationProgressReader['FindInFlight']>>;
    try {
        inFlight = await reader.FindInFlight();
    } catch (e) {
        log(`[RunReconciler] could not list in-flight runs: ${e instanceof Error ? e.message : String(e)}`);
        return { Swept: swept, Failed: failed };
    }
    if (inFlight.length === 0) return { Swept: swept, Failed: failed };

    for (const snap of inFlight) {
        const runID = snap.manifest.runID;
        // Name the step it died on. That is the single most useful fact for whoever reads this
        // afterwards, and it is the one thing a killed run cannot say for itself.
        const lastStage = snap.latestEvent?.stage;
        const where = lastStage ? ` during '${lastStage}'` : '';
        const startedAt = Date.parse(snap.manifest.startedAt);
        const result: IntegrationRunResult = {
            runID,
            completedAt: new Date().toISOString(),
            success: false,
            exitReason: 'killed',
            durationMs: Number.isFinite(startedAt) ? Math.max(0, Date.now() - startedAt) : 0,
            errors: [
                {
                    stage: lastStage,
                    code: 'RUN_INTERRUPTED',
                    message:
                        `The process running this ${snap.manifest.runKind} was terminated${where} ` +
                        `before it could finish. Marked terminal at startup by the process that replaced it.`,
                },
            ],
        };
        const path = join(reader.RootDir, runID, 'result.json');
        try {
            // 'wx' — never overwrite. A result written between the listing and here is the owning
            // process's own word on the run, and it outranks this inference.
            await fs.writeFile(path, JSON.stringify(result, null, 2), { encoding: 'utf-8', flag: 'wx' });
            swept.push(runID);
            log(`[RunReconciler] closed interrupted ${snap.manifest.runKind} run ${runID}${where}`);
        } catch (e) {
            const code = (e as NodeJS.ErrnoException)?.code;
            if (code === 'EEXIST') continue;
            failed.push(runID);
            log(`[RunReconciler] could not close run ${runID}: ${e instanceof Error ? e.message : String(e)}`);
        }
    }
    return { Swept: swept, Failed: failed };
}
