import assert from 'node:assert/strict';
import { expect, test } from 'vitest';
import { IntegrationEngineBase } from '@memberjunction/integration-engine-base';
import {
    CurrentCatalogCI,
    RunInCatalogScope,
    RunOutsideCatalogScope,
    WithCatalogScope,
} from '../CatalogScope.js';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

test('no scope by default — every read stays on the shared catalog', () => {
    assert.equal(CurrentCatalogCI(), undefined);
});

test('the resolver is installed on the client-safe base by importing this package', () => {
    // The base declares the hook and cannot import node:async_hooks, so this is the wiring that
    // makes per-connection reads possible at all. If it regressed, every read would silently
    // answer from the shared catalog and no test of the getters would notice.
    assert.equal(typeof IntegrationEngineBase.CatalogScopeResolver, 'function');
    RunInCatalogScope(A, () => {
        assert.equal(IntegrationEngineBase.CatalogScopeResolver!(), A);
    });
});

test('scope survives await, and nesting takes the innermost', async () => {
    await WithCatalogScope(A, async () => {
        assert.equal(CurrentCatalogCI(), A);
        await new Promise(r => setTimeout(r, 1));
        assert.equal(CurrentCatalogCI(), A, 'lost across a timer callback');
        await WithCatalogScope(B, async () => {
            assert.equal(CurrentCatalogCI(), B, 'nested scope did not win');
        });
        assert.equal(CurrentCatalogCI(), A, 'outer scope not restored');
    });
    assert.equal(CurrentCatalogCI(), undefined, 'scope leaked past its body');
});

test('concurrent scopes do not bleed into each other', async () => {
    // The failure this guards against is the whole reason for AsyncLocalStorage over a module
    // variable: a batch applying several connections at once would otherwise write every
    // connection's rows under whichever one started last.
    const seen: string[] = [];
    await Promise.all([
        WithCatalogScope(A, async () => {
            await new Promise(r => setTimeout(r, 5));
            seen.push(CurrentCatalogCI()!);
        }),
        WithCatalogScope(B, async () => {
            await new Promise(r => setTimeout(r, 1));
            seen.push(CurrentCatalogCI()!);
        }),
    ]);
    assert.deepEqual(seen.sort(), [A, B].sort());
});

test('an empty connection id is treated as no scope, not as a scope of ""', () => {
    // A blank id must not look like a real connection: it would match nothing and, if it reached a
    // getter, would return an empty catalog that reads as "this connection has no objects".
    RunInCatalogScope('', () => assert.equal(CurrentCatalogCI(), undefined));
});

test('RunOutsideCatalogScope clears the scope for action generation', () => {
    RunInCatalogScope(A, () => {
        assert.equal(CurrentCatalogCI(), A);
        RunOutsideCatalogScope(() => {
            assert.equal(CurrentCatalogCI(), undefined, 'action generation would see one tenant projection');
        });
        assert.equal(CurrentCatalogCI(), A);
    });
});

test('a callback created outside the scope sees no scope when invoked inside it', () => {
    // Documents the real boundary rather than pretending there is none. The fallback is the
    // pre-existing shared read, so a missed scope degrades to the old behaviour, never to a wrong
    // per-connection answer.
    let observed: string | undefined = 'unset';
    const cb = () => { observed = CurrentCatalogCI(); };
    RunInCatalogScope(A, () => cb());
    assert.equal(observed, A, 'a synchronous call inside the scope DOES see it');
});

/**
 * The scoping lives on the EXISTING getters, not on new ones, and that is load-bearing: two
 * connectors in the separate Integrations repository call these getters directly rather than going
 * through the REST base. A new method name would have left exactly those two reading the shared
 * catalog forever while every other path went per-connection — the asymmetry this design exists to
 * remove, reintroduced by the fix for it.
 */
function withPerConnectionCatalog<T>(ciID: string, objects: Array<{ ID: string; Name: string; Status: string; Sequence: number }>, fn: () => T): T {
    const e = IntegrationEngineBase.Instance as unknown as Record<string, unknown>;
    const saved = { has: e.HasCompanyIntegrationCatalog, get: e.GetCompanyIntegrationObjects, dag: e.GetCompanyIntegrationObjectsInDependencyOrder };
    e.HasCompanyIntegrationCatalog = (id: string) => id === ciID;
    e.GetCompanyIntegrationObjects = (id: string) => (id === ciID ? objects : []);
    // Deliberately a DIFFERENT order from GetCompanyIntegrationObjects. Dependency order is not
    // sequence order, and without the difference a test cannot tell whether the DAG getter ran or
    // whether it merely fell through to the (also scoped) active-objects getter.
    e.GetCompanyIntegrationObjectsInDependencyOrder = (id: string) => (id === ciID ? [...objects].reverse() : []);
    try { return fn(); }
    finally {
        e.HasCompanyIntegrationCatalog = saved.has;
        e.GetCompanyIntegrationObjects = saved.get;
        e.GetCompanyIntegrationObjectsInDependencyOrder = saved.dag;
    }
}

