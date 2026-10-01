/**
 * cache-fleet-baseline.ts — fleet-shaped measurement rig for the engine/cache investigation.
 * SCRATCH TOOL (plans/engine-cache-architecture-plan.md §7). Findings graduate into checks
 * under src/checks/; this file is not part of any suite and never runs in CI.
 *
 * Spawns R replica processes (rigs/lib/cache-fleet-replica.ts), each booting exactly the way
 * MJAPI/Skip boot, against ONE database (DB_DATABASE from .env, forced to mj_test_2 here) and ONE
 * private Redis (started on port 16380 unless --redis=<url> is given), then runs:
 *
 *   boot     E1 boot storm · E5 rebuild cost · E6 registry traffic · E4 convergence census
 *   latency  E2 save on A → first seen on B..R (p50/p95/max over --trials)
 *   stale    E3 (a) raw-SQL writer (b) CLI-shaped in-memory writer, lazy engine read, fresh-boot heal
 *   sweep    3.1  raw SQL change with the engine sweep on (--sweep-ms) → time until every replica has it
 *   burst    N11  one replica saves --burst notes in a row, then deletes them → slot writes and peer work
 *                 (--burst-mode=serial|transaction: record by record, or the whole burst in one transaction)
 *   race     N7   two replicas save notes at the same moment → do engines and the slot agree with the DB?
 *   snapshot F11  one replica saves its metadata snapshot (what a metadata refresh does) → what peers receive
 *   expiry   1.2  an engine's slot expires under running replicas → a later save must still reach
 *                 them; per-entity index sets shrink back once their slots expire
 *   users    §15  a user created / given a role / deactivated on replica 0 must reach the other
 *                 replicas' UserCache without a restart and without an opted-in poll, and must NOT
 *                 reach a replica whose cache is not shared (the control)
 *   cli-ops  §14  the REAL `mj` binary (sync push / migrate / codegen, with REDIS_URL set) runs while
 *                 every replica reads continuously → reader failures, convergence, reloads, and a
 *                 replica booting mid-command (--ops=push,push-metadata,migrate,codegen; default push)
 *
 *   npx tsx packages/TestingFramework/integration-test-suite/rigs/cache-fleet-baseline.ts \
 *       --replicas=3 --phases=boot,latency,stale --trials=20 [--redis=redis://localhost:6379] [--ttl=<seconds>]
 *
 * Writes a JSON report to --out (default: ./cache-fleet-report-<ts>.json in cwd) and prints a
 * summary. Exit 0 on completion, 2 on bootstrap error. Leaves the DB as it found it (notes it
 * created are deleted; the model description it edits is restored).
 */
import { fork, spawn, spawnSync } from 'child_process';
import type { ChildProcess } from 'child_process';
import { openSync, writeFileSync, mkdirSync, readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Redis from 'ioredis';
import { UUIDsEqual } from '@memberjunction/global';

// ────────────────────────────────────────────────────────────────────────────────────────────
// Args
// ────────────────────────────────────────────────────────────────────────────────────────────

const argv = new Map<string, string>();
for (const a of process.argv.slice(2)) {
    const m = /^--([^=]+)=(.*)$/.exec(a);
    if (m) argv.set(m[1], m[2]);
}
const REPLICAS = Number(argv.get('replicas') ?? '3');
const PHASES = new Set((argv.get('phases') ?? 'boot,latency,stale').split(',').map(s => s.trim()));
const TRIALS = Number(argv.get('trials') ?? '20');
const REDIS_ARG = argv.get('redis');
const OUT = argv.get('out') ?? path.resolve(process.cwd(), `cache-fleet-report-${Date.now()}.json`);
const LOG_DIR = argv.get('logdir') ?? path.resolve(path.dirname(OUT), 'cache-fleet-logs');
const DB_DATABASE = argv.get('db') ?? 'mj_test_2';
/** Passed to every replica's RedisLocalStorageProvider as defaultTTLSeconds; unset = provider default. */
const TTL_ARG = argv.get('ttl');
/** redis-first (MJAPI since plan N1) or legacy (engines load in memory, then swap). */
const BOOT_MODE = argv.get('boot') ?? 'redis-first';
/** ms between replica starts in the boot phase; 0 = all at once (the cold herd). */
const STAGGER_MS = Number(argv.get('stagger') ?? '0');
const BURST = Number(argv.get('burst') ?? '100');
/** serial = one save after another; transaction = the whole burst in one transaction (plan N11). */
const BURST_MODE = argv.get('burst-mode') ?? 'serial';
const REPLICA_NODE_ENV = process.env.NODE_ENV ?? 'production';
/** Engine sweep interval for the sweep phase. */
const SWEEP_MS = Number(argv.get('sweep-ms') ?? '3000');
/** cli-ops: which CLI commands to run (push = scoped, no-op and full-wipe sync pushes). */
const CLI_OPS = (argv.get('ops') ?? 'push').split(',').map(s => s.trim());
/** cli-ops: ms after a command starts at which a fresh replica boots (0 = none). */
const MID_BOOT_MS = Number(argv.get('mid-boot-ms') ?? '3000');
const PREFIX = `it-fleet-${Date.now().toString(36)}`;
const NOTES_ENTITY_NAME = 'MJ: AI Agent Notes';
// Native ESM package: no __dirname.
const REPLICA_SCRIPT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'lib', 'cache-fleet-replica.ts');

// ────────────────────────────────────────────────────────────────────────────────────────────
// Replica RPC
// ────────────────────────────────────────────────────────────────────────────────────────────

interface Reply { id: number; ok: boolean; result?: unknown; error?: string }

class Replica {
    private nextId = 1;
    private readonly waiting = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
    public readonly Proc: ChildProcess;
    public readonly Ready: Promise<void>;

    constructor(public readonly Name: string, mode: 'replica' | 'cli') {
        mkdirSync(LOG_DIR, { recursive: true });
        const out = openSync(path.join(LOG_DIR, `${PREFIX}-${Name}.log`), 'a');
        // Inherit tsx's loader flags so the child can run a .ts entry, drop anything else.
        const execArgv = process.execArgv.filter((a, i, arr) =>
            a === '--require' || a === '--import' || arr[i - 1] === '--require' || arr[i - 1] === '--import');
        this.Proc = fork(REPLICA_SCRIPT, [`--mode=${mode}`], {
            execArgv,
            cwd: process.cwd(),
            // production unless the caller chose otherwise: the PostgreSQL provider turns SSL on in
            // production, which a local container does not offer (run with NODE_ENV=development).
            env: { ...process.env, DB_DATABASE, NODE_ENV: REPLICA_NODE_ENV },
            stdio: ['ignore', out, out, 'ipc'],
        });
        this.Ready = new Promise<void>((resolve, reject) => {
            const onReady = (msg: Reply) => {
                if (msg.id === 0) { this.Proc.off('message', onReady); resolve(); }
            };
            this.Proc.on('message', onReady);
            this.Proc.once('exit', (code) => reject(new Error(`${name} exited before ready (code ${code})`)));
        });
        this.Proc.on('message', (msg: Reply) => {
            const w = this.waiting.get(msg.id);
            if (!w) return;
            this.waiting.delete(msg.id);
            if (msg.ok) w.resolve(msg.result);
            else w.reject(new Error(`${Name}: ${msg.error}`));
        });
        this.Proc.on('exit', (code) => {
            for (const [, w] of this.waiting) w.reject(new Error(`${Name} exited (code ${code})`));
            this.waiting.clear();
        });
    }

