import assert from 'node:assert/strict';
import { afterEach, test } from 'vitest';
import type { MJCompanyIntegrationEntity } from '@memberjunction/core-entities';
import { IntegrationEngineBase } from '@memberjunction/integration-engine-base';
import { BuildCatalogWriter, ResolveCatalogSource } from '../CatalogSource.js';

const ENV = 'MJ_INTEGRATION_CATALOG_SOURCE';

function connection(configuration: string | null, id = 'ci-1'): MJCompanyIntegrationEntity {
    return { ID: id, IntegrationID: 'int-1', Name: 'Test', Configuration: configuration } as unknown as MJCompanyIntegrationEntity;
}

afterEach(() => { delete process.env[ENV]; });

test('the default is Shared, so the tables can exist long before anything reads them', () => {
    assert.equal(ResolveCatalogSource(connection(null)), 'Shared');
    assert.equal(ResolveCatalogSource(connection('{}')), 'Shared');
});

test('a connection opts in through its own Configuration', () => {
    assert.equal(ResolveCatalogSource(connection('{"catalogSource":"perConnection"}')), 'PerConnection');
    assert.equal(ResolveCatalogSource(connection('{"catalogSource":"per-connection"}')), 'PerConnection');
    assert.equal(ResolveCatalogSource(connection('{"catalogSource":"PERCONNECTION"}')), 'PerConnection');
    assert.equal(ResolveCatalogSource(connection('{"catalogSource":"shared"}')), 'Shared');
});

test('the environment override wins in BOTH directions — it is the rollback lever', () => {
    // Rollback has to work without reaching a connection's Configuration through a workspace that
    // may be the thing that is broken.
    process.env[ENV] = 'shared';
    assert.equal(ResolveCatalogSource(connection('{"catalogSource":"perConnection"}')), 'Shared');
    process.env[ENV] = 'perConnection';
    assert.equal(ResolveCatalogSource(connection('{"catalogSource":"shared"}')), 'PerConnection');
});

test('an unparseable Configuration is no opinion, not an error', () => {
    // That column carries a dozen unrelated settings. One bad character in any of them must not be
    // able to flip which catalog a connection uses.
    assert.equal(ResolveCatalogSource(connection('{not json')), 'Shared');
    assert.equal(ResolveCatalogSource(connection('{"catalogSource":42}')), 'Shared');
    assert.equal(ResolveCatalogSource(connection('{"catalogSource":"nonsense"}')), 'Shared');
});

test('a garbage env value is ignored rather than treated as opt-in', () => {
    process.env[ENV] = 'yes-please';
    assert.equal(ResolveCatalogSource(connection('{"catalogSource":"shared"}')), 'Shared');
});

/** Stub the two engine reads BuildCatalogWriter consults, and restore afterwards. */
function withEngine<T>(hasCatalog: boolean, mapCount: number, fn: () => T): T {
    const engine = IntegrationEngineBase.Instance as unknown as Record<string, unknown>;
    const savedHas = engine.HasCompanyIntegrationCatalog;
    const savedMaps = engine.GetEntityMapsForCompanyIntegration;
    engine.HasCompanyIntegrationCatalog = () => hasCatalog;
    engine.GetEntityMapsForCompanyIntegration = () => new Array(mapCount).fill({});
    try { return fn(); }
    finally {
        engine.HasCompanyIntegrationCatalog = savedHas;
        engine.GetEntityMapsForCompanyIntegration = savedMaps;
    }
}

const md = { GetEntityObject: async () => null } as never;
const user = {} as never;

test('Shared never consults the engine and never refuses', () => {
    withEngine(false, 99, () => {
        const w = BuildCatalogWriter(md, connection(null), user);
        assert.equal(w.Source, 'Shared');
    });
});

test('per-connection with entity maps but no catalog REFUSES — it has not been backfilled', () => {
    // The failure this prevents is the quiet one: reading the shared catalog would carry objects
    // this connection never discovered, omit the ones only it has, sync the wrong set, and report
    // success.
    withEngine(false, 3, () => {
        assert.throws(
            () => BuildCatalogWriter(md, connection('{"catalogSource":"perConnection"}'), user),
            (e: Error) => /PER_CONNECTION_CATALOG_MISSING/.test(e.message)
                       && /3 entity map/.test(e.message)
                       && /ci-1/.test(e.message)
                       && /backfill/i.test(e.message),
            'the refusal must name the connection, what it found, and the way out',
        );
    });
});

test('per-connection with NO maps and no catalog is allowed — that is pre-discovery', () => {
    // Refusing here would reject every brand-new connector on the very flag meant to be safe.
    withEngine(false, 0, () => {
        const w = BuildCatalogWriter(md, connection('{"catalogSource":"perConnection"}'), user);
        assert.equal(w.Source, 'PerConnection');
    });
});

test('per-connection with a populated catalog is allowed', () => {
    withEngine(true, 12, () => {
        const w = BuildCatalogWriter(md, connection('{"catalogSource":"perConnection"}'), user);
        assert.equal(w.Source, 'PerConnection');
    });
});

test('an explicit source argument bypasses the flag but keeps the safety check', () => {
    withEngine(false, 5, () => {
        assert.throws(() => BuildCatalogWriter(md, connection(null), user, 'PerConnection'),
                      /PER_CONNECTION_CATALOG_MISSING/);
    });
});
