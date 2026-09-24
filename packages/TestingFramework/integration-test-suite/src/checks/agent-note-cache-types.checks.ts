/**
 * agent-note-cache-types.checks.ts — the 'agent-note-cache-types' bundle (NC1–NC3).
 *
 * DETERMINISTIC tier (no model calls). Pins the invariant behind the agent-context date-sort crash:
 * a `BaseEngine` property configured as `entity_object` must hold real `BaseEntity` instances after
 * a cross-server cache-change event, NOT the plain JSON objects the event payload carries.
 *
 * WHY THIS TIER. The unit suite (baseEngine.externalCacheChange.test.ts) can prove the rows come back
 * as entities, but it CANNOT prove `__mj_CreatedAt` is a `Date`: that coercion lives in
 * `BaseEntity.Get()`'s TSType handling and needs real `EntityInfo` field metadata, which the unit
 * layer's duck-typed mocks deliberately don't build. Asserting it there would require a mock that
 * fakes the very thing under test. Here the engine, the metadata, the provider and the generated
 * entity classes are all real, so the assertion means something.
 *
 * WHAT IT SIMULATES. `OnExternalCacheChange` is normally invoked by `LocalCacheManager.DispatchCacheChange`
 * when Redis pub/sub delivers another server's write. Rather than reconstruct the RunView fingerprint
 * (LocalCacheManager's own concern, covered by its tests), these checks call the handler directly with a
 * synthetic payload — recipe B from the issue write-up. The transport is stubbed; everything the defect
 * lived in is real.
 *
 * ANTI-VACUITY. NC1 asserts the payload rows really are plain objects with STRING dates before firing,
 * so a passing run can't be explained by the fixture already holding Dates.
 *
 * WRITE AT THE BASE, READ AT THE FACADE. `_agentNotes` lives on `AIEngineBase`; `AIEngine` merely
 * delegates its `AgentNotes` getter down to it. So the event is fired at `AIEngineBase.Instance` (the
 * engine that owns the property) while every assertion reads `AIEngine.Instance.AgentNotes` — the same
 * public getter `AgentContextInjector` uses. That split is deliberate: it proves the invariant holds
 * on the surface consumers actually touch, not merely on the internal array.
 *
 * ISOLATION. These checks deliberately poison a process-wide singleton's cache. Every check restores it
 * via a forced `Config(true)` in a `finally`, and the bundle Teardown forces one more, so a failure
 * mid-check cannot leak a poisoned `AIEngine.Instance.AgentNotes` into later bundles.
 */
import { BaseEntity, BaseEnginePropertyConfig } from '@memberjunction/core';
import { AIEngine } from '@memberjunction/aiengine';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import { Assert, AssertEqual } from '@memberjunction/testing-integration';
import { IntegrationCheckRegistry } from '@memberjunction/testing-integration';
import { NamedCheck, IntegrationCheckContext } from '@memberjunction/testing-integration';

/** The engine property whose poisoning produced the observed agent crash. */
const NOTES_PROPERTY = '_agentNotes';

/** Rows shaped like `MJ: AI Agent Notes` as a serialized cache payload holds them — dates are STRINGS. */
const PAYLOAD_ROWS: Array<Record<string, unknown>> = [
    {
        ID: '11111111-1111-4111-8111-111111111111',
        AgentID: null,
        Note: 'IT cache-type probe (older)',
        Type: 'Preference',
        Status: 'Active',
        UserID: null,
        CompanyID: null,
        __mj_CreatedAt: '2026-08-01T00:00:00.000Z',
        __mj_UpdatedAt: '2026-08-01T00:00:00.000Z',
    },
    {
        ID: '22222222-2222-4222-8222-222222222222',
        AgentID: null,
        Note: 'IT cache-type probe (newer)',
        Type: 'Preference',
        Status: 'Active',
        UserID: null,
        CompanyID: null,
        __mj_CreatedAt: '2026-08-02T00:00:00.000Z',
        __mj_UpdatedAt: '2026-08-02T00:00:00.000Z',
    },
];

type EngineInternals = {
    OnExternalCacheChange(config: BaseEnginePropertyConfig, event: Record<string, unknown>): Promise<void>;
};

/**
 * `_agentNotes` lives on AIEngineBase, not on AIEngine — the latter delegates its AgentNotes getter
 * down to `AIEngineBase.Instance`. The cache-change handler has to be fired at the engine that
 * actually owns the property, or it would write to an object nothing reads.
 */
function notesConfig(): BaseEnginePropertyConfig {
    // `Configs` is a deep copy, which is all we need — the handler only reads PropertyName /
    // EntityName / ResultType off it.
    const config = AIEngineBase.Instance.Configs.find(
        (c: BaseEnginePropertyConfig) => c.PropertyName === NOTES_PROPERTY
    );
    Assert(!!config, `AIEngineBase has no '${NOTES_PROPERTY}' config — the engine's shape changed`);
    return config!;
}

function cacheSetEvent(rows: Array<Record<string, unknown>>): Record<string, unknown> {
    return {
        CacheKey: 'it-agent-note-cache-types',
        Category: 'RunViewCache',
        Action: 'set',
        Timestamp: Date.now(),
        SourceServerId: 'integration-test-foreign-process',
        Data: JSON.stringify({ results: rows, totalRowCount: rows.length }),
    };
}

