import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { CountsContributeToAggregate } from './types.js';
import { DefaultRunArtifactRoot } from './RunArtifactRoot.js';
import type {
    IntegrationProgressEvent,
    IntegrationRunFilter,
    IntegrationRunManifest,
    IntegrationRunResult,
    IntegrationRunSnapshot,
    SyncWarning,
} from './types.js';

/**
 * The two small files that identify a run: written once each, and enough to answer every filter
 * {@link IntegrationProgressReader.ListRuns} supports. Reading them is O(1) in the size of the run.
 */
interface RunHead {
    manifest: IntegrationRunManifest;
    result?: IntegrationRunResult;
}

/** Everything one pass over a journal yields. See {@link IntegrationProgressReader.readJournalDigest}. */
interface JournalDigest {
    eventCount: number;
    latestEvent?: IntegrationProgressEvent;
    counts?: NonNullable<IntegrationProgressEvent['counts']>;
    warnings: SyncWarning[];
}

/**
 * Read API for the progress artifacts. Frontend / health-check / resumption code
 * uses this to inspect ongoing or completed runs without touching the emitter.
 *
 * Implementation is purely file-system reads; no shared state with the emitter
 * (an emitter in another process can write while this reader tails).
 *
 * **Read cost is part of the contract.** A run's journal reaches 12–13 k events with multi-KB
 * payloads, and on App Service's SMB filesystem `IntegrationListRuns` with `limit:1` once took 73
 * seconds and then timed out (MJ-RUN-5/21) — because it hydrated EVERY run before applying the
 * limit, and each hydration read the whole journal four times. So:
 *
 *  - every filter {@link ListRuns} supports is answered from `manifest.json`/`result.json`, and the
 *    limit is applied BEFORE anything opens a journal;
 *  - a run that finished carries its own numbers in `result.json`, and they are taken from there
 *    rather than re-derived;
 *  - when a journal must be read, it is read ONCE and every value comes out of that pass.
 */
export class IntegrationProgressReader {
    constructor(private readonly rootDir: string = DefaultRunArtifactRoot()) {}

