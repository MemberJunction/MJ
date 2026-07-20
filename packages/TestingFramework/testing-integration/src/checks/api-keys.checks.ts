/**
 * api-keys.checks.ts — the 'api-keys' bundle (AK1–AK3): live integration checks for the API Keys
 * engine against REAL database metadata. Graduated verbatim from
 * integration-test-scripts/api-keys-tests.ts.
 *
 * The PatternMatcher / ScopeEvaluator pure logic already has unit specs; this exercises the engine
 * end-to-end against the actual seeded scopes/applications + a real key with real scope rules:
 *   - AK1: Config() loads the real seeded API Scopes (entity:read, agent:execute, full_access, ...)
 *   - AK2: Config() loads the real seeded API Applications (MJAPI, ...)
 *   - AK3: a real key with an explicit ALLOW rule (entity:read) and an explicit DENY rule
 *          (entity:delete) authorizes/denies correctly through Authorize() — then is cleaned up.
 *
 * Deterministic (no model calls). AK3 self-cleans: it creates + deletes its own key/scope fixtures
 * inside its own try/finally, so the bundle lifecycle only configures the engine (Setup) with a no-op
 * Teardown — there is no shared fixture object on the context.
 */
import { RunView } from '@memberjunction/core';
import { MJAPIKeyEntity, MJAPIKeyScopeEntity, MJAPIKeyUsageLogEntity } from '@memberjunction/core-entities';
import { GetAPIKeyEngine } from '@memberjunction/api-keys';
import { Assert, AssertEqual } from '../test-runner';
import { IntegrationCheckRegistry } from '../check-registry';
import { NamedCheck, IntegrationCheckContext } from '../check';

const TEST_LABEL = 'mj-integration-test-key (safe to delete)';

export const ApiKeysChecks: NamedCheck[] = [
    {
        Id: 'api-keys.AK1',
        Name: 'AK1: Config() loads the real seeded API Scopes from the database',
        Fn: async (ctx: IntegrationCheckContext) => {
            const engine = GetAPIKeyEngine();
            const paths = new Set(engine.Scopes.map((s) => s.FullPath));
            for (const expected of ['full_access', 'entity:read', 'entity:delete', 'agent:execute']) {
                Assert(paths.has(expected), `seeded scope '${expected}' not loaded (got ${engine.Scopes.length} scopes)`);
            }
            console.log(`      → ${engine.Scopes.length} scopes loaded (full_access, entity:*, agent:* present)`);
        }
    },
    {
        Id: 'api-keys.AK2',
        Name: 'AK2: Config() loads the real seeded API Applications',
        Fn: async (ctx: IntegrationCheckContext) => {
            const engine = GetAPIKeyEngine();
            const apps = new Set(engine.Applications.map((a) => a.Name));
            Assert(apps.has('MJAPI'), `seeded application 'MJAPI' not loaded (got: ${[...apps].join(', ')})`);
            console.log(`      → ${engine.Applications.length} applications loaded (${[...apps].join(', ')})`);
        }
    },
    {
        Id: 'api-keys.AK3',
        Name: 'AK3: a real key authorizes an explicitly-granted scope and denies an explicitly-denied one',
        Fn: async (ctx: IntegrationCheckContext) => {
            const engine = GetAPIKeyEngine();
            const md = ctx.Provider;
            const readScope = engine.Scopes.find((s) => s.FullPath === 'entity:read');
            const deleteScope = engine.Scopes.find((s) => s.FullPath === 'entity:delete');
            Assert(!!readScope && !!deleteScope, 'entity:read / entity:delete scopes not found in seeded metadata');

            // --- create a real key + two explicit scope rules (allow read, deny delete) ---
            const created = await engine.CreateAPIKey({ UserId: ctx.User.ID, Label: TEST_LABEL }, ctx.User);
            Assert(created.Success && !!created.RawKey && !!created.APIKeyId, `CreateAPIKey failed: ${created.Error}`);
            const hash = engine.HashAPIKey(created.RawKey!);
            const cleanup: Array<() => Promise<unknown>> = [];

            try {
                for (const [scope, isDeny] of [[readScope!, false], [deleteScope!, true]] as const) {
                    const rule = await md.GetEntityObject<MJAPIKeyScopeEntity>('MJ: API Key Scopes', ctx.User);
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
                await engine.Config(true, ctx.User); // reload so the new key + rules are in cache

                const allow = await engine.Authorize(hash, 'MJAPI', 'entity:read', 'Users', ctx.User);
                Assert(allow.Allowed, `entity:read should be allowed: ${allow.Reason}`);

                const deny = await engine.Authorize(hash, 'MJAPI', 'entity:delete', 'Users', ctx.User);
                AssertEqual(deny.Allowed, false, `entity:delete should be denied (explicit deny rule): ${deny.Reason}`);

                console.log(`      → key ${created.APIKeyId}: entity:read ALLOWED, entity:delete DENIED (real rules)`);
            } finally {
                for (const del of cleanup.reverse()) {
                    await del().catch(() => undefined);
                }
                // Authorize() writes audit rows to API Key Usage Logs (FK on APIKeyID) — remove them before the key.
                const logs = await new RunView().RunView<MJAPIKeyUsageLogEntity>(
                    { EntityName: 'MJ: API Key Usage Logs', ExtraFilter: `APIKeyID='${created.APIKeyId}'`, ResultType: 'entity_object' }, ctx.User,
                );
                for (const log of logs.Results ?? []) {
                    await log.Delete().catch(() => undefined);
                }
                const key = await md.GetEntityObject<MJAPIKeyEntity>('MJ: API Keys', ctx.User);
                if (await key.Load(created.APIKeyId!)) {
                    await key.Delete().catch(() => undefined);
                }
            }
        }
    }
];

for (const check of ApiKeysChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}

IntegrationCheckRegistry.Instance.RegisterLifecycle('api-keys', {
    Setup: async (ctx: IntegrationCheckContext) => {
        // Configure the engine once so AK1/AK2 read the loaded scopes/apps.
        await GetAPIKeyEngine().Config(true, ctx.User);
    },
    Teardown: async () => {
        // No-op: AK3 self-cleans its own key/scope/log fixtures.
    }
});