    public Call<T>(cmd: string, args: Record<string, string | number | undefined> = {}, timeoutMs = 180000): Promise<T> {
        const id = this.nextId++;
        return new Promise<T>((resolve, reject) => {
            const timer = setTimeout(() => {
                this.waiting.delete(id);
                reject(new Error(`${this.Name}: ${cmd} timed out after ${timeoutMs}ms`));
            }, timeoutMs);
            this.waiting.set(id, {
                resolve: (v) => { clearTimeout(timer); resolve(v as T); },
                reject: (e) => { clearTimeout(timer); reject(e); },
            });
            this.Proc.send({ id, cmd, args });
        });
    }

    public Kill(): void { if (!this.Proc.killed) this.Proc.kill('SIGKILL'); }
}

// ────────────────────────────────────────────────────────────────────────────────────────────
// Types mirrored from the replica
// ────────────────────────────────────────────────────────────────────────────────────────────

interface EventTally { count: number; bytes: number }
interface Counters {
    eventsReceived: Record<string, EventTally>;
    registryEvents: EventTally;
    redisWrites: Record<string, EventTally>;
    externalCacheChanges: { count: number; totalMs: number; maxMs: number };
    rebuilds: { count: number; totalMs: number; maxMs: number; samplesMs: number[] };
    dbCalls: { executeSQL: number; executeSQLBatch: number; batchStatements: number; readerCalls: number };
    sweeps: { count: number; reloads: number };
    metadata: { checks: number; refreshes: number };
    pending: number;
}
interface ReaderKindStats { ok: number; failed: number; empty: number; maxMs: number; errors: string[]; firstFailureAt: number | null; lastFailureAt: number | null }
interface ReaderStats { startedAt: number; stoppedAt: number | null; rounds: number; kinds: Record<string, ReaderKindStats> }
interface BootResult {
    pid: number; mode: string; db: string; user: string; bootMs: number; swapMs: number;
    dbCallsDuringBoot: number; dbBatchesDuringBoot: number; cacheWritesDuringBoot: number; runViewReadsDuringBoot: number;
    registryEntries: number; aiEngineLoaded: boolean; initialRebuilds: number;
}
interface Census {
    properties: Record<string, { count: number; maxUpdatedAt: string | null; hash: string }>;
    derived: Record<string, number>;
    fleetHash: string;
}

// ────────────────────────────────────────────────────────────────────────────────────────────
// Redis helpers
// ────────────────────────────────────────────────────────────────────────────────────────────

let redisServer: ChildProcess | undefined;

async function ensureRedis(): Promise<string> {
    if (REDIS_ARG) return REDIS_ARG;
    const port = 16380;
    redisServer = spawn('redis-server', ['--port', String(port), '--save', '', '--appendonly', 'no', '--loglevel', 'warning'], { stdio: 'ignore' });
    const url = `redis://127.0.0.1:${port}`;
    const probe = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 1 });
    probe.on('error', () => undefined); // expected while the server is still starting
    for (let i = 0; i < 50; i++) {
        try { await probe.connect(); await probe.ping(); await probe.quit(); return url; }
        catch { await sleep(100); try { probe.disconnect(); } catch { /* */ } }
    }
    throw new Error('could not start redis-server on 16380');
}

async function scanKeys(r: Redis, pattern: string): Promise<string[]> {
    const keys: string[] = [];
    let cursor = '0';
    do {
        const [next, batch] = await r.scan(cursor, 'MATCH', pattern, 'COUNT', 1000);
        cursor = next;
        keys.push(...batch);
    } while (cursor !== '0');
    return keys;
}

interface RedisSnapshot {
    runViewKeys: number; categorySetMembers: number; groupSets: number; groupMembers: number; registryBytes: number;
    sampleTTL: number | null; maxClientObufBytes: number; clientCount: number;
}

async function redisSnapshot(r: Redis): Promise<RedisSnapshot> {
    const runView = await scanKeys(r, `${PREFIX}:RunViewCache:*`);
    const members = await r.scard(`${PREFIX}:__categories__:RunViewCache`);
    const groupKeys = await scanKeys(r, `${PREFIX}:__group__:RunViewCache:*`);
    let groupMembers = 0;
    for (const g of groupKeys) groupMembers += await r.scard(g);
    const registryBytes = await r.strlen(`${PREFIX}:Metadata:__MJ_CACHE_REGISTRY__`);
    const sampleTTL = runView.length ? await r.ttl(runView[0]) : null;
    const list = String(await r.client('LIST'));
    let maxObuf = 0; let clientCount = 0;
    for (const line of list.split('\n')) {
        if (!line.trim()) continue;
        clientCount++;
        const m = /\bomem=(\d+)/.exec(line);
        if (m) maxObuf = Math.max(maxObuf, Number(m[1]));
    }
    return { runViewKeys: runView.length, categorySetMembers: members, groupSets: groupKeys.length, groupMembers, registryBytes, sampleTTL, maxClientObufBytes: maxObuf, clientCount };
}

/**
 * Description of one model in EVERY `MJ: AI Models` slot on Redis, keyed by the slot's
 * fingerprint tail. An engine slot carries `imr:1` (IgnoreMaxRows); a plain RunView of the same
 * entity lands in a separate slot without it — the two are maintained independently.
 */
async function redisSlotDescription(r: Redis, modelId: string): Promise<Record<string, string | null | 'absent'>> {
    const keys = await scanKeys(r, `${PREFIX}:RunViewCache:MJ: AI Models|*`);
    const out: Record<string, string | null | 'absent'> = {};
    for (const k of keys) {
        const tail = k.includes('|imr:1|') ? 'engine(imr:1)' : 'plain';
        const raw = await r.get(k);
        if (!raw) { out[tail] = 'absent'; continue; }
        const parsed = JSON.parse(raw) as { results?: Array<{ ID?: string; Description?: string | null }> };
        const row = parsed.results?.find(x => (x.ID ?? '').toUpperCase() === modelId.toUpperCase());
        out[tail] = row ? (row.Description ?? null) : 'absent';
    }
    return out;
}

// ────────────────────────────────────────────────────────────────────────────────────────────
// Phases
// ────────────────────────────────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> { return new Promise(r => setTimeout(r, ms)); }
function pct(sorted: number[], p: number): number | null {
    if (!sorted.length) return null;
    return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}
function sumTally(map: Record<string, EventTally>): EventTally {
    return Object.values(map).reduce((a, b) => ({ count: a.count + b.count, bytes: a.bytes + b.bytes }), { count: 0, bytes: 0 });
}

const report: Record<string, unknown> = { prefix: PREFIX, replicas: REPLICAS, boot: BOOT_MODE, staggerMs: STAGGER_MS, db: DB_DATABASE, startedAt: new Date().toISOString(), phases: {} };
const phases = report.phases as Record<string, unknown>;

async function spawnReplicas(n: number, offset = 0): Promise<Replica[]> {
    const reps = Array.from({ length: n }, (_, i) => new Replica(`r${offset + i}`, 'replica'));
    await Promise.all(reps.map(r => r.Ready));
    return reps;
}

async function bootAll(reps: Replica[], redisUrl: string): Promise<BootResult[]> {
    const args = { redisUrl, prefix: PREFIX, ttl: TTL_ARG, boot: BOOT_MODE };
    if (STAGGER_MS <= 0) {
        return Promise.all(reps.map(r => r.Call<BootResult>('boot', args)));
    }
    const results: BootResult[] = [];
    for (const r of reps) {
        results.push(await r.Call<BootResult>('boot', args));
        await r.Call('quiesce', { idleMs: 1000, maxMs: 60000 });
        await sleep(STAGGER_MS);
    }
    return results;
}

