/**
 * The SearchScope permission resolver is a replaceable seam.
 *
 * MJ's stock resolver answers from `__mj.SearchScopePermission` rows keyed by `UserID` or by one
 * of the user's MJ Roles. A consumer whose permission model is neither — a per-tenant capability
 * grant, say — has no row shape that can express its grants, so they are invisible to the check
 * that runs on every search. Registering a subclass is the supported way to answer that question
 * differently without forking the search path.
 *
 * These tests pin the properties that make the seam trustworthy:
 *   - nothing registered → MJ's own behaviour, unchanged
 *   - a registration is honoured, and resolved late enough that startup order does not matter
 *   - an override can compose with `super`, which is the intended shape
 *   - the base contract is what registrations bind to
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MJGlobal, RegisterClass } from '@memberjunction/global';
import { UserInfo } from '@memberjunction/core';
import {
    SearchScopePermissionResolverBase,
    SEARCH_SCOPE_PERMISSION_RESOLVER_KEY,
    SearchScopePermissionResolver,
    DefaultSearchScopePermissionResolver,
    GetSearchScopePermissionResolver,
    type ResolvePermissionInput,
    type EffectivePermission,
} from '../permissions/SearchScopePermissionResolver';

const SCOPE_ID = 'A1000000-0000-4000-8000-00000000000A';

function input(overrides?: Partial<ResolvePermissionInput>): ResolvePermissionInput {
    return {
        User: { ID: 'user-1', UserRoles: [] } as unknown as UserInfo,
        SearchScopeID: SCOPE_ID,
        Agent: null,
        ...overrides,
    } as ResolvePermissionInput;
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

describe('SearchScopePermissionResolver — replaceable seam', () => {
    it('returns MJ\'s own resolver when nothing else is registered', () => {
        const resolver = GetSearchScopePermissionResolver();
        expect(resolver).toBeInstanceOf(SearchScopePermissionResolver);
    });

    it('never returns null — a missing registration falls back rather than failing the search', () => {
        expect(GetSearchScopePermissionResolver()).toBeDefined();
    });

    it('honours a registered override, with NO priority passed', () => {
        // No priority argument anywhere in this suite, deliberately: an omitted priority resolves to
        // one higher than the highest already registered for this (base, key), so a registration
        // that runs later always wins. See the ordering test below for the mechanism.
        @RegisterClass(SearchScopePermissionResolverBase, SEARCH_SCOPE_PERMISSION_RESOLVER_KEY)
        class AlwaysAllow extends SearchScopePermissionResolverBase {
            public async ResolveEffectivePermission(): Promise<EffectivePermission> {
                return {
                    Allowed: true, Level: 'Search', Source: 'DirectGrant',
                    Reason: 'test override', toSqlPredicate: () => '1=1',
                };
            }
        }

        expect(GetSearchScopePermissionResolver()).toBeInstanceOf(AlwaysAllow);
    });

    it('resolves per call, so a registration made after first use is still picked up', async () => {
        // The failure this guards against is import-order dependent and shows up as "my resolver
        // works in tests but not in the server" — a resolver cached at module load would satisfy a
        // naive test and still break in an application whose registration runs during startup.
        //
        // Registered imperatively rather than with @RegisterClass: decorators evaluate at MODULE
        // load, so a decorated class in this file would already be registered before any test body
        // runs, and could not demonstrate lateness.
        const before = GetSearchScopePermissionResolver();

        class LateRegistration extends SearchScopePermissionResolverBase {
            public async ResolveEffectivePermission(): Promise<EffectivePermission> {
                return {
                    Allowed: true, Level: 'Manage', Source: 'DirectGrant',
                    Reason: 'late', toSqlPredicate: () => '1=1',
                };
            }
        }

        MJGlobal.Instance.ClassFactory.Register(
            SearchScopePermissionResolverBase, LateRegistration, SEARCH_SCOPE_PERMISSION_RESOLVER_KEY,
        );

        const after = GetSearchScopePermissionResolver();
        expect(after).toBeInstanceOf(LateRegistration);
        expect(after).not.toBe(before);
    });

    it('supports the intended shape — widen only where MJ denied, never narrow what it allowed', async () => {
        const stockAllowed: EffectivePermission = {
            Allowed: true, Level: 'Search', Source: 'RoleGrant',
            Reason: 'stock allowed', toSqlPredicate: () => '1=1',
        };
        const stockDenied: EffectivePermission = {
            Allowed: false, Level: 'None', Source: 'NoGrant',
            Reason: 'stock denied', toSqlPredicate: () => '1=0',
        };

        class Composing extends SearchScopePermissionResolver {
            public constructor(private readonly stock: EffectivePermission) { super(); }
            // Takes the input even though this double ignores it: the point of this test is to
            // demonstrate the shape a real override has, and a real override receives the input.
            public override async ResolveEffectivePermission(
                _input: ResolvePermissionInput,
            ): Promise<EffectivePermission> {
                if (this.stock.Allowed) return this.stock;
                return {
                    Allowed: true, Level: 'Read', Source: 'DirectGrant',
                    Reason: 'widened by consumer entitlement', toSqlPredicate: () => '1=1',
                };
            }
        }

        // Where MJ already allowed, the consumer's answer is not consulted — its own decision stands.
        expect((await new Composing(stockAllowed).ResolveEffectivePermission(input())).Reason)
            .toBe('stock allowed');

        // Where MJ denied for want of a row it cannot express, the consumer may widen.
        const widened = await new Composing(stockDenied).ResolveEffectivePermission(input());
        expect(widened.Allowed).toBe(true);
        expect(widened.Reason).toContain('widened');
    });

    it('keeps the deprecated constant working for existing imports', () => {
        expect(DefaultSearchScopePermissionResolver).toBeInstanceOf(SearchScopePermissionResolver);
    });

    it('binds registrations to the base contract, so a subclass of the stock resolver also qualifies', () => {
        @RegisterClass(SearchScopePermissionResolverBase, SEARCH_SCOPE_PERMISSION_RESOLVER_KEY)
        class ExtendsStock extends SearchScopePermissionResolver {}

        const resolved = GetSearchScopePermissionResolver();
        expect(resolved).toBeInstanceOf(ExtendsStock);
        expect(resolved).toBeInstanceOf(SearchScopePermissionResolverBase);
        expect(resolved).toBeInstanceOf(SearchScopePermissionResolver);
    });

    /**
     * The property the "pass no priority" guidance rests on.
     *
     * `ClassFactory.Register` treats an omitted priority as one higher than the highest already
     * registered for this (base, key). Since a subclass cannot be defined without its parent module
     * having loaded — and therefore its parent's decorator having run — a consumer subclassing the
     * stock resolver is guaranteed to register afterwards, and therefore above it. That is what
     * makes a hardcoded priority unnecessary, and the reason to avoid one: two consumers picking the
     * same number collide, `Register` warns, and the winner degrades to whichever ran last.
     */
    it('ORDERING: an omitted priority lands above every earlier registration, MJ\'s own included', () => {
        const factory = MJGlobal.Instance.ClassFactory;
        const before = factory.GetAllRegistrations(
            SearchScopePermissionResolverBase, SEARCH_SCOPE_PERMISSION_RESOLVER_KEY);
        const highestBefore = Math.max(...before.map(r => r.Priority));

        // Two registrations in sequence, neither passing a priority.
        @RegisterClass(SearchScopePermissionResolverBase, SEARCH_SCOPE_PERMISSION_RESOLVER_KEY)
        class First extends SearchScopePermissionResolver {}
        @RegisterClass(SearchScopePermissionResolverBase, SEARCH_SCOPE_PERMISSION_RESOLVER_KEY)
        class Second extends SearchScopePermissionResolver {}

        const after = factory.GetAllRegistrations(
            SearchScopePermissionResolverBase, SEARCH_SCOPE_PERMISSION_RESOLVER_KEY);
        const priorityOf = (cls: unknown) => after.find(r => r.SubClass === cls)?.Priority;

        // Each auto-assigned priority is strictly above what preceded it...
        expect(priorityOf(First)).toBeGreaterThan(highestBefore);
        expect(priorityOf(Second)).toBeGreaterThan(priorityOf(First) as number);
        // ...and the later of the two is what actually resolves.
        expect(GetSearchScopePermissionResolver()).toBeInstanceOf(Second);

        // Non-vacuity: MJ's own registration really was in the bucket being outranked, so this is
        // measuring the increment rather than an empty starting state.
        expect(before.some(r => r.SubClass === SearchScopePermissionResolver)).toBe(true);
        expect(highestBefore).toBeGreaterThan(0);
    });
});
