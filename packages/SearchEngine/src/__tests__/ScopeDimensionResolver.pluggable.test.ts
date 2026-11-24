/**
 * The SearchScope dimension resolver is a replaceable seam, mirroring
 * SearchScopePermissionResolver.
 *
 * MJ's stock resolver derives `ServerDerived` dimensions by executing the declared
 * `expansionQueryID` with `(PrimaryScopeRecordID, UserID, AgentID, SkillID)`. A host whose
 * access model carries server-trusted context beyond those four keys — such as per-tenant
 * entitlements or an evaluation audience — can subclass `ScopeDimensionResolver` and register
 * against `ScopeDimensionResolverBase` without modifying scope filter templates or forking
 * `SearchEngine`.
 *
 * These tests pin the properties that make the seam safe:
 *   - stock behaviour when nothing else is registered
 *   - real fallback when registrations are missing (never returns a hollow base instance)
 *   - late registrations picked up per call, with clean inheritance and no collision warnings
 *   - all ScopeDimensionResolverBase invariants (anti-spoof, strictValidation, narrowingOf,
 *     and grammar validation of deriveServerValue outputs) stay enforced for overrides
 *   - end-to-end SearchEngine.Search() and SearchEngine.ExplainScope() pick up registered
 *     overrides and fail closed when an override throws
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MJGlobal, RegisterClass, type ClassRegistration } from '@memberjunction/global';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import {
    SearchEngineBase,
    type MJSearchScopeEntity,
    type MJSearchScopeEntityEntity,
    type MJSearchScopeProviderEntity,
} from '@memberjunction/core-entities';
import {
    ScopeDimensionResolverBase,
    SCOPE_DIMENSION_RESOLVER_KEY,
    ScopeDimensionResolver,
    ScopeDimensionError,
    GetScopeDimensionResolver,
    type DimensionResolutionInput,
} from '../generic/ScopeDimensionResolver';
import { BaseSearchProvider } from '../generic/ISearchProvider';
import { EntitySearchProvider } from '../generic/EntitySearchProvider';
import {
    SearchScopePermissionResolverBase,
    SEARCH_SCOPE_PERMISSION_RESOLVER_KEY,
    SearchScopePermissionResolver,
    type EffectivePermission,
} from '../permissions/SearchScopePermissionResolver';
import type {
    ScopeConstraints,
    ScopeSecondaryDimension,
    SearchParams,
    SearchResultItem,
    SecondaryScopeValue,
} from '../generic/search.types';
import { SearchEngine } from '../generic/SearchEngine';

const SCOPE_ID = '101232A8-2E4D-47AF-B554-74594AA22C82';
const PROVIDER_ID = '875B7781-9049-4FC9-8A90-C51B1369F76B';
const ENTITY_ID = '5D02F118-C3CE-4B1D-9F27-64F72966B738';
const SRC_A = 'A1000000-0000-4000-8000-000000000001';
const SRC_B = 'A1000000-0000-4000-8000-000000000002';

interface InternalClassFactory {
    _registrations?: ClassRegistration[];
    _registrationCache?: Map<unknown, unknown>;
}

function makeScope(config: Record<string, unknown>): MJSearchScopeEntity {
    return {
        ID: SCOPE_ID,
        Name: 'Test Scope',
        Status: 'Active',
        IsGlobal: false,
        IsDefault: false,
        ScopeConfig: null,
        SearchContextConfig: JSON.stringify(config),
    } as unknown as MJSearchScopeEntity;
}

function makeInput(scope: MJSearchScopeEntity, callerScopes?: Record<string, SecondaryScopeValue>): DimensionResolutionInput {
    return {
        Scope: scope,
        CallerContext: callerScopes ? { SecondaryScopes: callerScopes } : undefined,
        ContextUser: { ID: 'user-1', UserRoles: [] } as unknown as UserInfo,
    };
}

/** Snapshot and restore ClassFactory state (including its cache) so tests cannot leak registrations. */
let savedRegistrations: ClassRegistration[] | undefined;

function getFactoryInternals(): InternalClassFactory {
    return MJGlobal.Instance.ClassFactory as unknown as InternalClassFactory;
}