async function phaseBoot(reps: Replica[], redisUrl: string, r: Redis): Promise<void> {
    console.log(`\n[boot] starting ${reps.length} replicas simultaneously …`);
    const t0 = Date.now();
    const boots = await bootAll(reps, redisUrl);
    const wall = Date.now() - t0;
    console.log(`[boot] all booted in ${wall} ms; quiescing …`);
    const counters = await Promise.all(reps.map(x => x.Call<Counters>('quiesce', { idleMs: 2000, maxMs: 120000 })));
    const drainMs = Date.now() - t0 - wall;
    const censuses = await Promise.all(reps.map(x => x.Call<Census>('census')));
    const redis = await redisSnapshot(r);

    const rows = reps.map((x, i) => {
        const c = counters[i];
        const ev = sumTally(c.eventsReceived);
        const rv = c.eventsReceived['RunViewCache/set'] ?? { count: 0, bytes: 0 };
        return {
            replica: x.Name,
            bootMs: boots[i].bootMs, swapMs: boots[i].swapMs,
            dbCallsBoot: boots[i].dbCallsDuringBoot, dbBatchesBoot: boots[i].dbBatchesDuringBoot,
            cacheWritesBoot: boots[i].cacheWritesDuringBoot, cacheReadsBoot: boots[i].runViewReadsDuringBoot, registryEntries: boots[i].registryEntries,
            eventsIn: ev.count, eventBytesIn: ev.bytes, runViewSetsIn: rv.count, runViewBytesIn: rv.bytes,
            registryEventsIn: c.registryEvents.count, registryBytesIn: c.registryEvents.bytes,
            redisSetsOut: sumTally(c.redisWrites).count,
            payloadsApplied: c.externalCacheChanges.count, applyTotalMs: Math.round(c.externalCacheChanges.totalMs), applyMaxMs: Math.round(c.externalCacheChanges.maxMs),
            rebuilds: c.rebuilds.count, rebuildTotalMs: Math.round(c.rebuilds.totalMs), rebuildMaxMs: Math.round(c.rebuilds.maxMs * 100) / 100,
            dbCallsTotal: c.dbCalls.executeSQL, dbBatchesTotal: c.dbCalls.executeSQLBatch,
            fleetHash: censuses[i].fleetHash,
            modelsWithVendors: censuses[i].derived.modelsWithVendors, vendorsAttached: censuses[i].derived.vendorsAttached,
        };
    });
    console.table(rows);
    console.log('[boot] redis:', redis);
    const hashes = new Set(censuses.map(c => c.fleetHash));
    console.log(`[boot] convergence: ${hashes.size === 1 ? 'IDENTICAL' : 'DIVERGENT'} (${[...hashes].join(', ')})`);
    if (hashes.size > 1) {
        for (const [i, c] of censuses.entries()) console.log(`  ${reps[i].Name}:`, JSON.stringify(c.properties), JSON.stringify(c.derived));
    }
    phases.boot = { wallMs: wall, drainMs, rows, redis, convergence: hashes.size === 1, censuses, rebuildSamples: counters.map(c => c.rebuilds.samplesMs) };
}

async function phaseLatency(reps: Replica[]): Promise<void> {
    if (reps.length < 2) { console.log('[latency] needs ≥ 2 replicas, skipped'); return; }
    console.log(`\n[latency] ${TRIALS} trials …`);
    const samples: number[] = []; let misses = 0;
    const perTrial: Array<{ source: string; latencies: Record<string, number | null> }> = [];
    for (let t = 0; t < TRIALS; t++) {
        const src = reps[t % reps.length];
        const observers = reps.filter(x => x !== src);
        await Promise.all(observers.map(o => o.Call('arm-watch')));
        const saved = await src.Call<{ id: string; startedAt: number; savedAt: number }>('save-note', { marker: `${PREFIX}-t${t}` });
        const seen = await Promise.all(observers.map(o => o.Call<{ seenAt: number | null }>('read-watch', { id: saved.id, timeoutMs: 5000 })));
        const latencies: Record<string, number | null> = {};
        observers.forEach((o, i) => {
            const at = seen[i].seenAt;
            latencies[o.Name] = at === null ? null : at - saved.startedAt;
            if (at === null) misses++; else samples.push(at - saved.startedAt);
        });
        perTrial.push({ source: src.Name, latencies });
        await src.Call('delete-note', { id: saved.id });
        await sleep(200);
    }
    samples.sort((a, b) => a - b);
    const summary = { trials: TRIALS, observations: samples.length, misses, p50: pct(samples, 50), p95: pct(samples, 95), max: samples.at(-1) ?? null, min: samples[0] ?? null };
    console.log('[latency] save→seen (ms, from before Save()):', summary);
    const counters = await Promise.all(reps.map(x => x.Call<Counters>('counters')));
    phases.latency = { summary, perTrial, countersAfter: counters.map((c, i) => ({ replica: reps[i].Name, eventsIn: sumTally(c.eventsReceived), registryEvents: c.registryEvents, payloadsApplied: c.externalCacheChanges.count, rebuilds: c.rebuilds.count })) };
}

async function readAll(reps: Replica[], id: string): Promise<Record<string, string | null>> {
    const out: Record<string, string | null> = {};
    const res = await Promise.all(reps.map(x => x.Call<{ description: string | null }>('read-model', { id })));
    reps.forEach((x, i) => { out[x.Name] = res[i].description; });
    return out;
}

/** Polls every replica's engine until all show `expected`; ms waited, or null on timeout. */
async function waitForAll(reps: Replica[], id: string, expected: string | null, timeoutMs: number): Promise<number | null> {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
        const seen = await readAll(reps, id);
        if (Object.values(seen).every(v => v === expected)) return Date.now() - started;
        await sleep(20);
    }
    return null;
}

/** Runs the real `mj cache clear` binary against the rig's Redis and prefix. */
function runCacheClearCommand(redisUrl: string): { status: number | null; output: string } {
    const bin = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'MJCLI', 'bin', 'run.js');
    const res = spawnSync(process.execPath, [bin, 'cache', 'clear', '--url', redisUrl, '--prefix', PREFIX], { encoding: 'utf8', env: { ...process.env, NODE_ENV: REPLICA_NODE_ENV } });
    return { status: res.status, output: `${res.stdout ?? ''}${res.stderr ?? ''}`.trim() };
}

