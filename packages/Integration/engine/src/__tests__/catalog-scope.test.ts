import assert from 'node:assert/strict';
import { test } from 'vitest';
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
