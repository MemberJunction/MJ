/**
 * api-keys-tests.ts — live integration tests for the API Keys engine against REAL database metadata.
 *
 * The PatternMatcher / ScopeEvaluator pure logic already has unit specs; this exercises the engine
 * end-to-end against the actual seeded scopes/applications + a real key with real scope rules:
 *   - AK1: Config() loads the real seeded API Scopes (entity:read, agent:execute, full_access, ...)
 *   - AK2: Config() loads the real seeded API Applications (MJAPI, ...)
 *   - AK3: a real key with an explicit ALLOW rule (entity:read) and an explicit DENY rule
 *          (entity:delete) authorizes/denies correctly through Authorize() — then is cleaned up.
 *
 * Deterministic (no model calls). Creates + deletes its own key/scope fixtures (try/finally cleanup).
 *
 * USAGE (from the repo root):
 *   npx tsx packages/MJServer/integration-test-scripts/api-keys-tests.ts
 *
 * Exit code: 0 = passed, 1 = failures, 2 = bootstrap error.
 */
import { TestRunner, Assert, AssertEqual } from './lib/harness';
import { bootstrapAI } from './lib/ai-bootstrap';
import { Metadata, RunView } from '@memberjunction/core';
import { MJAPIKeyEntity, MJAPIKeyScopeEntity, MJAPIKeyUsageLogEntity } from '@memberjunction/core-entities';
import { GetAPIKeyEngine } from '@memberjunction/api-keys';

const TEST_LABEL = 'mj-integration-test-key (safe to delete)';

async function main(): Promise<void> {
    const { user } = await bootstrapAI();
    const suite = new TestRunner('API Keys engine live integration (real scopes/apps + end-to-end authorize)');

    const engine = GetAPIKeyEngine();
    await engine.Config(true, user);

    suite.Test('AK1: Config() loads the real seeded API Scopes from the database', async () => {
        const paths = new Set(engine.Scopes.map((s) => s.FullPath));
        for (const expected of ['full_access', 'entity:read', 'entity:delete', 'agent:execute']) {
            Assert(paths.has(expected), `seeded scope '${expected}' not loaded (got ${engine.Scopes.length} scopes)`);
        }
        console.log(`      → ${engine.Scopes.length} scopes loaded (full_access, entity:*, agent:* present)`);
    });

    suite.Test('AK2: Config() loads the real seeded API Applications', async () => {
        const apps = new Set(engine.Applications.map((a) => a.Name));
        Assert(apps.has('MJAPI'), `seeded application 'MJAPI' not loaded (got: ${[...apps].join(', ')})`);
        console.log(`      → ${engine.Applications.length} applications loaded (${[...apps].join(', ')})`);
    });

    suite.Test('AK3: a real key authorizes an explicitly-granted scope and denies an explicitly-denied one', async () => {
        const md = new Metadata();
        const readScope = engine.Scopes.find((s) => s.FullPath === 'entity:read');
        const deleteScope = engine.Scopes.find((s) => s.FullPath === 'entity:delete');
        Assert(!!readScope && !!deleteScope, 'entity:read / entity:delete scopes not found in seeded metadata');

        // --- create a real key + two explicit scope rules (allow read, deny delete) ---
        const created = await engine.CreateAPIKey({ UserId: user.ID, Label: TEST_LABEL }, user);
        Assert(created.Success && !!created.RawKey && !!created.APIKeyId, `CreateAPIKey failed: ${created.Error}`);
        const hash = engine.HashAPIKey(created.RawKey!);
        const cleanup: Array<() => Promise<unknown>> = [];

        try {
            for (const [scope, isDeny] of [[readScope!, false], [deleteScope!, true]] as const) {
                const rule = await md.GetEntityObject<MJAPIKeyScopeEntity>('MJ: API Key Scopes', user);
                rule.NewRecord();
                rule.APIKeyID = created.APIKeyId!;
                rule.ScopeID = scope.ID;
                rule.ResourcePattern = '*';
                rule.PatternType = 'Include';
                rule.IsDeny = isDeny;
                rule.Priority = isDeny ? 10 : 0;
                Assert(await rule.Save(), `saving key scope failed: ${rule.LatestResult?.CompleteMessage}`);
                cleanup.push(() => rule.Delete());
            }
            await engine.Config(true, user); // reload so the new key + rules are in cache

            const allow = await engine.Authorize(hash, 'MJAPI', 'entity:read', 'Users', user);
            Assert(allow.Allowed, `entity:read should be allowed: ${allow.Reason}`);

            const deny = await engine.Authorize(hash, 'MJAPI', 'entity:delete', 'Users', user);
            AssertEqual(deny.Allowed, false, `entity:delete should be denied (explicit deny rule): ${deny.Reason}`);

            console.log(`      → key ${created.APIKeyId}: entity:read ALLOWED, entity:delete DENIED (real rules)`);
        } finally {
            for (const del of cleanup.reverse()) {
                await del().catch(() => undefined);
            }
            // Authorize() writes audit rows to API Key Usage Logs (FK on APIKeyID) — remove them before the key.
            const logs = await new RunView().RunView<MJAPIKeyUsageLogEntity>(
                { EntityName: 'MJ: API Key Usage Logs', ExtraFilter: `APIKeyID='${created.APIKeyId}'`, ResultType: 'entity_object' }, user,
            );
            for (const log of logs.Results ?? []) {
                await log.Delete().catch(() => undefined);
            }
            const key = await md.GetEntityObject<MJAPIKeyEntity>('MJ: API Keys', user);
            if (await key.Load(created.APIKeyId!)) {
                await key.Delete().catch(() => undefined);
            }
        }
    });

    const failures = await suite.Run();
    process.exit(failures > 0 ? 1 : 0);
}

main().catch((error) => {
    console.error('\nBOOTSTRAP / CONNECTIVITY ERROR:', error instanceof Error ? error.message : error);
    process.exit(2);
});