async function phaseStale(reps: Replica[], redisUrl: string, r: Redis): Promise<void> {
    console.log('\n[stale] …');
    const model = await reps[0].Call<{ id: string; description: string | null; name: string }>('pick-model');
    const original = model.description;
    const result: Record<string, unknown> = { model: { id: model.id, name: model.name, original } };
    try {
        // (a) raw SQL writer — no events anywhere
        const rawValue = `${PREFIX}-raw`;
        await reps[0].Call('raw-update-model', { id: model.id, description: rawValue });
        await sleep(3000);
        const afterRaw = await readAll(reps, model.id);
        const rvAfterRaw = await reps[0].Call<{ description: string | null; executionTime: number }>('runview-model', { id: model.id });
        result.rawWriter = { wrote: rawValue, engineViews: afterRaw, runViewOnReplica0: rvAfterRaw, redisSlot: await redisSlotDescription(r, model.id) };
        console.log('[stale] (a) raw SQL writer → engines see:', afterRaw, '| RunView hit sees:', rvAfterRaw.description, '| redis slot:', result.rawWriter && (result.rawWriter as Record<string, unknown>).redisSlot);
        // (a2) an operator runs `mj cache clear` (plan 2.1): how long until every replica sees the write?
        const clearStartedAt = Date.now();
        const cleared = runCacheClearCommand(redisUrl);
        const rawRecoveryMs = await waitForAll(reps, model.id, rawValue, 15000);
        result.rawWriterAfterCacheClear = { command: cleared, recoveredAfterMs: rawRecoveryMs, fromCommandStartMs: rawRecoveryMs === null ? null : Date.now() - clearStartedAt };
        console.log(`[stale] (a2) mj cache clear (exit ${cleared.status}) → every replica sees the raw write after ${rawRecoveryMs} ms`);
        await Promise.all(reps.map(x => x.Call('quiesce', { idleMs: 1500, maxMs: 30000 })));
        await reps[0].Call('raw-update-model', { id: model.id, description: original ?? 'null' });
        runCacheClearCommand(redisUrl);   // put the fleet back on the original value
        await waitForAll(reps, model.id, original, 15000);
        await Promise.all(reps.map(x => x.Call('quiesce', { idleMs: 1500, maxMs: 30000 })));

        // (b) CLI-shaped writer: in-memory provider, BaseEntity save, exits
        const cliValue = `${PREFIX}-cli`;
        const cli = new Replica('cli', 'cli');
        await cli.Ready;
        const cliBoot = await cli.Call<{ db: string; cacheWrites: number }>('cli-boot');
        await cli.Call('entity-save-model', { id: model.id, description: cliValue });
        const afterCliBeforeClear = await readAll(reps, model.id);
        // What `mj sync push` now does after its write (plan 2.1).
        const cliClearStartedAt = Date.now();
        const cliCleared = await cli.Call<{ keys: number }>('clear-shared-cache', { redisUrl, prefix: PREFIX });
        await cli.Call('exit');
        const cliRecoveryMs = await waitForAll(reps, model.id, cliValue, 15000);
        result.cliWriterClear = { beforeClear: afterCliBeforeClear, keysCleared: cliCleared.keys, recoveredAfterMs: cliRecoveryMs, fromClearStartMs: cliRecoveryMs === null ? null : Date.now() - cliClearStartedAt };
        console.log(`[stale] (b0) CLI writer + clear (${cliCleared.keys} keys) → before clear engines saw`, afterCliBeforeClear, `; every replica saw the write after ${cliRecoveryMs} ms`);
        await Promise.all(reps.map(x => x.Call('quiesce', { idleMs: 1500, maxMs: 30000 })));
        const afterCli = await readAll(reps, model.id);
        const slotAfterCli = await redisSlotDescription(r, model.id);
        // lazy engine on replica 0: first read comes from Redis
        const lazy = await reps[0].Call<{ description: string | null; count: number; dbCallsDelta: number; redisSetsDelta: number }>('load-lazy', { id: model.id });
        result.cliWriter = { wrote: cliValue, cliBoot, engineViews: afterCli, redisSlot: slotAfterCli, lazyEngineOnReplica0: lazy };
        console.log('[stale] (b) CLI writer → engines see:', afterCli, '| redis slot:', slotAfterCli, '| lazy engine read:', lazy);

        // (c) fresh replica boots: does it heal the peers (current ordering) or re-poison them?
        const fresh = (await spawnReplicas(1, reps.length))[0];
        const freshBoot = await fresh.Call<BootResult>('boot', { redisUrl, prefix: PREFIX, ttl: TTL_ARG, boot: BOOT_MODE });
        await Promise.all([fresh, ...reps].map(x => x.Call('quiesce', { idleMs: 2000, maxMs: 60000 })));
        const afterFresh = await readAll([...reps, fresh], model.id);
        const slotAfterFresh = await redisSlotDescription(r, model.id);
        result.freshBoot = { freshBootMs: freshBoot.bootMs, engineViews: afterFresh, redisSlot: slotAfterFresh };
        console.log('[stale] (c) fresh replica boot → engines see:', afterFresh, '| redis slot:', slotAfterFresh);
        await fresh.Call('exit').catch(() => undefined);
        fresh.Kill();

        // restore through the entity path from a Redis-connected replica so every peer converges
        // The SAVER's own engine cannot mutate in place (AIEngineBase overrides AdditionalLoading),
        // so it takes the 1.5 s debounced full refresh; peers adopt the Redis payload in ~30 ms.
        // Read twice to show that inversion.
        const restoreStartedAt = Date.now();
        await reps[0].Call('entity-save-model', { id: model.id, description: original ?? 'null' });
        await sleep(500);
        result.restoredAfter500ms = await readAll(reps, model.id);
        await sleep(3000);
        result.restoredAfter3500ms = await readAll(reps, model.id);
        result.restoreElapsedMs = Date.now() - restoreStartedAt;
    } finally {
        phases.stale = result;
    }
}

/** Deletes every Redis key matching a pattern — what TTL expiry does, minus the wait. */
async function expireKeys(r: Redis, pattern: string): Promise<number> {
    const keys = await scanKeys(r, pattern);
    if (keys.length) await r.del(...keys);
    return keys.length;
}

/** Note IDs with `marker` in the engine-shaped notes slot on Redis (the unfiltered `imr:1` slot). */
async function slotNoteIds(r: Redis, marker: string): Promise<string[] | 'absent'> {
    const keys = (await scanKeys(r, `${PREFIX}:RunViewCache:${NOTES_ENTITY_NAME}|*`)).filter(k => k.includes('|imr:1|') && k.includes(`${NOTES_ENTITY_NAME}|_|`));
    if (keys.length === 0) return 'absent';
    const raw = await r.get(keys[0]);
    if (!raw) return 'absent';
    const parsed = JSON.parse(raw) as { results?: Array<{ ID?: string; Comments?: string | null }> };
    return (parsed.results ?? []).filter(n => (n.Comments ?? '').startsWith(marker)).map(n => String(n.ID).toUpperCase()).sort();
}

function notesWork(c: Counters): { slotSets: number; slotBytes: number } {
    const w = c.redisWrites['RunViewCache/set'] ?? { count: 0, bytes: 0 };
    return { slotSets: w.count, slotBytes: w.bytes };
}

