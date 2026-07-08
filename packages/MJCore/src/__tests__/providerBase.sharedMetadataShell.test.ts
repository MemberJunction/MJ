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

    test('a provider reusing global metadata shares the Info INSTANCES but owns its array containers', async () => {
        const perRequestProvider = new TestMetadataProvider();
        const result = await perRequestProvider.Config(reuseGlobalConfig());

        expect(result).toBe(true);
        expect(perRequestProvider.Entities.length).toBeGreaterThan(0);
        // The whole point of #3083: the same EntityInfo instances — never a
        // re-instantiated copy of the 617-entity graph...
        expect(perRequestProvider.Entities[0]).toBe(globalProvider.Entities[0]);
        // ...but the array CONTAINER is per-instance (shallow copy), so an in-place
        // sort/push/splice by request-scoped code stays request-local instead of
        // reordering the global graph for every other in-flight request.
        expect(perRequestProvider.Entities).not.toBe(globalProvider.Entities);
        expect(perRequestProvider.Entities).toEqual(globalProvider.Entities);
    });

    test('in-place array mutation on a reusing provider cannot corrupt the global graph', async () => {
        const perRequestProvider = new TestMetadataProvider();
        await perRequestProvider.Config(reuseGlobalConfig());

        const globalOrder = [...globalProvider.Entities];
        perRequestProvider.Entities.reverse();
        perRequestProvider.Entities.push(globalProvider.Entities[0]);

        expect(globalProvider.Entities).toEqual(globalOrder);
        expect(globalProvider.Entities.length).toBe(globalOrder.length);
    });

    test('every metadata collection is shared — a newly added collection cannot silently regress', async () => {
        const perRequestProvider = new TestMetadataProvider();
        await perRequestProvider.Config(reuseGlobalConfig());

        const shell = perRequestProvider.AllMetadata as unknown as Record<string, unknown[]>;
        const source = globalProvider.AllMetadata as unknown as Record<string, unknown[]>;
        for (const m of AllMetadataArrays) {
            expect(source[m.key], `global provider is missing ${m.key}`).toBeDefined();
            expect(shell[m.key], `shell must have its own ${m.key} container`).not.toBe(source[m.key]);
            expect(shell[m.key].length, `shell ${m.key} must carry the global's items`).toBe(source[m.key].length);
            for (let i = 0; i < source[m.key].length; i++) {
                expect(shell[m.key][i], `shell ${m.key}[${i}] must be the SAME instance`).toBe(source[m.key][i]);
            }
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

        // A provider configured after the refresh shares the NEW graph's instances.
        const nextRequestProvider = new TestMetadataProvider();
        await nextRequestProvider.Config(reuseGlobalConfig());
        expect(nextRequestProvider.Entities[0]).toBe(globalProvider.Entities[0]);
        expect(nextRequestProvider.EntityByName('Refreshed Entity')).toBe(globalProvider.Entities[0]);
    });

    test('a subclass override of CloneAllMetadata is still honored on the fast path (pre-#3083 seam)', async () => {
        // External subclasses (e.g. tenant scoping) customized the reuse path by
        // overriding CloneAllMetadata — the base class must keep calling the override
        // rather than silently switching them to the shared shell.
        class CloneOverridingProvider extends TestMetadataProvider {
            public CloneCalls = 0;
            protected override CloneAllMetadata(toClone: AllMetadata): AllMetadata {
                this.CloneCalls++;
                return super['CloneAllMetadata'](toClone);
            }
        }

        const customProvider = new CloneOverridingProvider();
        const result = await customProvider.Config(reuseGlobalConfig());

        expect(result).toBe(true);
        expect(customProvider.CloneCalls).toBe(1);
        // The override produced a DEEP clone — distinct Info instances, not the shell.
        expect(customProvider.Entities.length).toBe(globalProvider.Entities.length);
        expect(customProvider.Entities[0]).not.toBe(globalProvider.Entities[0]);
    });
});