/** Fires a synthetic external cache-change event at the notes config. */
async function poisonNotesCache(rows: Array<Record<string, unknown>>): Promise<void> {
    const internals = AIEngineBase.Instance as unknown as EngineInternals;
    await internals.OnExternalCacheChange(notesConfig(), cacheSetEvent(rows));
}

/** Fires a raw (unparseable) payload so the fallback-to-reload branch is exercised. */
async function sendMalformedCacheEvent(): Promise<void> {
    const internals = AIEngineBase.Instance as unknown as EngineInternals;
    await internals.OnExternalCacheChange(notesConfig(), {
        CacheKey: 'it-agent-note-cache-types',
        Category: 'RunViewCache',
        Action: 'set',
        Timestamp: Date.now(),
        SourceServerId: 'integration-test-foreign-process',
        Data: 'not json at all',
    });
}

/** Restores the engine to true database state after a check has poisoned it. */
async function restoreEngine(ctx: IntegrationCheckContext): Promise<void> {
    await AIEngineBase.Instance.Config(true, ctx.User);
}

export const AgentNoteCacheTypeChecks: NamedCheck[] = [
    {
        Id: 'agent-note-cache-types.NC1',
        Name: 'NC1: an external cache-change event leaves AgentNotes holding entities whose __mj_CreatedAt is a Date',
        Fn: async (ctx: IntegrationCheckContext) => {
            // Anti-vacuity: the fixture must genuinely carry string dates, or this proves nothing.
            for (const row of PAYLOAD_ROWS) {
                AssertEqual(typeof row.__mj_CreatedAt, 'string', 'payload row carries a STRING __mj_CreatedAt');
            }

            try {
                await poisonNotesCache(PAYLOAD_ROWS);

                const notes = AIEngine.Instance.AgentNotes;
                AssertEqual(notes.length, PAYLOAD_ROWS.length, 'AgentNotes holds exactly the payload rows');

                for (const note of notes) {
                    Assert(
                        note instanceof BaseEntity,
                        `AgentNotes row ${note?.ID} is a BaseEntity (pre-fix it is the raw payload object)`
                    );
                    Assert(
                        note.__mj_CreatedAt instanceof Date,
                        `AgentNotes row ${note.ID} exposes __mj_CreatedAt as a Date, not a ${typeof note.__mj_CreatedAt}`
                    );
                }

                // The values survived the conversion — not merely "some Date".
                const times = notes.map((n) => n.__mj_CreatedAt.getTime()).sort((a, b) => a - b);
                AssertEqual(times[0], Date.parse('2026-08-01T00:00:00.000Z'), 'older note kept its timestamp');
                AssertEqual(times[1], Date.parse('2026-08-02T00:00:00.000Z'), 'newer note kept its timestamp');

                console.log(`      → ${notes.length} cache-event rows materialized as entities with Date __mj_CreatedAt`);
            } finally {
                await restoreEngine(ctx);
            }
        }
    },
    {
        Id: 'agent-note-cache-types.NC2',
        Name: 'NC2: sorting the post-cache-event AgentNotes by __mj_CreatedAt does not throw',
        Fn: async (ctx: IntegrationCheckContext) => {
            try {
                await poisonNotesCache(PAYLOAD_ROWS);

                // The exact expression that died in production: `.getTime()` with no type guard.
                // Post-fix it is safe because the rows are entities whose getter coerces.
                const sorted = [...AIEngine.Instance.AgentNotes].sort(
                    (a, b) => b.__mj_CreatedAt.getTime() - a.__mj_CreatedAt.getTime()
                );

                AssertEqual(sorted[0].Note, 'IT cache-type probe (newer)', 'newest-first ordering');
                console.log('      → unguarded .getTime() sort over post-event AgentNotes is safe');
            } finally {
                await restoreEngine(ctx);
            }
        }
    },
    {
        Id: 'agent-note-cache-types.NC3',
        Name: 'NC3: a malformed cache payload degrades to a database reload rather than poisoning the array',
        Fn: async (ctx: IntegrationCheckContext) => {
            try {
                await sendMalformedCacheEvent();

                // Whatever the database holds, every row must still be a real entity.
                for (const note of AIEngine.Instance.AgentNotes) {
                    Assert(note instanceof BaseEntity, 'reload path yields BaseEntity rows');
                }
                console.log(`      → malformed payload reloaded ${AIEngine.Instance.AgentNotes.length} rows from the database`);
            } finally {
                await restoreEngine(ctx);
            }
        }
    }
];

for (const check of AgentNoteCacheTypeChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}

IntegrationCheckRegistry.Instance.RegisterLifecycle('agent-note-cache-types', {
    Setup: async (ctx: IntegrationCheckContext) => {
        await AIEngine.Instance.Config(false, ctx.User);
    },
    Teardown: async (ctx: IntegrationCheckContext) => {
        // Belt and braces: the checks restore in their own `finally`, but this bundle mutates a
        // process-wide singleton, so a hard failure must not leave a poisoned cache behind.
        await restoreEngine(ctx);
    }
});
