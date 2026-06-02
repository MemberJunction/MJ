import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import type {
    IntegrationProgressEvent,
    IntegrationRunFilter,
    IntegrationRunManifest,
    IntegrationRunResult,
    IntegrationRunSnapshot,
    SyncWarning,
} from './types.js';

/**
 * Read API for the progress artifacts. Frontend / health-check / resumption code
 * uses this to inspect ongoing or completed runs without touching the emitter.
 *
 * Implementation is purely file-system reads; no shared state with the emitter
 * (an emitter in another process can write while this reader tails).
 */
export class IntegrationProgressReader {
    constructor(private readonly rootDir: string = join(process.cwd(), 'logs', 'integration-runs')) {}

    /** List runs, newest-first by mtime. */
    public async ListRuns(filter: IntegrationRunFilter = {}, limit = 50): Promise<IntegrationRunSnapshot[]> {
        const entries = await this.safeReadDir(this.rootDir);
        const snapshots: Array<{ snap: IntegrationRunSnapshot; mtimeMs: number }> = [];
        for (const runID of entries) {
            const snap = await this.GetRun(runID);
            if (!snap) continue;
            if (filter.runKind && snap.manifest.runKind !== filter.runKind) continue;
            if (filter.integrationID && snap.manifest.integrationID !== filter.integrationID) continue;
            if (filter.companyIntegrationID && snap.manifest.companyIntegrationID !== filter.companyIntegrationID) continue;
            if (filter.sinceTs && snap.manifest.startedAt < filter.sinceTs) continue;
            if (filter.inFlightOnly && !snap.isInFlight) continue;
            const mtime = await this.runMtime(runID);
            snapshots.push({ snap, mtimeMs: mtime });
        }
        snapshots.sort((a, b) => b.mtimeMs - a.mtimeMs);
        return snapshots.slice(0, limit).map(s => s.snap);
    }

    /** Read snapshot of a single run. Returns undefined if runID not found. */
    public async GetRun(runID: string): Promise<IntegrationRunSnapshot | undefined> {
        const runDir = join(this.rootDir, runID);
        const manifest = await this.safeReadJSON<IntegrationRunManifest>(join(runDir, 'manifest.json'));
        if (!manifest) return undefined;
        const result = await this.safeReadJSON<IntegrationRunResult>(join(runDir, 'result.json'));
        const events = await this.readProgressTail(join(runDir, 'progress.jsonl'), 1);
        const latestEvent = events[events.length - 1];
        const allCounts = await this.aggregateCountsFromTail(join(runDir, 'progress.jsonl'));
        const warnings = await this.aggregateWarningsFromTail(join(runDir, 'progress.jsonl'));
        const eventCount = await this.countLines(join(runDir, 'progress.jsonl'));
        return {
            manifest,
            latestEvent,
            eventCount,
            result,
            isInFlight: !result,
            counts: allCounts,
            warnings: warnings.length > 0 ? warnings : undefined,
            warningCount: warnings.length,
        };
    }

    /** Tail events since a given sequence. */
    public async Tail(runID: string, sinceSeq = 0): Promise<IntegrationProgressEvent[]> {
        const path = join(this.rootDir, runID, 'progress.jsonl');
        const raw = await this.safeReadFile(path);
        if (!raw) return [];
        const out: IntegrationProgressEvent[] = [];
        for (const line of raw.split('\n')) {
            if (!line.trim()) continue;
            try {
                const ev = JSON.parse(line) as IntegrationProgressEvent;
                if (ev.seq > sinceSeq) out.push(ev);
            } catch { /* skip malformed line */ }
        }
        return out;
    }

    /** Find the latest checkpoint for a run (for resumption). */
    public async LatestCheckpoint(runID: string): Promise<IntegrationProgressEvent | undefined> {
        const events = await this.Tail(runID, 0);
        for (let i = events.length - 1; i >= 0; i--) {
            if (events[i].eventType === 'checkpoint') return events[i];
        }
        return undefined;
    }

    /** Find all in-flight (non-terminated) runs — for restart-resumption discovery. */
    public async FindInFlight(): Promise<IntegrationRunSnapshot[]> {
        return this.ListRuns({ inFlightOnly: true }, 1000);
    }

    // ── Internals ──────────────────────────────────────────────────────

    private async safeReadDir(p: string): Promise<string[]> {
        try { return await fs.readdir(p); } catch { return []; }
    }
    private async safeReadFile(p: string): Promise<string | undefined> {
        try { return await fs.readFile(p, 'utf-8'); } catch { return undefined; }
    }
    private async safeReadJSON<T>(p: string): Promise<T | undefined> {
        const raw = await this.safeReadFile(p);
        if (!raw) return undefined;
        try { return JSON.parse(raw) as T; } catch { return undefined; }
    }
    private async runMtime(runID: string): Promise<number> {
        try {
            const s = await fs.stat(join(this.rootDir, runID));
            return s.mtimeMs;
        } catch { return 0; }
    }
    private async readProgressTail(path: string, maxLines: number): Promise<IntegrationProgressEvent[]> {
        const raw = await this.safeReadFile(path);
        if (!raw) return [];
        const lines = raw.split('\n').filter(Boolean);
        const tail = lines.slice(Math.max(0, lines.length - maxLines));
        const out: IntegrationProgressEvent[] = [];
        for (const line of tail) {
            try { out.push(JSON.parse(line) as IntegrationProgressEvent); } catch { /* skip */ }
        }
        return out;
    }
    private async countLines(path: string): Promise<number> {
        const raw = await this.safeReadFile(path);
        if (!raw) return 0;
        return raw.split('\n').filter(Boolean).length;
    }
    private async aggregateCountsFromTail(path: string): Promise<IntegrationRunSnapshot['counts']> {
        const raw = await this.safeReadFile(path);
        if (!raw) return undefined;
        const totals = { processed: 0, succeeded: 0, failed: 0, skipped: 0 };
        for (const line of raw.split('\n')) {
            if (!line.trim()) continue;
            try {
                const ev = JSON.parse(line) as IntegrationProgressEvent;
                if (!ev.counts) continue;
                totals.processed += ev.counts.processed ?? 0;
                totals.succeeded += ev.counts.succeeded ?? 0;
                totals.failed += ev.counts.failed ?? 0;
                totals.skipped += ev.counts.skipped ?? 0;
            } catch { /* skip */ }
        }
        return totals;
    }
    private async aggregateWarningsFromTail(path: string): Promise<SyncWarning[]> {
        const raw = await this.safeReadFile(path);
        if (!raw) return [];
        const warnings: SyncWarning[] = [];
        for (const line of raw.split('\n')) {
            if (!line.trim()) continue;
            try {
                const ev = JSON.parse(line) as IntegrationProgressEvent;
                if (ev.eventType !== 'warning') continue;
                warnings.push(this.warningFromEvent(ev));
            } catch { /* skip */ }
        }
        return warnings;
    }
    /** Reconstruct a {@link SyncWarning} from a persisted `'warning'` event. */
    private warningFromEvent(event: IntegrationProgressEvent): SyncWarning {
        const { code, ...rest } = event.data ?? {};
        return {
            code: typeof code === 'string' ? code : 'UNKNOWN',
            stage: event.stage ?? '',
            message: event.message ?? '',
            data: Object.keys(rest).length > 0 ? rest : undefined,
        };
    }
}