async function phaseBurst(reps: Replica[]): Promise<void> {
    if (reps.length < 2) { console.log('[burst] needs ≥ 2 replicas, skipped'); return; }
    const [src, ...peers] = reps;
    const marker = `${PREFIX}-burst`;
    console.log(`\n[burst] ${BURST} saves then ${BURST} deletes on ${src.Name} (${BURST_MODE}) …`);
    const measure = async (label: string, act: () => Promise<number>, expectedIds: () => Promise<boolean>) => {
        await Promise.all(reps.map(x => x.Call('quiesce', { idleMs: 1500, maxMs: 30000 })));
        const before = await Promise.all(reps.map(x => x.Call<Counters>('counters')));
        const t0 = Date.now();
        const actMs = await act();
        let converged: number | null = null;
        while (Date.now() - t0 < 60000) { if (await expectedIds()) { converged = Date.now() - t0; break; } await sleep(100); }
        await Promise.all(reps.map(x => x.Call('quiesce', { idleMs: 2000, maxMs: 60000 })));
        const after = await Promise.all(reps.map(x => x.Call<Counters>('counters')));
        const srcW = notesWork(after[0]); const srcB = notesWork(before[0]);
        const peerRows = peers.map((p, i) => ({
            replica: p.Name,
            eventsIn: sumTally(after[i + 1].eventsReceived).count - sumTally(before[i + 1].eventsReceived).count,
            bytesIn: sumTally(after[i + 1].eventsReceived).bytes - sumTally(before[i + 1].eventsReceived).bytes,
            handlerCalls: after[i + 1].externalCacheChanges.count - before[i + 1].externalCacheChanges.count,
            rebuilds: after[i + 1].rebuilds.count - before[i + 1].rebuilds.count,
            handlerMs: Math.round(after[i + 1].externalCacheChanges.totalMs - before[i + 1].externalCacheChanges.totalMs),
        }));
        const row = { label, actMs, peersConvergedMs: converged, sourceSlotSets: srcW.slotSets - srcB.slotSets, sourceSlotBytes: srcW.slotBytes - srcB.slotBytes, peers: peerRows };
        console.log(`[burst] ${label}:`, JSON.stringify(row));
        return row;
    };
    let ids: string[] = [];
    const peersSee = async (want: number) => {
        const views = await Promise.all(peers.map(p => p.Call<{ engine: string[]; db: string[] }>('note-ids', { marker })));
        return views.every(v => v.engine.length === want);
    };
    const saves = await measure('saves', async () => { const r = await src.Call<{ ids: string[]; ms: number }>('save-notes', { count: BURST, marker, mode: BURST_MODE }, 600000); ids = r.ids; return r.ms; }, () => peersSee(BURST));
    const deletes = await measure('deletes', async () => (await src.Call<{ ms: number }>('delete-notes', { ids: ids.join(','), mode: BURST_MODE }, 600000)).ms, () => peersSee(0));
    phases.burst = { count: BURST, mode: BURST_MODE, saves, deletes };
}

/**
 * Plan 3.1 gate: a raw SQL change (no event, no cache clear) reaches every replica within the
 * sweep interval, and on a shared cache one replica does the reload.
 *
 * **Precondition since §26: `MJ: AI Models` must carry `TrustServerCacheCompletely = 0` in the
 * database BEFORE the replicas boot.** The sweep now visits only entities that declare their rows
 * can change without firing an event, which is exactly what this phase does by raw SQL. Without the
 * declaration the sweep correctly ignores the entity, `recoveredMs` comes back null, and the phase
 * reads like a regression when it is the gate working as designed. The replicas read the flag from
 * metadata at boot, so setting it after they start has no effect:
 *
 *     UPDATE __mj.Entity SET TrustServerCacheCompletely = 0 WHERE Name = 'MJ: AI Models'
 */
async function phaseSweep(reps: Replica[]): Promise<void> {
    console.log(`\n[sweep] engine sweep every ${SWEEP_MS} ms …`);
    console.log('[sweep] precondition: MJ: AI Models must have TrustServerCacheCompletely = 0 (see §26); a null recoveredMs with 0 sweeps usually means it does not.');
    const model = await reps[0].Call<{ id: string; description: string | null }>('pick-model');
    await Promise.all(reps.map(x => x.Call('start-sweeper', { intervalMs: SWEEP_MS })));
    const trial = async (value: string | null) => {
        await Promise.all(reps.map(x => x.Call('quiesce', { idleMs: 1000, maxMs: 30000 })));
        const before = await Promise.all(reps.map(x => x.Call<Counters>('counters')));
        await reps[0].Call('raw-update-model', { id: model.id, description: value ?? 'null' });
        const recoveredMs = await waitForAll(reps, model.id, value, SWEEP_MS * 3 + 5000);
        await Promise.all(reps.map(x => x.Call('quiesce', { idleMs: 1500, maxMs: 30000 })));
        const after = await Promise.all(reps.map(x => x.Call<Counters>('counters')));
        const perReplica = reps.map((x, i) => ({
            replica: x.Name,
            sweeps: after[i].sweeps.count - before[i].sweeps.count,
            reloads: after[i].sweeps.reloads - before[i].sweeps.reloads,
            dbCalls: after[i].dbCalls.executeSQL - before[i].dbCalls.executeSQL,
            payloadsApplied: after[i].externalCacheChanges.count - before[i].externalCacheChanges.count,
        }));
        const row = { wrote: value, recoveredMs, withinInterval: recoveredMs !== null && recoveredMs <= SWEEP_MS + 1000, perReplica };
        console.log('[sweep]', JSON.stringify(row));
        return row;
    };
    try {
        const change = await trial(`${PREFIX}-swept`);
        const restore = await trial(model.description);
        phases.sweep = { intervalMs: SWEEP_MS, change, restore };
    } finally {
        await Promise.all(reps.map(x => x.Call('stop-sweeper')));
    }
}

async function phaseRace(reps: Replica[], r: Redis): Promise<void> {
    if (reps.length < 2) { console.log('[race] needs ≥ 2 replicas, skipped'); return; }
    console.log(`\n[race] ${TRIALS} rounds of simultaneous saves on ${reps[0].Name} and ${reps[1].Name} …`);
    const marker = `${PREFIX}-race`;
    const created: Array<{ rep: Replica; id: string }> = [];
    const rounds: Array<Record<string, unknown>> = [];
    try {
        for (let t = 0; t < TRIALS; t++) {
            const saved = await Promise.all([reps[0], reps[1]].map(x => x.Call<{ id: string }>('save-note', { marker: `${marker}-${t}-${x.Name}` })));
            saved.forEach((sv, i) => created.push({ rep: reps[i], id: sv.id }));
            await Promise.all(reps.map(x => x.Call('quiesce', { idleMs: 2000, maxMs: 30000 })));
            const views = await Promise.all(reps.map(x => x.Call<{ engine: string[]; db: string[] }>('note-ids', { marker })));
            const db = views[0].db;
            const slot = await slotNoteIds(r, marker);
            const engineMismatch = reps.map((x, i) => ({ replica: x.Name, missing: db.filter(id => !views[i].engine.includes(id)).length, extra: views[i].engine.filter(id => !db.includes(id)).length }))
                .filter(m => m.missing || m.extra);
            const slotMismatch = slot === 'absent' ? 'absent' : { missing: db.filter(id => !slot.includes(id)).length, extra: slot.filter(id => !db.includes(id)).length };
            rounds.push({ round: t, dbCount: db.length, engineMismatch, slotMismatch });
        }
        const bad = rounds.filter(x => (x.engineMismatch as unknown[]).length > 0 || (x.slotMismatch !== 'absent' && ((x.slotMismatch as { missing: number; extra: number }).missing || (x.slotMismatch as { missing: number; extra: number }).extra)));
        console.log(`[race] rounds with a disagreement: ${bad.length}/${rounds.length}`, bad.slice(0, 5));
        phases.race = { rounds, disagreements: bad.length };
    } finally {
        for (const c of created) await c.rep.Call('delete-note', { id: c.id }).catch(() => undefined);
    }
}

