/**
 * cache-payload-materialization-tests.ts — proves, off the real Redis wire, that a
 * cross-server cache-change payload lands in a `BaseEngine` property as real `BaseEntity`
 * instances with real `Date` fields.
 *
 * WHY THIS EXISTS. The unit suite proves the handler's logic and the `agent-note-cache-types`
 * bundle (NC1–NC3) proves the invariant against a real engine + real metadata — but BOTH
 * inject a HAND-AUTHORED event straight into `OnExternalCacheChange`. Everything upstream of
 * that call is assumed: the fingerprint, the serialization, and the payload's actual shape on
 * the wire. If the fixture differs from what a real server publishes, every one of those tests
 * still passes and production still breaks. This rig removes that assumption.
 *
 * WHAT IS REAL HERE. Everything except the second process:
 *   - a real `RedisLocalStorageProvider` (pub/sub on) installed as LocalCacheManager's storage
 *   - a real `AIEngineBase.Config(true)` load, which writes the cache and therefore PUBLISHES
 *   - the real published bytes, captured off the channel by a raw ioredis subscriber
 *   - a real `DispatchCacheChange` → real `OnExternalCacheChange` → real materialization
 *
 * The only simulated part is "a second MJAPI process", and it is simulated at the WIRE: the
 * captured message is re-published byte-for-byte with a foreign `SourceServerId` (the one field
 * `RedisLocalStorageProvider.handlePubSubMessage` uses to reject self-originated events). That is
 * exactly what a peer server's publish looks like to this process. Contrast with
 * `cross-server-invalidation-tests.ts`, which needs two real MJAPI processes — this rig gets the
 * same fidelity for the payload path in ONE process, so it is cheap enough to actually run.
 *
 * THE SMOKING GUN (NW1). NW1 asserts that the rows on the wire carry `__mj_CreatedAt` as a
 * STRING. That assertion holds with OR without the fix — it is not a regression test, it is the
 * EVIDENCE that the defect's precondition exists in genuine production traffic. Every other test
 * in this change is merely *consistent with* the bug being real; this one demonstrates it.
 *
 * ANTI-VACUITY (NW2). Replaying the captured payload unchanged would prove nothing: if the event
 * never landed, the array would still hold the entities `Config(true)` put there and an
 * `instanceof BaseEntity` assertion would pass for the wrong reason. So the replay rewrites the
 * `Note` TEXT to a marker and asserts the marker is present — proving the event actually
 * committed — while leaving every date value exactly as captured. Shape and serialization are
 * untouched; only one string field's value differs.
 *
 * REQUIRES: `REDIS_URL` plus the usual DB_* env. Seeds and deletes two `MJ: AI Agent Notes` rows
 * through `BaseEntity.Save()`/`.Delete()` (never raw DML), so it is a MUTATING rig — not part of
 * the blocking PR gate. Run it deliberately:
 *
 *   REDIS_URL=redis://localhost:6379 npx tsx packages/TestingFramework/integration-test-suite/rigs/cache-payload-materialization-tests.ts
 *
 * Exit contract (harness standard): 0 all passed · 1 failures · 2 bootstrap/connectivity error.
 */
import Redis from 'ioredis';
import { BaseEntity, LocalCacheManager, Metadata } from '@memberjunction/core';
import type { CacheChangedEvent, ILocalStorageProvider, UserInfo } from '@memberjunction/core';
import type { MJAIAgentNoteEntity } from '@memberjunction/core-entities';
import { RedisLocalStorageProvider } from '@memberjunction/redis-provider';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import { AIEngine } from '@memberjunction/aiengine';
// Imported from the package directly, NOT via ./lib/harness — that shim currently re-exports a
// symbol the package no longer provides (`createRunQueryFixtures`), so importing it throws at
// module load. Direct import is also the shim's own documented end-state.
import { TestRunner, Assert, AssertEqual, bootstrapIntegrationServer } from '@memberjunction/testing-integration';

/** Isolated key prefix so this rig can never collide with a real cache on the same Redis. */
const KEY_PREFIX = 'it-cache-payload';
const PUB_SUB_CHANNEL = `${KEY_PREFIX}:__pubsub__`;
/** The entity whose poisoned cache produced the observed agent crash. */
const NOTES_ENTITY = 'MJ: AI Agent Notes';
/** Pub/sub is fire-and-forget — give a published message a window to come back around. */
const SETTLE_MS = 1500;
/** Marks the replayed rows so NW2 can prove the event actually committed. */
const REPLAY_MARKER = 'IT wire-replay marker';

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

/** A cache-change event as it appeared on the Redis channel, with its payload still serialized. */
type CapturedEvent = CacheChangedEvent;

/** The rows a RunView cache payload carries — plain JSON, which is the whole point. */
type PayloadRow = Record<string, unknown>;

