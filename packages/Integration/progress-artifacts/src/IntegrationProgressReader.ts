import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { CountsContributeToAggregate } from './types.js';
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

    /**
     * List runs, newest-first by mtime.
     *
     * `offset` exists because the caller authorization-filters AFTER this returns, so a short page
     * does not mean the source is exhausted — it may just mean the caller could not read some of
     * what came back. Without an offset there is no way to ask for the next slice, and both UI
     * surfaces faked paging by re-requesting with a doubled limit.
     */
    public async ListRuns(filter: IntegrationRunFilter = {}, limit = 50, offset = 0): Promise<IntegrationRunSnapshot[]> {
        const entries = await this.safeReadDir(this.rootDir);
        const snapshots: Array<{ snap: IntegrationRunSnapshot; mtimeMs: number }> = [];
        for (const runID of entries) {
            const snap = await this.GetRun(runID);
            if (!snap) continue;
            if (filter.runKind && snap.manifest.runKind !== filter.runKind) continue;
            if (filter.integrationID && snap.manifest.integrationID !== filter.integrationID) continue;
            if (filter.companyIntegrationID && !IntegrationProgressReader.RunCoversCompanyIntegration(snap.manifest, filter.companyIntegrationID)) continue;
            if (filter.sinceTs && snap.manifest.startedAt < filter.sinceTs) continue;
            if (filter.inFlightOnly && !snap.isInFlight) continue;
            const mtime = await this.runMtime(runID);
            snapshots.push({ snap, mtimeMs: mtime });
        }
        snapshots.sort((a, b) => b.mtimeMs - a.mtimeMs);
        const start = Math.max(0, offset);
        return snapshots.slice(start, start + limit).map(s => s.snap);
    }

    /**
     * The complete set of connections a run touched, normalised across the two manifest shapes.
     *
     * Single-connection runs (every sync, every discovery) carry only `companyIntegrationID`;
     * runs that can span a batch (RSU) carry the full set in `companyIntegrationIDs` and set the
     * singular field only when the set has exactly one member. Callers that make a per-connection
     * decision — listing, and above all AUTHORIZATION — must read the set, not the singular field,
     * or a batch run silently looks connection-less.
     *
     * Returns an empty array for a run with no connection identity at all.
     */
    public static CompanyIntegrationIDsFor(manifest: IntegrationRunManifest): string[] {
        if (manifest.companyIntegrationIDs && manifest.companyIntegrationIDs.length > 0) {
            return manifest.companyIntegrationIDs;
        }
        return manifest.companyIntegrationID ? [manifest.companyIntegrationID] : [];
    }

    /** Whether the given connection is one of the connections a run touched. */
    public static RunCoversCompanyIntegration(manifest: IntegrationRunManifest, companyIntegrationID: string): boolean {
        return IntegrationProgressReader.CompanyIntegrationIDsFor(manifest).includes(companyIntegrationID);
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
    /**
     * Per-entity outcome counts for a sync run, recovered from its event stream.
     *
     * The run ROW records only TotalRecords, so history could never show created vs updated vs
     * skipped per table — the field existed on the API type and was never populated, which is what
     * thing.txt saw as an empty breakdown. The engine already emits every number needed on
     * `sync.entity-map.complete`; this reads them back.
     *
     * Honest ceiling: artifacts are pruned by the retention cap and are node-local, so a run old
     * enough to have been pruned yields nothing. The caller must render that as "not recorded"
     * rather than as zeros.
     */
    public async EntityOutcomes(runID: string): Promise<Array<{
        EntityName: string; InsertCount: number; UpdateCount: number; SkipCount: number; ErrorCount: number;
    }>> {
        const events = await this.Tail(runID, 0);
        const byEntity = new Map<string, { EntityName: string; InsertCount: number; UpdateCount: number; SkipCount: number; ErrorCount: number }>();
        for (const ev of events) {
            // A sync mirrors each entity map's completion as a `stage.complete` whose stage is the
            // object name. `counts` folds created and updated into `succeeded`, so the split rides
            // alongside in `data`.
            if (ev.eventType !== 'stage.complete') continue;
            const d = (ev.data ?? {}) as Record<string, unknown>;
            if (d.recordsCreated === undefined && d.recordsUpdated === undefined) continue;
            const name = String(d.mjEntity ?? ev.stage ?? '');
            if (!name) continue;
            const row = byEntity.get(name) ?? { EntityName: name, InsertCount: 0, UpdateCount: 0, SkipCount: 0, ErrorCount: 0 };
            // A map can appear more than once in a run (resume, or a push pass after a pull), so
            // accumulate rather than overwrite.
            row.InsertCount += Number(d.recordsCreated ?? 0);
            row.UpdateCount += Number(d.recordsUpdated ?? 0);
            row.SkipCount   += Number(ev.counts?.skipped ?? 0);
            row.ErrorCount  += Number(ev.counts?.failed ?? 0);
            byEntity.set(name, row);
        }
        return [...byEntity.values()];
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
                // Mirror the emitter's rule (CountsContributeToAggregate): only the APPLIED
                // rollup events (`stage.complete`/`run.complete`) feed the total. The FETCHED
                // `processed` on `records.batch.complete` is per-batch progress only and would
                // double-count every record if summed here. Keeping the rule in one place
                // guarantees a re-derived count matches the emitter's running aggregate.
                if (!CountsContributeToAggregate(ev.eventType)) continue;
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