async function phaseSnapshot(reps: Replica[], r: Redis): Promise<void> {
    if (reps.length < 2) { console.log('[snapshot] needs ≥ 2 replicas, skipped'); return; }
    console.log('\n[snapshot] …');
    const before = await Promise.all(reps.map(x => x.Call<Counters>('counters')));
    await reps[0].Call('save-metadata-snapshot');
    await Promise.all(reps.map(x => x.Call('quiesce', { idleMs: 1500, maxMs: 30000 })));
    const after = await Promise.all(reps.map(x => x.Call<Counters>('counters')));
    const received = reps.slice(1).map((x, i) => {
        const b = before[i + 1].eventsReceived['default/set'] ?? { count: 0, bytes: 0 };
        const a = after[i + 1].eventsReceived['default/set'] ?? { count: 0, bytes: 0 };
        return { replica: x.Name, events: a.count - b.count, bytes: a.bytes - b.bytes };
    });
    const keys = await scanKeys(r, `${PREFIX}:default:*`);
    const sizes: Record<string, number> = {};
    for (const k of keys) sizes[k.substring(PREFIX.length + 1)] = await r.strlen(k);
    phases.snapshot = { received, keys: sizes };
    console.log('[snapshot] peers received (default/set):', received, '| keys:', sizes);
}

async function phaseExpiry(reps: Replica[], r: Redis): Promise<void> {
    if (reps.length < 2) { console.log('[expiry] needs ≥ 2 replicas, skipped'); return; }
    console.log('\n[expiry] …');
    const result: Record<string, unknown> = {};
    try {
        // (a) The notes engine slot expires while every replica holds the rows in memory.
        const expired = await expireKeys(r, `${PREFIX}:RunViewCache:${NOTES_ENTITY_NAME}|*`);
        const [src, ...observers] = reps;
        await Promise.all(observers.map(o => o.Call('arm-watch')));
        const saved = await src.Call<{ id: string; startedAt: number }>('save-note', { marker: `${PREFIX}-expiry` });
        const seen = await Promise.all(observers.map(o => o.Call<{ seenAt: number | null }>('read-watch', { id: saved.id, timeoutMs: 8000 })));
        const latencies: Record<string, number | null> = {};
        observers.forEach((o, i) => { latencies[o.Name] = seen[i].seenAt === null ? null : seen[i].seenAt! - saved.startedAt; });
        result.saveAfterExpiry = { slotsExpired: expired, latencies };
        console.log(`[expiry] (a) ${expired} notes slot(s) expired, then a save on ${src.Name} → seen by peers after (ms):`, latencies);
        await src.Call('delete-note', { id: saved.id });
        await Promise.all(reps.map(x => x.Call('quiesce', { idleMs: 1500, maxMs: 30000 })));

        // (b) Write-only keys: the index grows with them, and must shrink back once they expire.
        const before = await redisSnapshot(r);
        const reads = await src.Call<{ reads: number; redisSets: number }>('unique-note-reads', { count: 20, marker: `${PREFIX}-u` });
        const grown = await redisSnapshot(r);
        const expiredUnique = await expireKeys(r, `${PREFIX}:RunViewCache:${NOTES_ENTITY_NAME}|Type <> *`);
        const probe = await src.Call<{ id: string }>('save-note', { marker: `${PREFIX}-prune` });   // a save reads (and prunes) the index
        await src.Call('delete-note', { id: probe.id });
        await Promise.all(reps.map(x => x.Call('quiesce', { idleMs: 1500, maxMs: 30000 })));
        const after = await redisSnapshot(r);
        result.indexGrowth = { reads, before, grown, expiredUnique, after };
        console.log(`[expiry] (b) group members before/grown/after-expiry: ${before.groupMembers} / ${grown.groupMembers} / ${after.groupMembers}` +
            ` (runView keys ${before.runViewKeys} / ${grown.runViewKeys} / ${after.runViewKeys}; legacy category set ${after.categorySetMembers})`);
    } finally {
        phases.expiry = result;
    }
}

// ────────────────────────────────────────────────────────────────────────────────────────────
// cli-ops: the real CLI under a reading fleet
// ────────────────────────────────────────────────────────────────────────────────────────────

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const MJ_BIN = path.join(REPO_ROOT, 'packages', 'MJCLI', 'bin', 'run.js');

interface CliRun { args: string; status: number | null; ms: number; cacheLines: string[]; tail: string }

/** Runs `mj <args>` from the repo root with the rig's Redis as REDIS_URL — the automatic cache update ON. */
function runMj(args: string[], redisUrl: string): Promise<CliRun> {
    const env: NodeJS.ProcessEnv = { ...process.env, DB_DATABASE, NODE_ENV: REPLICA_NODE_ENV, REDIS_URL: redisUrl, REDIS_KEY_PREFIX: PREFIX };
    delete env.MJ_SKIP_SHARED_CACHE_CLEAR;
    const started = Date.now();
    return new Promise(resolve => {
        const child = spawn(process.execPath, [MJ_BIN, ...args], { cwd: REPO_ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
        let output = '';
        child.stdout?.on('data', (d: Buffer) => { output += d.toString(); });
        child.stderr?.on('data', (d: Buffer) => { output += d.toString(); });
        child.on('close', (status) => {
            // eslint-disable-next-line no-control-regex
            const plain = output.replace(/\x1b\[[0-9;]*m/g, '');
            writeFileSync(path.join(LOG_DIR, `${PREFIX}-mj-${args[0]}-${started}.log`), plain);
            resolve({
                args: args.join(' '), status, ms: Date.now() - started,
                cacheLines: plain.split('\n').filter(l => /shared cache/i.test(l)).map(l => l.trim()).slice(0, 5),
                tail: plain.trim().split('\n').slice(-3).join(' | ').substring(0, 400),
            });
        });
    });
}

/**
 * A scratch metadata folder holding one record of `entity` (Name + Description), for
 * `mj sync push --dir`. Each call replaces the folder's content with that one record.
 */
function writeSyncFolder(dir: string, entity: string, row: { id: string; name: string }, description: string | null): void {
    const sub = path.join(dir, 'records');
    mkdirSync(sub, { recursive: true });
    writeFileSync(path.join(dir, '.mj-sync.json'), JSON.stringify({ version: '1.0.0', directoryOrder: ['records'] }, null, 2));
    writeFileSync(path.join(sub, '.mj-sync.json'), JSON.stringify({ entity, filePattern: '**/.*.json' }, null, 2));
    const file = path.join(sub, '.rig-record.json');
    let record: Record<string, unknown> = {};
    try {
        const existing = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
        const existingKey = existing.primaryKey as { ID?: string } | undefined;
        if (UUIDsEqual(existingKey?.ID, row.id)) record = existing;
    } catch { /* first write */ }
    record.fields = { Name: row.name, Description: description };
    record.primaryKey = { ID: row.id };
    writeFileSync(file, JSON.stringify(record, null, 2));
}

/** Polls every replica's metadata until the AI Models entity shows `expected`; ms waited, or null. */
async function waitForEntityDescription(reps: Replica[], expected: string | null, timeoutMs: number): Promise<number | null> {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
        const seen = await Promise.all(reps.map(x => x.Call<{ description: string | null }>('entity-description')));
        if (seen.every(v => v.description === expected)) return Date.now() - started;
        await sleep(50);
    }
    return null;
}

interface CliOpPlan {
    label: string;
    args: string[];
    /** The model description every replica must show once the command is done. */
    expect?: { id: string; value: string | null };
    /** The AI Models entity description every replica's metadata must show once the command is done. */
    expectEntityDescription?: { value: string | null };
    /** Writes the sync folder before the command runs. */
    prepare?: () => void;
    midBoot: boolean;
}

function deltaTally(after: Record<string, EventTally>, before: Record<string, EventTally>): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(after)) {
        const d = v.count - (before[k]?.count ?? 0);
        if (d) out[k] = d;
    }
    return out;
}