function clearResolverRegistrations(): void {
    const factory = getFactoryInternals();
    if (!Array.isArray(factory._registrations)) return;
    const kept = factory._registrations.filter((r) => r.BaseClass !== ScopeDimensionResolverBase);
    factory._registrations.length = 0;
    factory._registrations.push(...kept);
    factory._registrationCache?.clear();
}

beforeEach(() => {
    const factory = getFactoryInternals();
    savedRegistrations = Array.isArray(factory._registrations) ? [...factory._registrations] : undefined;
});

afterEach(() => {
    const factory = getFactoryInternals();
    if (Array.isArray(savedRegistrations) && factory._registrations) {
        factory._registrations.length = 0;
        factory._registrations.push(...savedRegistrations);
        factory._registrationCache?.clear();
    }
});

describe('ScopeDimensionResolver — replaceable seam', () => {
    it('should return MJ\'s stock resolver when nothing else is registered', () => {
        const resolver = GetScopeDimensionResolver();
        expect(resolver).toBeInstanceOf(ScopeDimensionResolver);
        expect(resolver).toBeInstanceOf(ScopeDimensionResolverBase);
    });

    it('should fall back to a working stock resolver when ClassFactory has no registration', async () => {
        clearResolverRegistrations();

        // @RequiresSubclass() guarantees TryCreateInstance does not construct a hollow base instance.
        const raw = MJGlobal.Instance.ClassFactory.TryCreateInstance<ScopeDimensionResolverBase>(
            ScopeDimensionResolverBase,
            SCOPE_DIMENSION_RESOLVER_KEY,
        );
        expect(raw.Resolved).toBe(false);
        expect(raw.Instance).toBeNull();

        const fallback = GetScopeDimensionResolver();
        expect(fallback).toBeInstanceOf(ScopeDimensionResolver);
        expect(typeof fallback.Resolve).toBe('function');

        const scope = makeScope({
            strictValidation: true,
            dimensions: [{ name: 'Keywords', valueType: 'freetext', trust: 'CallerSupplied' }],
        });
        const res = await fallback.Resolve(makeInput(scope, { Keywords: 'dues' }));
        expect(res.Context?.SecondaryScopes?.Keywords).toBe('dues');
    });

    it('should honour a registered subclass override with no explicit priority and no collision', () => {
        @RegisterClass(ScopeDimensionResolverBase, SCOPE_DIMENSION_RESOLVER_KEY)
        class CustomResolver extends ScopeDimensionResolver {
            protected override async deriveServerValue(): Promise<SecondaryScopeValue | undefined> {
                return [SRC_A];
            }
        }

        expect(GetScopeDimensionResolver()).toBeInstanceOf(CustomResolver);
    });

    it('should resolve per call so late registrations after first use are picked up', () => {
        const before = GetScopeDimensionResolver();

        class LateResolver extends ScopeDimensionResolver {}

        MJGlobal.Instance.ClassFactory.Register(
            ScopeDimensionResolverBase,
            LateResolver,
            SCOPE_DIMENSION_RESOLVER_KEY,
        );

        const after = GetScopeDimensionResolver();
        expect(after).toBeInstanceOf(LateResolver);
        expect(after).not.toBe(before);
    });

    it('should preserve anti-spoof, strictValidation, narrowingOf, and grammar checks for overrides', async () => {
        @RegisterClass(ScopeDimensionResolverBase, SCOPE_DIMENSION_RESOLVER_KEY)
        class AudienceNarrowingResolver extends ScopeDimensionResolver {
            protected override async deriveServerValue(
                dim: ScopeSecondaryDimension,
            ): Promise<SecondaryScopeValue | undefined> {
                if (dim.name === 'EntitledContentSourceIDs') {
                    return [SRC_A];
                }
                return undefined;
            }
        }

        const scope = makeScope({
            strictValidation: true,
            dimensions: [
                { name: 'EntitledContentSourceIDs', valueType: 'uuid[]', restricts: true, required: true },
                {
                    name: 'SelectedContentSourceIDs',
                    valueType: 'uuid[]',
                    trust: 'CallerSupplied',
                    narrowingOf: 'EntitledContentSourceIDs',
                },
            ],
        });

        const resolver = GetScopeDimensionResolver();
        expect(resolver).toBeInstanceOf(AudienceNarrowingResolver);

        // 1. Anti-spoof + narrowingOf: caller spoof on ServerDerived is discarded; narrowing outside bound is intersected.
        const result = await resolver.Resolve(makeInput(scope, {
            EntitledContentSourceIDs: [SRC_A, SRC_B],
            SelectedContentSourceIDs: [SRC_A, SRC_B],
        }));
        expect(result.Context?.SecondaryScopes?.EntitledContentSourceIDs).toEqual([SRC_A]);
        expect(result.Context?.SecondaryScopes?.SelectedContentSourceIDs).toEqual([SRC_A]);
        expect(result.Provenance.find((p) => p.Name === 'EntitledContentSourceIDs')?.Provenance).toBe('DiscardedCaller');

        // 2. strictValidation: undeclared caller key is rejected.
        await expect(
            resolver.Resolve(makeInput(scope, { UndeclaredKey: 'boom' })),
        ).rejects.toThrow(ScopeDimensionError);

        // 3. narrowingOf refuses values wholly outside the override's bound.
        await expect(
            resolver.Resolve(makeInput(scope, { SelectedContentSourceIDs: [SRC_B] })),
        ).rejects.toThrow(ScopeDimensionError);
    });

    it('should validate deriveServerValue outputs against valueType and normalize null to undefined', async () => {
        const scope = makeScope({
            dimensions: [
                { name: 'EntitledContentSourceIDs', valueType: 'uuid[]', restricts: true, required: true },
            ],
        });

        class BadUuidResolver extends ScopeDimensionResolver {
            protected override async deriveServerValue(): Promise<SecondaryScopeValue | undefined> {
                return ['not-a-uuid'];
            }
        }
        await expect(new BadUuidResolver().Resolve(makeInput(scope))).rejects.toThrow(/failed its declared valueType/);

        class EmptyStringMemberResolver extends ScopeDimensionResolver {
            protected override async deriveServerValue(): Promise<SecondaryScopeValue | undefined> {
                return [''];
            }
        }
        await expect(new EmptyStringMemberResolver().Resolve(makeInput(scope))).rejects.toThrow(/failed its declared valueType/);

        class WrongShapeResolver extends ScopeDimensionResolver {
            protected override async deriveServerValue(): Promise<SecondaryScopeValue | undefined> {
                return SRC_A;
            }
        }
        await expect(new WrongShapeResolver().Resolve(makeInput(scope))).rejects.toThrow(/not an array/);

        class NullReturningResolver extends ScopeDimensionResolver {
            protected override async deriveServerValue(): Promise<SecondaryScopeValue | undefined> {
                return null as unknown as SecondaryScopeValue;
            }
        }
        await expect(new NullReturningResolver().Resolve(makeInput(scope))).rejects.toThrow(/could not be resolved/);
    });

    it('should assign omitted priorities above MJ\'s own registration along a clean subclass chain', () => {
        const factory = MJGlobal.Instance.ClassFactory;
        const before = factory.GetAllRegistrations(ScopeDimensionResolverBase, SCOPE_DIMENSION_RESOLVER_KEY);
        const highestBefore = Math.max(...before.map((r) => r.Priority));

        @RegisterClass(ScopeDimensionResolverBase, SCOPE_DIMENSION_RESOLVER_KEY)
        class FirstOverride extends ScopeDimensionResolver {}
        @RegisterClass(ScopeDimensionResolverBase, SCOPE_DIMENSION_RESOLVER_KEY)
        class SecondOverride extends FirstOverride {}

        const after = factory.GetAllRegistrations(ScopeDimensionResolverBase, SCOPE_DIMENSION_RESOLVER_KEY);
        const priorityOf = (cls: unknown) => after.find((r) => r.SubClass === cls)?.Priority;

        expect(before.some((r) => r.SubClass === ScopeDimensionResolver)).toBe(true);
        expect(priorityOf(FirstOverride)).toBeGreaterThan(highestBefore);
        expect(priorityOf(SecondOverride)).toBeGreaterThan(priorityOf(FirstOverride) as number);
        expect(GetScopeDimensionResolver()).toBeInstanceOf(SecondOverride);
    });
});