    /**
     * List runs, newest-STARTED first.
     *
     * Ordering is by the manifest's `startedAt`, not by directory mtime. A stranded run stops being
     * written to, so its mtime freezes at the moment it stranded and mtime ordering sank it below
     * every later run — hiding, behind the `limit`, exactly the run an operator is looking for. A
     * start time never moves. (The same reasoning governs retention; see
     * `IntegrationProgressEmitter.pruneOldRuns`.)
     *
     * Filters and the limit are applied on the run HEADS — `manifest.json` plus the presence of
     * `result.json` — so only the runs actually being returned are hydrated.
     */
    public async ListRuns(filter: IntegrationRunFilter = {}, limit = 50): Promise<IntegrationRunSnapshot[]> {
        const entries = await this.safeReadDir(this.rootDir);
        const heads: Array<{ runID: string; head: RunHead }> = [];
        for (const runID of entries) {
            const head = await this.readRunHead(runID);
            if (!head) continue; // not a run dir (or a manifest still being written)
            const manifest = head.manifest;
            if (filter.runKind && manifest.runKind !== filter.runKind) continue;
            if (filter.integrationID && manifest.integrationID !== filter.integrationID) continue;
            if (filter.companyIntegrationID && !IntegrationProgressReader.RunCoversCompanyIntegration(manifest, filter.companyIntegrationID)) continue;
            if (filter.sinceTs && manifest.startedAt < filter.sinceTs) continue;
            if (filter.inFlightOnly && head.result) continue;
            heads.push({ runID, head });
        }
        heads.sort((a, b) => {
            const byStart = IntegrationProgressReader.startMs(b.head.manifest) - IntegrationProgressReader.startMs(a.head.manifest);
            if (byStart !== 0) return byStart;
            // Run IDs embed their mint time and a random suffix, so this is a stable, deterministic
            // tiebreak for two runs that started in the same millisecond.
            return a.runID < b.runID ? 1 : a.runID > b.runID ? -1 : 0;
        });
        const kept = heads.slice(0, limit);
        const snapshots: IntegrationRunSnapshot[] = [];
        for (const k of kept) {
            snapshots.push(await this.hydrate(k.runID, k.head));
        }
        return snapshots;
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
        const head = await this.readRunHead(runID);
        if (!head) return undefined;
        return this.hydrate(runID, head);
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

    /** Sortable run start, from the manifest. An unparseable timestamp sorts oldest rather than throwing. */
    private static startMs(manifest: IntegrationRunManifest): number {
        const parsed = Date.parse(manifest.startedAt);
        return Number.isFinite(parsed) ? parsed : 0;
    }

    /**
     * The manifest and (if the run finished) the terminal record. Two small files, no journal.
     *
     * A missing or unparseable manifest means "not a run" — the same rule the emitter's resume path
     * applies — so a stray file under the root is skipped rather than reported as a run.
     */
    private async readRunHead(runID: string): Promise<RunHead | undefined> {
        const runDir = join(this.rootDir, runID);
        const manifest = await this.safeReadJSON<IntegrationRunManifest>(join(runDir, 'manifest.json'));
        if (!manifest) return undefined;
        const result = await this.safeReadJSON<IntegrationRunResult>(join(runDir, 'result.json'));
        return { manifest, result };
    }

    /**
     * Turns a run head into the full snapshot.
     *
     * A finished run costs ZERO journal reads: the emitter already wrote its aggregate counts,
     * warnings, event count and final event into `result.json` — re-deriving them from the journal is
     * what made a listing read every run's whole event log. A run still in flight, and a run whose
     * `result.json` predates the persisted counters, take exactly one pass.
     */
    private async hydrate(runID: string, head: RunHead): Promise<IntegrationRunSnapshot> {
        const result = head.result;
        if (result && result.eventCount !== undefined) {
            return {
                manifest: head.manifest,
                latestEvent: result.latestEvent,
                eventCount: result.eventCount,
                result,
                isInFlight: false,
                counts: result.aggregateCounts,
                warnings: result.warnings,
                warningCount: result.warningCount ?? result.warnings?.length ?? 0,
            };
        }
        const digest = await this.readJournalDigest(join(this.rootDir, runID, 'progress.jsonl'));
        return {
            manifest: head.manifest,
            latestEvent: digest.latestEvent,
            eventCount: digest.eventCount,
            result,
            isInFlight: !result,
            // A terminal record still wins where it has the number: it is the emitter's own account of
            // the run, and for a resumed run it spans both processes.
            counts: result?.aggregateCounts ?? digest.counts,
            warnings: result?.warnings ?? (digest.warnings.length > 0 ? digest.warnings : undefined),
            warningCount: result?.warningCount ?? digest.warnings.length,
        };
    }

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

    /**
     * ONE pass over a journal, yielding every value a snapshot needs from it: the event count, the
     * latest event, the applied-count aggregate and the warnings rollup.
     *
     * This replaces four independent helpers that each read the whole file into a JS string. On a
     * 12–13 k-event journal that was four multi-megabyte strings per run per call — a heap risk as
     * much as an I/O one.
     */
    private async readJournalDigest(path: string): Promise<JournalDigest> {
        const raw = await this.safeReadFile(path);
        if (raw === undefined) return { eventCount: 0, warnings: [] };
        const totals = { processed: 0, succeeded: 0, failed: 0, skipped: 0 };
        const warnings: SyncWarning[] = [];
        let eventCount = 0;
        let latestEvent: IntegrationProgressEvent | undefined;
        for (const line of raw.split('\n')) {
            if (!line.trim()) continue;
            eventCount++;
            let ev: IntegrationProgressEvent;
            try { ev = JSON.parse(line) as IntegrationProgressEvent; } catch { continue; }
            // The last PARSEABLE line, not literally the last line: a run killed mid-append leaves a
            // torn fragment, and treating that as "no latest event" is what makes a killed run
            // unrecognisable to the resume path, which matches on the run's last stage.
            latestEvent = ev;
            if (ev.eventType === 'warning') warnings.push(IntegrationProgressReader.warningFromEvent(ev));
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
        }
        return { eventCount, latestEvent, counts: totals, warnings };
    }

    /** Reconstruct a {@link SyncWarning} from a persisted `'warning'` event. */
    private static warningFromEvent(event: IntegrationProgressEvent): SyncWarning {
        const { code, ...rest } = event.data ?? {};
        return {
            code: typeof code === 'string' ? code : 'UNKNOWN',
            stage: event.stage ?? '',
            message: event.message ?? '',
            data: Object.keys(rest).length > 0 ? rest : undefined,
        };
    }
}