/** Boots a fresh replica `afterMs` into a command and reports whether it booted and what it holds. */
async function bootMidCommand(afterMs: number, redisUrl: string, index: number): Promise<{ replica: Replica | null; result: Record<string, unknown> }> {
    await sleep(afterMs);
    const replica = (await spawnReplicas(1, index))[0];
    const t0 = Date.now();
    try {
        const boot = await replica.Call<BootResult>('boot', { redisUrl, prefix: PREFIX, ttl: TTL_ARG, boot: BOOT_MODE });
        return { replica, result: { startedAtMs: afterMs, ok: true, bootMs: boot.bootMs, dbCalls: boot.dbCallsDuringBoot } };
    } catch (e) {
        return { replica, result: { startedAtMs: afterMs, ok: false, afterMs: Date.now() - t0, error: (e instanceof Error ? e.message : String(e)).substring(0, 300) } };
    }
}

async function measureCliOp(reps: Replica[], redisUrl: string, plan: CliOpPlan, index: number): Promise<Record<string, unknown>> {
    console.log(`\n[cli-ops] ${plan.label}: mj ${plan.args.join(' ')} …`);
    plan.prepare?.();
    await Promise.all(reps.map(x => x.Call('quiesce', { idleMs: 1500, maxMs: 60000 })));
    const before = await Promise.all(reps.map(x => x.Call<Counters>('counters')));
    await Promise.all(reps.map(x => x.Call('start-readers', { intervalMs: 25 })));
    const t0 = Date.now();
    const mid = plan.midBoot && MID_BOOT_MS > 0 ? bootMidCommand(MID_BOOT_MS, redisUrl, index) : null;
    const cli = await runMj(plan.args, redisUrl);
    let convergedAfterExitMs: number | null = null;
    if (plan.expect) convergedAfterExitMs = await waitForAll(reps, plan.expect.id, plan.expect.value, 30000);
    if (plan.expectEntityDescription) convergedAfterExitMs = await waitForEntityDescription(reps, plan.expectEntityDescription.value, 30000);
    const midBoot = mid ? await mid : null;
    const all = midBoot?.replica ? [...reps, midBoot.replica] : reps;
    await Promise.all(all.map(x => x.Call('quiesce', { idleMs: 2500, maxMs: 180000 })));
    const settledMs = Date.now() - t0;
    const readers = await Promise.all(reps.map(x => x.Call<ReaderStats | null>('stop-readers')));
    const after = await Promise.all(reps.map(x => x.Call<Counters>('counters')));
    const perReplica = reps.map((x, i) => ({
        replica: x.Name,
        eventsIn: deltaTally(after[i].eventsReceived, before[i].eventsReceived),
        engineReloads: after[i].externalCacheChanges.count - before[i].externalCacheChanges.count,
        rebuilds: after[i].rebuilds.count - before[i].rebuilds.count,
        dbCalls: after[i].dbCalls.executeSQL + after[i].dbCalls.executeSQLBatch - before[i].dbCalls.executeSQL - before[i].dbCalls.executeSQLBatch,
        metadataChecks: after[i].metadata.checks - before[i].metadata.checks,
        metadataReloads: after[i].metadata.refreshes - before[i].metadata.refreshes,
        readerRounds: readers[i]?.rounds ?? 0,
        // one uncached read per round; anything above that is a cached read that missed
        readerCacheMisses: after[i].dbCalls.readerCalls - before[i].dbCalls.readerCalls - (readers[i]?.kinds.databaseRunView?.ok ?? 0) - (readers[i]?.kinds.databaseRunView?.failed ?? 0),
        readerFailures: Object.fromEntries(Object.entries(readers[i]?.kinds ?? {}).filter(([, k]) => k.failed > 0 || k.empty > 0)
            .map(([kind, k]) => [kind, { failed: k.failed, empty: k.empty, firstAtMs: k.firstFailureAt, lastAtMs: k.lastFailureAt, errors: k.errors }])),
        readerMaxMs: Object.fromEntries(Object.entries(readers[i]?.kinds ?? {}).map(([kind, k]) => [kind, Math.round(k.maxMs)])),
    }));
    let midBootResult: Record<string, unknown> | null = null;
    if (midBoot?.replica) {
        const censuses = await Promise.all([reps[0], midBoot.replica].map(x => x.Call<Census>('census').catch(() => null)));
        midBootResult = { ...midBoot.result, sameDataAsPeers: !!censuses[0] && !!censuses[1] && censuses[0].fleetHash === censuses[1].fleetHash };
        await midBoot.replica.Call('exit').catch(() => undefined);
        midBoot.replica.Kill();
    }
    const row = { label: plan.label, cli, convergedAfterExitMs, settledMs, midBoot: midBootResult, perReplica };
    console.log(`[cli-ops] ${plan.label}: exit ${cli.status} in ${cli.ms} ms; converged ${convergedAfterExitMs} ms after exit; settled ${settledMs} ms`);
    for (const line of cli.cacheLines) console.log(`[cli-ops]   cli: ${line}`);
    if (midBootResult) console.log('[cli-ops]   mid-command boot:', JSON.stringify(midBootResult));
    console.table(perReplica.map(p => ({ replica: p.replica, events: JSON.stringify(p.eventsIn), engineReloads: p.engineReloads, rebuilds: p.rebuilds, dbCalls: p.dbCalls, mdChecks: p.metadataChecks, mdReloads: p.metadataReloads, rounds: p.readerRounds, misses: p.readerCacheMisses, failures: JSON.stringify(p.readerFailures) })));
    return row;
}

type Row = { id: string; name: string; description: string | null };

function cliOpPlans(model: Row, entityRow: Row, syncDir: string, sqlDir: string): CliOpPlan[] {
    const plans: CliOpPlan[] = [];
    const push = ['sync', 'push', `--dir=${syncDir}`, '--ci'];
    if (CLI_OPS.includes('push')) {
        const changed = `${PREFIX}-pushed`;
        plans.push({ label: 'sync push', args: push, expect: { id: model.id, value: changed }, midBoot: true,
            prepare: () => writeSyncFolder(syncDir, 'MJ: AI Models', model, changed) });
        plans.push({ label: 'sync push (no change)', args: push, expect: { id: model.id, value: changed }, midBoot: false });
        plans.push({ label: 'sync push (restore)', args: push, expect: { id: model.id, value: model.description }, midBoot: false,
            prepare: () => writeSyncFolder(syncDir, 'MJ: AI Models', model, model.description) });
    }
    if (CLI_OPS.includes('push-metadata')) {
        const changed = `${PREFIX}-entity`;
        plans.push({ label: 'sync push, metadata entity changed', args: push, expectEntityDescription: { value: changed }, midBoot: true,
            prepare: () => writeSyncFolder(syncDir, 'MJ: Entities', entityRow, changed) });
        plans.push({ label: 'sync push, metadata entity restored', args: push, expectEntityDescription: { value: entityRow.description }, midBoot: false,
            prepare: () => writeSyncFolder(syncDir, 'MJ: Entities', entityRow, entityRow.description) });
    }
    if (CLI_OPS.includes('migrate')) {
        plans.push({ label: 'migrate', args: ['migrate'], midBoot: true });
    }
    if (CLI_OPS.includes('codegen')) {
        plans.push({ label: 'codegen (database side)', args: ['codegen', '--skipfiles', '--no-ai', '--skip-commands', `--sql-output-dir=${sqlDir}`], midBoot: true });
    }
    return plans;
}