describe('SearchEngine — end-to-end dimension resolver seam', () => {
    class RecordingEntityProvider extends EntitySearchProvider {
        public RecordedFilters: string[] = [];
        public CallCount = 0;

        public override IsAvailable(): boolean { return true; }
        public override async CheckAvailability(): Promise<boolean> { return true; }

        public override async Search(
            _query: string,
            _maxResults: number,
            _filters: SearchParams['Filters'],
            _contextUser: UserInfo,
            scopeConstraints?: ScopeConstraints,
        ): Promise<SearchResultItem[]> {
            this.CallCount += 1;
            const filters = scopeConstraints?.Entities ?? [];
            for (const f of filters) {
                if (f.ExtraFilter) this.RecordedFilters.push(f.ExtraFilter);
            }
            return [];
        }
    }

    const fakeScope = makeScope({
        strictValidation: true,
        dimensions: [
            { name: 'EntitledContentSourceIDs', valueType: 'uuid[]', restricts: true, required: true },
        ],
    });

    const fakeScopeEntity: MJSearchScopeEntityEntity = {
        ID: 'E1000000-0000-4000-8000-000000000001',
        SearchScopeID: SCOPE_ID,
        EntityID: ENTITY_ID,
        Entity: 'Content Items',
        ExtraFilter: "ContentSourceID IN ('{{ context.SecondaryScopes.EntitledContentSourceIDs | join(\"','\") }}')",
        RequiredMetadataKeys: null,
        UserSearchString: null,
    } as unknown as MJSearchScopeEntityEntity;

    const fakeScopeProvider: MJSearchScopeProviderEntity = {
        ID: 'P1000000-0000-4000-8000-000000000001',
        SearchScopeID: SCOPE_ID,
        SearchProviderID: PROVIDER_ID,
        Enabled: true,
        MaxResultsOverride: null,
    } as unknown as MJSearchScopeProviderEntity;

    const fakeEntityInfo = {
        ID: ENTITY_ID,
        Name: 'Content Items',
        DisplayName: 'Content Items',
        Icon: 'fa-solid fa-file',
        FirstPrimaryKey: { Name: 'ID' },
        PrimaryKeys: [{ Name: 'ID' }],
        GetUserPermisions: () => ({ CanRead: true }),
        GetEffectiveRowFilterWhereClause: () => '',
    };

    class FakeSearchEngineBase extends SearchEngineBase {
        public static Fake(): FakeSearchEngineBase {
            return FakeSearchEngineBase.getInstance<FakeSearchEngineBase>();
        }
        public override get Scopes(): MJSearchScopeEntity[] { return [fakeScope]; }
        public override get ScopeProviders(): MJSearchScopeProviderEntity[] { return [fakeScopeProvider]; }
        public override get ScopeEntities(): MJSearchScopeEntityEntity[] { return [fakeScopeEntity]; }
        public override get ScopeExternalIndexes(): [] { return []; }
        public override get ScopeStorageAccounts(): [] { return []; }
    }

    class SeamTestSearchEngine extends SearchEngine {
        public static Create(): SeamTestSearchEngine {
            return SeamTestSearchEngine.getInstance<SeamTestSearchEngine>();
        }

        public ConfigureStub(provider: BaseSearchProvider): void {
            const internal = this as unknown as {
                _providerEntries: Array<{
                    Provider: BaseSearchProvider;
                    ID: string;
                    DisplayName: string;
                    Icon: string;
                    Priority: number;
                    SupportsPreview: boolean;
                    MaxResultsOverride: number | null;
                    Record: object;
                }>;
                _configured: boolean;
            };
            internal._providerEntries = [{
                Provider: provider,
                ID: PROVIDER_ID,
                DisplayName: 'Entity',
                Icon: 'fa-solid fa-table',
                Priority: 1,
                SupportsPreview: false,
                MaxResultsOverride: null,
                Record: { ID: PROVIDER_ID, Name: 'Entity', Status: 'Active', Priority: 1 },
            }];
            internal._configured = true;
            this.ClearResultCache();
        }

        protected override get Base(): SearchEngineBase {
            return FakeSearchEngineBase.Fake();
        }

        protected override get ProviderToUse(): IMetadataProvider {
            return {
                Entities: [fakeEntityInfo],
                EntityByName: (name: string) => (name.trim().toLowerCase() === 'content items' ? fakeEntityInfo : null),
                GetEntityObject: async () => ({ Save: async () => true }),
            } as unknown as IMetadataProvider;
        }
    }

    function registerAllowAllScopePermission(): void {
        @RegisterClass(SearchScopePermissionResolverBase, SEARCH_SCOPE_PERMISSION_RESOLVER_KEY)
        class AllowAllScopePerm extends SearchScopePermissionResolver {
            public override async ResolveEffectivePermission(): Promise<EffectivePermission> {
                return {
                    Allowed: true,
                    Level: 'Search',
                    Source: 'DirectGrant',
                    Reason: 'test grant',
                    toSqlPredicate: () => '1=1',
                };
            }
        }
        void AllowAllScopePerm;
    }

    it('should apply a registered resolver override in both Search() and ExplainScope()', async () => {
        registerAllowAllScopePermission();

        @RegisterClass(ScopeDimensionResolverBase, SCOPE_DIMENSION_RESOLVER_KEY)
        class AudienceBoundResolver extends ScopeDimensionResolver {
            protected override async deriveServerValue(
                dim: ScopeSecondaryDimension,
            ): Promise<SecondaryScopeValue | undefined> {
                return dim.name === 'EntitledContentSourceIDs' ? [SRC_A] : undefined;
            }
        }
        void AudienceBoundResolver;

        const provider = new RecordingEntityProvider();
        const engine = SeamTestSearchEngine.Create();
        engine.ConfigureStub(provider);
        const user = { ID: 'user-1', UserRoles: [] } as unknown as UserInfo;

        // Caller tries to widen by supplying [SRC_A, SRC_B]: override + anti-spoof keep only SRC_A.
        const searchResult = await engine.Search({
            Query: 'membership',
            ScopeIDs: [SCOPE_ID],
            SearchContext: { SecondaryScopes: { EntitledContentSourceIDs: [SRC_A, SRC_B] } },
        }, user);

        expect(searchResult.Success).toBe(true);
        expect(provider.CallCount).toBe(1);
        expect(provider.RecordedFilters).toEqual([`ContentSourceID IN ('${SRC_A}')`]);

        const explained = await engine.ExplainScope({
            ScopeIDs: [SCOPE_ID],
            SearchContext: { SecondaryScopes: { EntitledContentSourceIDs: [SRC_A, SRC_B] } },
        }, user);
        expect(explained).toHaveLength(1);
        expect(explained[0].Reachable).toBe(true);
        expect(explained[0].Dimensions.find((d) => d.Name === 'EntitledContentSourceIDs')?.Value).toEqual([SRC_A]);
        expect(explained[0].Dimensions.find((d) => d.Name === 'EntitledContentSourceIDs')?.Provenance).toBe('DiscardedCaller');
    });

    it('should fail closed in both Search() and ExplainScope() when a registered override throws', async () => {
        registerAllowAllScopePermission();

        @RegisterClass(ScopeDimensionResolverBase, SCOPE_DIMENSION_RESOLVER_KEY)
        class FailingResolver extends ScopeDimensionResolver {
            protected override async deriveServerValue(): Promise<SecondaryScopeValue | undefined> {
                throw new ScopeDimensionError('audience lookup failed');
            }
        }
        void FailingResolver;

        const provider = new RecordingEntityProvider();
        const engine = SeamTestSearchEngine.Create();
        engine.ConfigureStub(provider);
        const user = { ID: 'user-1', UserRoles: [] } as unknown as UserInfo;

        const searchResult = await engine.Search({
            Query: 'membership',
            ScopeIDs: [SCOPE_ID],
        }, user);
        expect(searchResult.Success).toBe(false);
        expect(searchResult.ErrorMessage).toMatch(/audience lookup failed/);
        expect(provider.CallCount).toBe(0);

        const explained = await engine.ExplainScope({ ScopeIDs: [SCOPE_ID] }, user);
        expect(explained).toHaveLength(1);
        expect(explained[0].Reachable).toBe(false);
        expect(explained[0].Diagnostics.join('\n')).toMatch(/audience lookup failed/);
    });
});