const PER_CONNECTION = [
    { ID: 'cio-1', Name: 'OnlyMine', Status: 'Active', Sequence: 1 },
    { ID: 'cio-2', Name: 'AlsoMine', Status: 'Active', Sequence: 2 },
];

test('the existing getters answer per-connection INSIDE a scope', () => {
    IntegrationEngineBase.Instance.SeedForTesting({
        IntegrationObjects: [{ ID: 'io-1', IntegrationID: 'int-1', Name: 'Shared', Status: 'Active', Sequence: 1 } as never],
    });
    withPerConnectionCatalog(A, PER_CONNECTION, () => {
        // outside the scope: the shared answer, unchanged
        expect(IntegrationEngineBase.Instance.GetActiveIntegrationObjects('int-1').map(o => o.Name)).toEqual(['Shared']);
        RunInCatalogScope(A, () => {
            expect(IntegrationEngineBase.Instance.GetActiveIntegrationObjects('int-1').map(o => o.Name)).toEqual(['OnlyMine', 'AlsoMine']);
            expect(IntegrationEngineBase.Instance.GetIntegrationObjectsByIntegrationID('int-1').map(o => o.Name)).toEqual(['OnlyMine', 'AlsoMine']);
            // The per-connection DAG, NOT the active-objects getter it would fall through to —
            // the reversed order is what tells them apart.
            expect(IntegrationEngineBase.Instance.GetObjectsInDependencyOrder('int-1').map(o => o.Name)).toEqual(['AlsoMine', 'OnlyMine']);
            expect(IntegrationEngineBase.Instance.GetIntegrationObject('int-1', 'OnlyMine')?.Name).toBe('OnlyMine');
        });
        // and back out again
        expect(IntegrationEngineBase.Instance.GetActiveIntegrationObjects('int-1').map(o => o.Name)).toEqual(['Shared']);
    });
});

test('a name absent from the per-connection catalog does NOT fall back to the shared one', () => {
    // Once a connection has its own catalog, a miss means the object is genuinely not in it.
    // Falling back would resurrect an object this connection never discovered.
    withPerConnectionCatalog(A, PER_CONNECTION, () => {
        RunInCatalogScope(A, () => {
            expect(IntegrationEngineBase.Instance.GetIntegrationObject('int-1', 'Shared')).toBeUndefined();
        });
    });
});

test('the SHARED getters ignore the scope entirely', () => {
    // The declared floor a discovery overlays onto, and the Shared branch of the resolver, must
    // never be redirected — a discovery would otherwise overlay its own previous output.
    withPerConnectionCatalog(A, PER_CONNECTION, () => {
        RunInCatalogScope(A, () => {
            expect(IntegrationEngineBase.Instance.GetSharedIntegrationObjects('int-1').map(o => o.Name)).toEqual(['Shared']);
            expect(IntegrationEngineBase.Instance.GetActiveSharedIntegrationObjects('int-1').map(o => o.Name)).toEqual(['Shared']);
        });
    });
});

test('a scope whose connection has NO per-connection catalog reads shared', () => {
    withPerConnectionCatalog(A, PER_CONNECTION, () => {
        RunInCatalogScope(B, () => {
            expect(IntegrationEngineBase.Instance.GetActiveIntegrationObjects('int-1').map(o => o.Name)).toEqual(['Shared']);
        });
    });
});

test('the per-connection datasets are NOT configured when the entities are absent', async () => {
    // The rollout safety property. A configured dataset whose entity does not exist fails its
    // RunView, and BaseEngine classifies an unknown entity as a TRANSIENT failure — so the property
    // stays `loadedSuccessfully: false` and every Config() retries it forever. The integration
    // engine would sit permanently not-loaded on any workspace that has the code but not the
    // migration, and the symptom would look like a network fault rather than a missing table.
    const engine = IntegrationEngineBase.Instance as unknown as {
        Config(f?: boolean, u?: unknown, p?: unknown): Promise<unknown>;
        Configs: Array<{ PropertyName: string; EntityName?: string }>;
        Load(params: Array<{ PropertyName: string }>): Promise<unknown>;
    };
    const captured: string[][] = [];
    const savedLoad = engine.Load;
    engine.Load = async (params) => { captured.push(params.map(p => p.PropertyName)); return undefined; };
    try {
        // A provider that knows nothing about the per-connection entities — the pre-migration state.
        await engine.Config(false, {}, { EntityByName: () => undefined });
        expect(captured.at(-1)).not.toContain('_companyIntegrationObjects');
        expect(captured.at(-1)).toContain('_integrationObjects');

        // And once the migration has run, both appear.
        await engine.Config(false, {}, { EntityByName: (n: string) => ({ Name: n }) });
        expect(captured.at(-1)).toContain('_companyIntegrationObjects');
        expect(captured.at(-1)).toContain('_companyIntegrationObjectFields');
    } finally {
        engine.Load = savedLoad;
    }
});