async function phaseCliOps(reps: Replica[], redisUrl: string): Promise<void> {
    const model = await reps[0].Call<Row>('pick-model');
    const entityRow = await reps[0].Call<Row>('entity-description');
    const syncDir = path.join(LOG_DIR, `${PREFIX}-sync`);
    const sqlDir = path.join(LOG_DIR, `${PREFIX}-codegen-sql`);
    mkdirSync(sqlDir, { recursive: true });
    const rows: Array<Record<string, unknown>> = [];
    let index = 100;
    try {
        for (const plan of cliOpPlans(model, entityRow, syncDir, sqlDir)) {
            rows.push(await measureCliOp(reps, redisUrl, plan, index++));
        }
    } finally {
        phases['cli-ops'] = { model: { id: model.id, name: model.name }, entity: entityRow.name, midBootMs: MID_BOOT_MS, rows };
        const now = await readAll(reps, model.id);
        if (Object.values(now).some(v => v !== model.description)) {
            await reps[0].Call('entity-save-model', { id: model.id, description: model.description ?? 'null' });
        }
        const entityNow = await reps[0].Call<Row>('entity-description');
        if (entityNow.description !== entityRow.description) {
            console.error(`[cli-ops] the ${entityRow.name} entity description was left as "${entityNow.description}"; restore it to "${entityRow.description}"`);
        }
    }
}

// ────────────────────────────────────────────────────────────────────────────────────────────
// users: the user cache across processes (plan §15)
// ────────────────────────────────────────────────────────────────────────────────────────────

interface CacheView { found: boolean; isActive: boolean | null; roleCount: number | null }

/** Polls the observers until `predicate` holds for all of them; ms waited, or null on timeout. */
async function waitForObservers(
    observers: Replica[], email: string, predicate: (v: CacheView) => boolean, timeoutMs: number,
): Promise<number | null> {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
        const views = await Promise.all(observers.map(o => o.Call<CacheView>('user-in-cache', { email })));
        if (views.every(predicate)) {
            return Date.now() - started;
        }
        await sleep(100);
    }
    return null;
}

async function usersOn(observers: Replica[], email: string): Promise<CacheView[]> {
    return Promise.all(observers.map(o => o.Call<CacheView>('user-in-cache', { email })));
}

/**
 * Creates a user on one replica and watches the others' user caches. Returns how long each step
 * took to reach every observer (null = never, within the timeout).
 */
async function runUserPropagation(source: Replica, observers: Replica[], label: string): Promise<Record<string, unknown>> {
    const email = `fleet-probe-${Date.now().toString(36)}@example.com`;
    const created = await source.Call<{ id: string; email: string }>('create-user', { email });
    const result: Record<string, unknown> = { label, email, userId: created.id };
    try {
        result.createdSeenAfterMs = await waitForObservers(observers, email, v => v.found, 20000);
        result.afterCreate = await usersOn(observers, email);

        await source.Call('add-user-role', { id: created.id });
        result.roleSeenAfterMs = await waitForObservers(observers, email, v => (v.roleCount ?? 0) > 0, 20000);
        result.afterRole = await usersOn(observers, email);

        await source.Call('set-user-active', { id: created.id, active: 0 });
        result.deactivationSeenAfterMs = await waitForObservers(observers, email, v => v.isActive === false, 20000);
        result.afterDeactivate = await usersOn(observers, email);

        // What a validator that asks authoritatively sees, even on a replica that never heard.
        result.findUserOnObservers = await Promise.all(observers.map(o => o.Call<{ found: boolean; isActive: boolean | null }>('find-user', { email })));
    } finally {
        await source.Call('delete-user', { id: created.id }).catch(() => undefined);
    }
    console.log(`[users] ${label}: created→seen ${result.createdSeenAfterMs} ms, role→seen ${result.roleSeenAfterMs} ms, deactivated→seen ${result.deactivationSeenAfterMs} ms`);
    console.log(`[users] ${label}: authoritative lookup on observers:`, JSON.stringify(result.findUserOnObservers));
    return result;
}

async function phaseUsers(reps: Replica[], redisUrl: string): Promise<void> {
    if (reps.length < 2) { console.log('[users] needs ≥ 2 replicas, skipped'); return; }
    console.log('\n[users] …');
    const [source, ...observers] = reps;
    const shared = await runUserPropagation(source, observers, 'shared cache');

    // Control: two replicas whose caches are NOT shared (a private prefix each), so nothing can
    // propagate. This is what the subscription buys.
    console.log('[users] control: two replicas with unshared caches …');
    const control = await spawnReplicas(2, 200);
    let controlResult: Record<string, unknown> = {};
    try {
        await Promise.all(control.map((r, i) => r.Call('boot', { redisUrl, prefix: `${PREFIX}-control-${i}`, ttl: TTL_ARG, boot: BOOT_MODE })));
        controlResult = await runUserPropagation(control[0], [control[1]], 'unshared caches');
    } finally {
        await Promise.all(control.map(r => r.Call('exit', {}, 5000).catch(() => undefined)));
        control.forEach(r => r.Kill());
    }
    phases.users = { shared, control: controlResult };
}

// ────────────────────────────────────────────────────────────────────────────────────────────
// Main
// ────────────────────────────────────────────────────────────────────────────────────────────

async function main(): Promise<number> {
    console.log(`cache-fleet-baseline: replicas=${REPLICAS} phases=${[...PHASES].join(',')} boot=${BOOT_MODE} stagger=${STAGGER_MS} prefix=${PREFIX} db=${DB_DATABASE}`);
    const redisUrl = await ensureRedis();
    const r = new Redis(redisUrl);
    let reps: Replica[] = [];
    try {
        reps = await spawnReplicas(REPLICAS);
        if (PHASES.has('boot')) await phaseBoot(reps, redisUrl, r);
        else await bootAll(reps, redisUrl);
        if (PHASES.has('latency')) await phaseLatency(reps);
        if (PHASES.has('stale')) await phaseStale(reps, redisUrl, r);
        if (PHASES.has('sweep')) await phaseSweep(reps);
        if (PHASES.has('burst')) await phaseBurst(reps);
        if (PHASES.has('race')) await phaseRace(reps, r);
        if (PHASES.has('snapshot')) await phaseSnapshot(reps, r);
        if (PHASES.has('expiry')) await phaseExpiry(reps, r);
        if (PHASES.has('cli-ops')) await phaseCliOps(reps, redisUrl);
        if (PHASES.has('users')) await phaseUsers(reps, redisUrl);
        report.finishedAt = new Date().toISOString();
        report.redisFinal = await redisSnapshot(r);
        writeFileSync(OUT, JSON.stringify(report, null, 2));
        console.log(`\nreport: ${OUT}\nlogs:   ${LOG_DIR}`);
        return 0;
    } catch (e) {
        console.error('FATAL', e);
        report.error = e instanceof Error ? e.stack : String(e);
        writeFileSync(OUT, JSON.stringify(report, null, 2));
        return 2;
    } finally {
        await Promise.all(reps.map(x => x.Call('exit', {}, 5000).catch(() => undefined)));
        reps.forEach(x => x.Kill());
        const keys = await scanKeys(r, `${PREFIX}:*`);
        if (keys.length) await r.del(...keys);
        await r.quit().catch(() => undefined);
        if (redisServer) redisServer.kill();
    }
}

main().then(code => process.exit(code));
