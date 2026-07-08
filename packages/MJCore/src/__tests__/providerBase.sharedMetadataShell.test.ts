/**
 * Tests for the shared-metadata-shell fast path in ProviderBase.Config()
 * (CopyMetadataFromGlobalProvider), which lets a provider configured with
 * `ignoreExistingMetadata: false` reuse the already-loaded global provider's
 * metadata instead of re-fetching it.
 *
 * Contract under test (MemberJunction/MJ#3083): the reusing provider must hold
 * the global provider's metadata arrays BY REFERENCE (the graph is immutable
 * post-Config, so a deep clone is pure waste — ~1s of synchronous constructor
 * work per provider, twice per GraphQL request on the server), while keeping
 * its OWN CurrentUser slot so per-request user state never leaks between
 * providers (the RLS fallback `contextUser ?? this.CurrentUser` must behave
 * exactly as before).
 */

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { Metadata } from '../generic/metadata';
import { AllMetadata, IMetadataProvider, ProviderConfigDataBase } from '../generic/interfaces';
import { AllMetadataArrays } from '../generic/providerBase';
import { UserInfo } from '../generic/securityInfo';
import { TestMetadataProvider } from './mocks/TestMetadataProvider';

/** Config that loads fresh metadata (the global provider's own load). */
function freshConfig(): ProviderConfigDataBase {
    return new ProviderConfigDataBase({}, '__mj', [], [], true);
}

/** Config that opts into reusing the global provider's metadata (the server per-request path). */
function reuseGlobalConfig(): ProviderConfigDataBase {
    return new ProviderConfigDataBase({}, '__mj', [], [], false);
}

describe('ProviderBase shared metadata shell (reuse-global fast path)', () => {
    let previousGlobalProvider: IMetadataProvider;
    let globalProvider: TestMetadataProvider;

    beforeEach(async () => {
        previousGlobalProvider = Metadata.Provider;
        globalProvider = new TestMetadataProvider();
        await globalProvider.Config(freshConfig());
        Metadata.Provider = globalProvider;
    });

    afterEach(() => {
        Metadata.Provider = previousGlobalProvider;
    });

    test('a provider reusing global metadata shares the entity array by reference (no deep clone)', async () => {
        const perRequestProvider = new TestMetadataProvider();
        const result = await perRequestProvider.Config(reuseGlobalConfig());

        expect(result).toBe(true);
        expect(perRequestProvider.Entities.length).toBeGreaterThan(0);
        // The whole point of #3083: same array instance, same EntityInfo instances —
        // not a re-instantiated copy of the 617-entity graph.
        expect(perRequestProvider.Entities).toBe(globalProvider.Entities);
        expect(perRequestProvider.Entities[0]).toBe(globalProvider.Entities[0]);
    });

    test('every metadata collection is shared — a newly added collection cannot silently regress', async () => {
        const perRequestProvider = new TestMetadataProvider();
        await perRequestProvider.Config(reuseGlobalConfig());

        const shell = perRequestProvider.AllMetadata as unknown as Record<string, unknown>;
        const source = globalProvider.AllMetadata as unknown as Record<string, unknown>;
        for (const m of AllMetadataArrays) {
            expect(source[m.key], `global provider is missing ${m.key}`).toBeDefined();
            expect(shell[m.key], `shell must share ${m.key} by reference`).toBe(source[m.key]);
        }
        // AllMetadataArrays must cover every array collection on AllMetadata — if a new
        // collection is added to the class but not the registry, the shell would hold an
        // empty default while the global holds data.
        const template = new AllMetadata() as unknown as Record<string, unknown>;
        const arrayKeysOnAllMetadata = Object.keys(template).filter((k) => Array.isArray(template[k]));
        const registryKeys = new Set(AllMetadataArrays.map((m) => m.key));
        for (const key of arrayKeysOnAllMetadata) {
            expect(registryKeys.has(key), `AllMetadata.${key} is not in AllMetadataArrays — shell would not share it`).toBe(true);
        }
    });

    test('CurrentUser stays per-instance — never shared through the shell in either direction', async () => {
        // The global provider's full load resolved a real CurrentUser.
        expect(globalProvider.CurrentUser).toBeTruthy();

        const perRequestProvider = new TestMetadataProvider();
        await perRequestProvider.Config(reuseGlobalConfig());

        // The reusing provider must NOT inherit the global's user (server per-request
        // providers rely on this staying null so the RLS fallback
        // `contextUser ?? this.CurrentUser` behaves identically to before).
        expect(perRequestProvider.CurrentUser).toBeNull();

        // And writing a user into one graph must not leak into the other.
        const impersonated = new UserInfo();
        impersonated.ID = 'other-user';
        impersonated.Name = 'Other User';
        perRequestProvider.AllMetadata.CurrentUser = impersonated;
        expect(globalProvider.CurrentUser).not.toBe(impersonated);
        expect(perRequestProvider.CurrentUser).toBe(impersonated);
    });

    test('EntityByName/EntityByID resolve on a reusing provider and return the shared EntityInfo instances', async () => {
        const perRequestProvider = new TestMetadataProvider();
        await perRequestProvider.Config(reuseGlobalConfig());

        const source = globalProvider.Entities[0];
        expect(perRequestProvider.EntityByName(source.Name)).toBe(source);
        expect(perRequestProvider.EntityByName(`  ${source.Name.toUpperCase()}  `)).toBe(source);
        expect(perRequestProvider.EntityByID(source.ID)).toBe(source);

        // Pins the perf half of the contract: lookups must be served by the rebuilt
        // maps, not the linear-scan fallback (pre-#3083, reuse-path providers never
        // built their maps and every EntityByName was an O(n) find).
        expect((perRequestProvider as unknown as { _entityMapByName: Map<string, unknown> })._entityMapByName.size).toBeGreaterThan(0);
    });

    test('a global metadata refresh does not disturb an existing shell; new shells adopt the refreshed graph', async () => {
        const inFlightProvider = new TestMetadataProvider();
        await inFlightProvider.Config(reuseGlobalConfig());
        const snapshotEntities = inFlightProvider.Entities;

        // Global provider refreshes (whole-object swap — how all metadata refreshes work).
        globalProvider.setMockMetadata({
            Entities: [
                {
                    ID: 'refreshed-entity',
                    Name: 'Refreshed Entity',
                    SchemaName: 'dbo',
                    BaseView: 'vwRefreshed',
                    BaseTable: 'Refreshed',
                    EntityFields: [{ ID: 'rf1', EntityID: 'refreshed-entity', Name: 'ID', Type: 'uniqueidentifier', IsPrimaryKey: true, Sequence: 1 }],
                },
            ],
            EntityFields: [{ ID: 'rf1', EntityID: 'refreshed-entity', Name: 'ID', Type: 'uniqueidentifier', IsPrimaryKey: true, Sequence: 1 }],
        });
        await globalProvider.Refresh();
        expect(globalProvider.Entities[0].Name).toBe('Refreshed Entity');

        // The in-flight shell keeps serving its consistent snapshot (identical to the
        // deep-clone era — a mid-request refresh never mutates what a request holds).
        expect(inFlightProvider.Entities).toBe(snapshotEntities);
        expect(inFlightProvider.Entities[0].Name).not.toBe('Refreshed Entity');

        // A provider configured after the refresh shares the NEW graph.
        const nextRequestProvider = new TestMetadataProvider();
        await nextRequestProvider.Config(reuseGlobalConfig());
        expect(nextRequestProvider.Entities).toBe(globalProvider.Entities);
        expect(nextRequestProvider.EntityByName('Refreshed Entity')).toBe(globalProvider.Entities[0]);
    });
});
