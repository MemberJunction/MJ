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
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MJGlobal, RegisterClass } from '@memberjunction/global';
import type { UserInfo } from '@memberjunction/core';
import type { MJSearchScopeEntity } from '@memberjunction/core-entities';
import {
    ScopeDimensionResolverBase,
    SCOPE_DIMENSION_RESOLVER_KEY,
    ScopeDimensionResolver,
    DefaultScopeDimensionResolver,
    GetScopeDimensionResolver,
    type DimensionResolutionInput,
    type DimensionResolutionResult,
} from '../generic/ScopeDimensionResolver';
import type { ScopeSecondaryDimension, SecondaryScopeValue } from '../generic/search.types';
import { SearchEngine } from '../generic/SearchEngine';

const SRC_A = 'A1000000-0000-4000-8000-000000000001';
const SRC_B = 'A1000000-0000-4000-8000-000000000002';

function makeScope(config: Record<string, unknown>): MJSearchScopeEntity {
    return {
        ID: 'S1000000-0000-4000-8000-000000000001',
        Name: 'Test Scope',
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

/** Snapshot and restore the registry so one test's registration cannot leak into another. */
let savedRegistrations: unknown;

beforeEach(() => {
    const factory = MJGlobal.Instance.ClassFactory as unknown as { _registrations?: unknown[] };
    savedRegistrations = Array.isArray(factory._registrations) ? [...factory._registrations] : undefined;
});

afterEach(() => {
    const factory = MJGlobal.Instance.ClassFactory as unknown as { _registrations?: unknown[] };
    if (Array.isArray(savedRegistrations) && factory._registrations) {
        factory._registrations.length = 0;
        factory._registrations.push(...(savedRegistrations as unknown[]));
    }
});

describe('ScopeDimensionResolver — replaceable seam', () => {
    it('should return MJ\'s stock resolver when nothing else is registered', () => {
        const resolver = GetScopeDimensionResolver();
        expect(resolver).toBeInstanceOf(ScopeDimensionResolver);
        expect(resolver).toBeInstanceOf(ScopeDimensionResolverBase);
    });

    it('should never return null and keep DefaultScopeDimensionResolver working', () => {
        expect(GetScopeDimensionResolver()).toBeDefined();
        expect(DefaultScopeDimensionResolver).toBeInstanceOf(ScopeDimensionResolver);
    });

    it('should honour a registered override with no explicit priority', () => {
        @RegisterClass(ScopeDimensionResolverBase, SCOPE_DIMENSION_RESOLVER_KEY)
        class CustomResolver extends ScopeDimensionResolverBase {
            public async Resolve(input: DimensionResolutionInput): Promise<DimensionResolutionResult> {
                return { Context: input.CallerContext, Diagnostics: ['custom'], Provenance: [] };
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

    it('should let a subclass override deriveServerValue while preserving anti-spoof and strictValidation', async () => {
        @RegisterClass(ScopeDimensionResolverBase, SCOPE_DIMENSION_RESOLVER_KEY)
        class AudienceNarrowingResolver extends ScopeDimensionResolver {
            protected override async deriveServerValue(
                dim: ScopeSecondaryDimension,
                _input: DimensionResolutionInput,
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
            ],
        });

        const resolver = GetScopeDimensionResolver();
        expect(resolver).toBeInstanceOf(AudienceNarrowingResolver);

        // Caller attempts to spoof a wider list: stock Resolve() still discards it and uses deriveServerValue().
        const result = await resolver.Resolve(makeInput(scope, { EntitledContentSourceIDs: [SRC_A, SRC_B] }));
        expect(result.Context?.SecondaryScopes?.EntitledContentSourceIDs).toEqual([SRC_A]);
        expect(result.Provenance[0]?.Provenance).toBe('DiscardedCaller');
    });

    it('should route SearchEngine.dimensionResolver through GetScopeDimensionResolver', () => {
        class EngineProbe extends SearchEngine {
            public GetResolver(): ScopeDimensionResolverBase {
                return this.dimensionResolver;
            }
        }

        const probe = new EngineProbe();
        expect(probe.GetResolver()).toBeInstanceOf(ScopeDimensionResolver);

        @RegisterClass(ScopeDimensionResolverBase, SCOPE_DIMENSION_RESOLVER_KEY)
        class RegisteredForEngine extends ScopeDimensionResolver {}

        expect(probe.GetResolver()).toBeInstanceOf(RegisteredForEngine);
    });

    it('should assign omitted priorities above MJ\'s own registration', () => {
        const factory = MJGlobal.Instance.ClassFactory;
        const before = factory.GetAllRegistrations(ScopeDimensionResolverBase, SCOPE_DIMENSION_RESOLVER_KEY);
        const highestBefore = Math.max(...before.map((r) => r.Priority));

        @RegisterClass(ScopeDimensionResolverBase, SCOPE_DIMENSION_RESOLVER_KEY)
        class FirstOverride extends ScopeDimensionResolver {}
        @RegisterClass(ScopeDimensionResolverBase, SCOPE_DIMENSION_RESOLVER_KEY)
        class SecondOverride extends ScopeDimensionResolver {}

        const after = factory.GetAllRegistrations(ScopeDimensionResolverBase, SCOPE_DIMENSION_RESOLVER_KEY);
        const priorityOf = (cls: unknown) => after.find((r) => r.SubClass === cls)?.Priority;

        expect(before.some((r) => r.SubClass === ScopeDimensionResolver)).toBe(true);
        expect(priorityOf(FirstOverride)).toBeGreaterThan(highestBefore);
        expect(priorityOf(SecondOverride)).toBeGreaterThan(priorityOf(FirstOverride) as number);
        expect(GetScopeDimensionResolver()).toBeInstanceOf(SecondOverride);
    });
});