/** Parses a captured event's `Data` into the `{ results, totalRowCount }` envelope MJ writes. */
function parsePayloadRows(event: CapturedEvent): PayloadRow[] {
    Assert(!!event.Data, 'captured event carries a Data payload');
    const parsed = JSON.parse(event.Data!) as { results?: PayloadRow[] };
    Assert(Array.isArray(parsed.results), 'payload envelope has a results array');
    return parsed.results!;
}

async function main(): Promise<void> {
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) {
        throw new Error('This rig requires REDIS_URL (e.g. redis://localhost:6379) — it tests the real pub/sub payload path.');
    }

    // In-process server bootstrap: real SQL Server provider, real metadata, real entity classes.
    const ctx = await bootstrapIntegrationServer();
    const user: UserInfo = ctx.User;
    console.log(`  bootstrap: db=${ctx.Db.Database} user=${user.Email}`);

    const md = new Metadata(); // global-provider-ok: rig owns the process (bootstrapIntegrationServer asserts it)
    const seededIds: string[] = [];
    let redisProvider: RedisLocalStorageProvider | undefined;
    let rawSubscriber: Redis | undefined;
    let rawPublisher: Redis | undefined;
    /** The instrumented in-memory storage the bootstrap installed; restored in teardown. */
    const originalStorage: ILocalStorageProvider = ctx.Storage;
    let storageSwapped = false;

    /** Every message seen on the channel, in arrival order. */
    const captured: CapturedEvent[] = [];
    /** The captured publish for the agent-notes cache entry — the payload under test. */
    let notesEvent: CapturedEvent | undefined;

    const runner = new TestRunner('Cache payload materialization (real Redis wire)');

    try {
        // ── Seed ────────────────────────────────────────────────────────────────────────────
        // A real load of an EMPTY table publishes an empty payload, which would make NW1
        // vacuous. Seed through BaseEntity.Save() — never raw DML.
        // NOTE text is deliberately left empty: MJAIAgentNoteEntityServer.Save() generates an
        // embedding whenever Note is non-empty, which needs a configured embedding model and
        // fails in a bare test environment. The rows only have to EXIST and carry real
        // __mj_CreatedAt values — NW2's marker is written into the replayed payload, not the row.
        for (let i = 0; i < 2; i++) {
            const note = await md.GetEntityObject<MJAIAgentNoteEntity>(NOTES_ENTITY, user);
            note.NewRecord();
            note.Type = 'Preference';
            note.Status = 'Active';
            const saved = await note.Save();
            // Record the ID BEFORE asserting: MJAIAgentNoteEntityServer.Save() persists the row
            // and only then syncs the in-memory vector service, returning false if that sync
            // throws. A false return therefore does NOT guarantee the row is absent, and a
            // teardown that trusted the boolean would leak the row.
            if (note.ID) {
                seededIds.push(note.ID);
            }
            Assert(saved, `seed note saved: ${note.LatestResult?.CompleteMessage ?? 'unknown error'}`);
        }
        console.log(`  seeded ${seededIds.length} agent notes`);

        // ── Wire up the real Redis transport, exactly as MJServer/src/index.ts does ──────────
        redisProvider = new RedisLocalStorageProvider({
            url: redisUrl,
            keyPrefix: KEY_PREFIX,
            enablePubSub: true,
            enableLogging: false,
        });
        await redisProvider.StartListening();

        // The MJAPI wiring under test: received pub/sub events are dispatched into the cache
        // manager, which routes them to whichever engine registered that fingerprint.
        redisProvider.OnCacheChanged((event) => LocalCacheManager.Instance.DispatchCacheChange(event));

        // Independent raw clients: one captures what gets published, one replays it back.
        rawSubscriber = new Redis(redisUrl);
        rawPublisher = new Redis(redisUrl);
        await rawSubscriber.subscribe(PUB_SUB_CHANNEL);
        rawSubscriber.on('message', (_channel: string, message: string) => {
            try {
                captured.push(JSON.parse(message) as CapturedEvent);
            } catch {
                /* not our shape — ignore */
            }
        });

        // Swap LocalCacheManager onto Redis so cache writes actually hit the wire.
        await LocalCacheManager.Instance.SetStorageProvider(redisProvider);
        storageSwapped = true;
        await sleep(500); // let the subscriber connection settle before we publish

        // ── Produce a REAL publish ──────────────────────────────────────────────────────────
        // A forced engine refresh runs the engine's own RunView through the caching path, so the
        // key it writes under is the same fingerprint it registers its change-callback on. No
        // hand-built cache key anywhere in this rig.
        await AIEngineBase.Instance.Config(true, user);
        await sleep(SETTLE_MS);

        runner.Test('NW1: a real engine refresh publishes agent-note rows whose dates are STRINGS on the wire', async () => {
            notesEvent = captured.find(e => e.Action === 'set' && typeof e.CacheKey === 'string' && e.CacheKey.startsWith(`${NOTES_ENTITY}|`));
            Assert(
                !!notesEvent,
                `no 'set' publish captured for "${NOTES_ENTITY}" — saw ${captured.length} events: ${captured.map(e => e.CacheKey).join(', ')}`
            );

            const rows = parsePayloadRows(notesEvent!);
            Assert(rows.length >= seededIds.length, `payload carries the seeded rows (got ${rows.length})`);

            // THE SMOKING GUN. These are bytes a real MJ server put on a real Redis channel.
            // Pre-fix they were assigned straight into an entity_object array.
            for (const row of rows) {
                AssertEqual(
                    typeof row.__mj_CreatedAt,
                    'string',
                    `wire row ${String(row.ID)} carries __mj_CreatedAt as a STRING (JSON cannot represent a Date)`
                );
            }
            console.log(`      → ${rows.length} rows on the wire, every __mj_CreatedAt a string — the defect's precondition is real`);
        });

        runner.Test('NW2: replaying those exact bytes from a foreign server leaves entities with Date fields', async () => {
            Assert(!!notesEvent, 'NW1 must have captured the notes publish');

            // Rewrite ONLY the Note text, so a landed event is distinguishable from a no-op.
            // Every date value stays exactly as captured.
            const rows = parsePayloadRows(notesEvent!).map(row => ({ ...row, Note: `${REPLAY_MARKER} ${String(row.ID)}` }));
            const replay: CacheChangedEvent = {
                ...notesEvent!,
                SourceServerId: 'it-foreign-process-00000000-0000-4000-b000-000000000001',
                Data: JSON.stringify({ results: rows, totalRowCount: rows.length }),
            };

            await rawPublisher!.publish(PUB_SUB_CHANNEL, JSON.stringify(replay));
            await sleep(SETTLE_MS);

            const notes = AIEngine.Instance.AgentNotes;

            // Anti-vacuity: prove the replayed event actually committed to the engine array.
            const landed = notes.filter(n => typeof n.Note === 'string' && n.Note.startsWith(REPLAY_MARKER));
            AssertEqual(landed.length, rows.length, 'every replayed row landed in AgentNotes (the event was not a no-op)');

            // The invariant the fix restores.
            for (const note of notes) {
                Assert(note instanceof BaseEntity, `AgentNotes row ${note?.ID} is a BaseEntity (pre-fix it is the raw payload object)`);
                Assert(
                    note.__mj_CreatedAt instanceof Date,
                    `AgentNotes row ${note.ID} exposes __mj_CreatedAt as a Date, not a ${typeof note.__mj_CreatedAt}`
                );
            }
            console.log(`      → ${notes.length} wire-delivered rows materialized as entities with Date __mj_CreatedAt`);
        });

        runner.Test('NW3: the unguarded .getTime() sort that crashed in production is safe over wire-delivered rows', async () => {
            // The exact expression from AgentContextInjector before the fix — no type guard.
            const sorted = [...AIEngine.Instance.AgentNotes].sort(
                (a, b) => b.__mj_CreatedAt.getTime() - a.__mj_CreatedAt.getTime()
            );
            Assert(sorted.length > 0, 'there are rows to sort');
            for (let i = 1; i < sorted.length; i++) {
                Assert(
                    sorted[i - 1].__mj_CreatedAt.getTime() >= sorted[i].__mj_CreatedAt.getTime(),
                    'sort produced a coherent newest-first ordering'
                );
            }
            console.log('      → unguarded .getTime() sort over wire-delivered AgentNotes is safe');
        });

        const failed = await runner.Run();
        process.exitCode = failed > 0 ? 1 : 0;
    } finally {
        // ── Teardown, best-effort and in reverse order ──────────────────────────────────────
        try {
            if (storageSwapped) {
                await LocalCacheManager.Instance.SetStorageProvider(originalStorage);
            }
        } catch (err) {
            console.warn(`  teardown: storage restore failed — ${(err as Error).message}`);
        }
        // SetStorageProvider migrates the existing in-memory cache into Redis, so entries land
        // under more than just RunViewCache — clear every category this rig can have populated.
        for (const category of ['RunViewCache', 'Metadata', 'DatasetCache', 'RunQueryCache']) {
            try { await redisProvider?.ClearCategory(category); } catch { /* ignore */ }
        }
        try { await redisProvider?.Disconnect(); } catch { /* ignore */ }
        try { await rawSubscriber?.quit(); } catch { /* ignore */ }
        try { await rawPublisher?.quit(); } catch { /* ignore */ }

        for (const id of seededIds) {
            try {
                const note = await md.GetEntityObject<MJAIAgentNoteEntity>(NOTES_ENTITY, user);
                if (await note.Load(id)) {
                    await note.Delete();
                }
            } catch (err) {
                console.warn(`  teardown: could not delete seeded note ${id} — ${(err as Error).message}`);
            }
        }

        // The engine singleton was deliberately poisoned — restore it to true database state.
        try { await AIEngineBase.Instance.Config(true, ctx.User); } catch { /* ignore */ }
        try { await ctx.ClosePool(); } catch { /* ignore */ }
    }
}

main().catch((err) => {
    console.error(`\nBootstrap/connectivity error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(2);
});
