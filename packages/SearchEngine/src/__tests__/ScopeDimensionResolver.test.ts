/**
 * Tests for ScopeDimensionResolver — making `SearchScope.SearchContextConfig` enforceable.
 *
 * The headline property is the ANTI-SPOOF rule: for a dimension declared
 * `trust: 'ServerDerived'` (or `restricts: true`, which implies it), a caller-supplied value
 * must be DISCARDED, never merged. Without that, a dimension is a narrowing convenience that
 * any caller — including an LLM writing a tool call — can author, which is precisely why it
 * could not previously carry an access decision.
 *
 * The second property is backwards compatibility: a scope with no declaration must behave
 * exactly as before, byte-for-byte, so every existing scope is untouched.
 */
import { describe, it, expect } from 'vitest';

import { ScopeDimensionResolver, ScopeDimensionError } from '../generic/ScopeDimensionResolver';
import type { MJSearchScopeEntity } from '@memberjunction/core-entities';
import type { UserInfo } from '@memberjunction/core';
import type { SearchContext, ScopeSearchContextConfig } from '../generic/search.types';

const USER = { ID: 'B1000000-0000-4000-8000-000000000001', Name: 'T', Email: 't@e.com' } as UserInfo;
const ORG_A = '628FAAC0-6935-4ECB-BDDB-F9CE246EC542';
const CH_MEMBER = 'A37B6EEE-EC7A-F111-B336-3833C5D7934F';
const CH_PUBLIC = 'A27B6EEE-EC7A-F111-B336-3833C5D7934F';

const scopeWith = (config: ScopeSearchContextConfig | null): MJSearchScopeEntity =>
    ({ ID: 'scope-1', Name: 'Test Scope', SearchContextConfig: config ? JSON.stringify(config) : null }) as MJSearchScopeEntity;

const resolver = new ScopeDimensionResolver();
const resolve = (scope: MJSearchScopeEntity, caller: SearchContext | undefined) =>
    resolver.Resolve({ Scope: scope, CallerContext: caller, ContextUser: USER });

describe('backwards compatibility — an undeclared scope is untouched', () => {
    it('returns the caller context verbatim when SearchContextConfig is null', async () => {
        const caller: SearchContext = { PrimaryScopeRecordID: ORG_A, SecondaryScopes: { Anything: 'goes' } };
        const result = await resolve(scopeWith(null), caller);
        expect(result.Context).toBe(caller);
    });

    it('returns the caller context verbatim when the declaration has no dimensions', async () => {
        const caller: SearchContext = { SecondaryScopes: { Anything: 'goes' } };
        const result = await resolve(scopeWith({ dimensions: [] }), caller);
        expect(result.Context).toBe(caller);
    });
});

describe('anti-spoof — ServerDerived values cannot be authored by a caller', () => {
    const config: ScopeSearchContextConfig = {
        dimensions: [{ name: 'EffectiveChannelID', restricts: true, valueType: 'uuid' }],
    };

    it('DISCARDS a caller-supplied value for a restricting dimension', async () => {
        const result = await resolve(scopeWith(config), {
            PrimaryScopeRecordID: ORG_A,
            SecondaryScopes: { EffectiveChannelID: CH_MEMBER },   // attacker picks the member tier
        });
        // No expansion query is declared, so there is nothing to derive → the key must be ABSENT,
        // not the caller's value.
        expect(result.Context?.SecondaryScopes?.EffectiveChannelID).toBeUndefined();
        expect(result.Diagnostics.join(' ')).toMatch(/discarded caller-supplied value/i);
    });

    it('reports the discard so it is auditable rather than silent', async () => {
        const result = await resolve(scopeWith(config), { SecondaryScopes: { EffectiveChannelID: CH_PUBLIC } });
        expect(result.Diagnostics.some((d) => d.includes('EffectiveChannelID'))).toBe(true);
    });

    it('refuses to let a defaultValue stand in for a restricting dimension', async () => {
        const withDefault: ScopeSearchContextConfig = {
            dimensions: [{ name: 'Tier', restricts: true, valueType: 'uuid', defaultValue: CH_MEMBER }],
        };
        await expect(resolve(scopeWith(withDefault), undefined)).rejects.toThrow(ScopeDimensionError);
    });

    it('rejects a restricting dimension declared as freetext', async () => {
        const bad: ScopeSearchContextConfig = {
            dimensions: [{ name: 'Anything', restricts: true, valueType: 'freetext' }],
        };
        await expect(resolve(scopeWith(bad), undefined)).rejects.toThrow(/freetext/i);
    });
});

describe('value grammars are enforced, not coerced', () => {
    const cfg = (valueType: 'uuid' | 'enum' | 'int' | 'iso-date' | 'bool', extra = {}): ScopeSearchContextConfig =>
        ({ dimensions: [{ name: 'D', trust: 'CallerSupplied', valueType, ...extra }] });

    it('accepts a valid uuid and rejects a non-uuid', async () => {
        const ok = await resolve(scopeWith(cfg('uuid')), { SecondaryScopes: { D: CH_MEMBER } });
        expect(ok.Context?.SecondaryScopes?.D).toBe(CH_MEMBER);
        await expect(resolve(scopeWith(cfg('uuid')), { SecondaryScopes: { D: "x' OR 1=1" } }))
            .rejects.toThrow(/valueType/i);
    });

    it('enforces enum membership', async () => {
        const c = cfg('enum', { enumValues: ['public', 'member'] });
        const ok = await resolve(scopeWith(c), { SecondaryScopes: { D: 'member' } });
        expect(ok.Context?.SecondaryScopes?.D).toBe('member');
        await expect(resolve(scopeWith(c), { SecondaryScopes: { D: 'staff' } })).rejects.toThrow(/not one of/i);
    });

    it('enforces int, iso-date and bool', async () => {
        await expect(resolve(scopeWith(cfg('int')), { SecondaryScopes: { D: 'seven' } })).rejects.toThrow();
        await expect(resolve(scopeWith(cfg('iso-date')), { SecondaryScopes: { D: 'not-a-date' } })).rejects.toThrow();
        await expect(resolve(scopeWith(cfg('bool')), { SecondaryScopes: { D: 'true' } })).rejects.toThrow();
    });
});

describe('strictValidation has teeth', () => {
    it('rejects an undeclared caller key when strictValidation is on', async () => {
        const config: ScopeSearchContextConfig = {
            dimensions: [{ name: 'Known', trust: 'CallerSupplied' }],
            strictValidation: true,
        };
        await expect(resolve(scopeWith(config), { SecondaryScopes: { Known: 'a', Sneaky: 'b' } }))
            .rejects.toThrow(/undeclared dimension/i);
    });

    it('drops (rather than rejects) undeclared keys when strictValidation is off', async () => {
        const config: ScopeSearchContextConfig = { dimensions: [{ name: 'Known', trust: 'CallerSupplied' }] };
        const result = await resolve(scopeWith(config), { SecondaryScopes: { Known: 'a', Sneaky: 'b' } });
        expect(result.Context?.SecondaryScopes?.Known).toBe('a');
        expect(result.Context?.SecondaryScopes?.Sneaky).toBeUndefined();
    });
});

describe('narrowingOf is a meet — a caller may narrow, never widen', () => {
    it('rejects a scalar value that does not match the server-derived bound', async () => {
        // Server value is absent here (no expansion query), so narrowing is a no-op; the
        // meaningful assertions live in the resolver's unit semantics below.
        const config: ScopeSearchContextConfig = {
            dimensions: [
                { name: 'Bound', restricts: true, valueType: 'uuid' },
                { name: 'Requested', trust: 'CallerSupplied', valueType: 'uuid', narrowingOf: 'Bound' },
            ],
        };
        const result = await resolve(scopeWith(config), { SecondaryScopes: { Requested: CH_PUBLIC } });
        // With no server bound derived, the caller's own narrowing survives unchanged.
        expect(result.Context?.SecondaryScopes?.Requested).toBe(CH_PUBLIC);
    });

    it('intersects sets and rejects a disjoint narrowing', () => {
        const r = resolver as unknown as {
            meet: (d: { name: string; narrowingOf?: string; valueDomain?: string }, c: unknown, s: unknown) => unknown;
        };
        const dim = { name: 'Src', narrowingOf: 'Allowed', valueDomain: 'set' };
        expect(r.meet.call(resolver, dim, ['a', 'b', 'z'], ['a', 'b', 'c'])).toEqual(['a', 'b']);
        expect(() => r.meet.call(resolver, dim, ['z'], ['a', 'b'])).toThrow(/narrowed to NOTHING/i);
    });

    it('treats a SCALAR caller value against a SET server bound as MEMBERSHIP, not equality', () => {
        // The case an earlier version got wrong: it stringified the array and rejected every
        // legitimate pick. "Choose one of the allowed channels" must succeed.
        const r = resolver as unknown as { meet: (d: unknown, c: unknown, s: unknown) => unknown };
        const dim = { name: 'Chosen', narrowingOf: 'Allowed', valueDomain: 'scalar' };
        expect(r.meet.call(resolver, dim, 'b', ['a', 'b', 'c'])).toBe('b');
        expect(() => r.meet.call(resolver, dim, 'zz', ['a', 'b'])).toThrow(/WIDEN/i);
    });

    it('rejects a caller SET against a scalar server bound unless it restates it exactly', () => {
        const r = resolver as unknown as { meet: (d: unknown, c: unknown, s: unknown) => unknown };
        const dim = { name: 'Chosen', narrowingOf: 'Allowed' };
        expect(r.meet.call(resolver, dim, ['member'], 'member')).toBe('member');
        expect(() => r.meet.call(resolver, dim, ['member', 'staff'], 'member')).toThrow(/WIDEN/i);
    });

    it('rejects narrowing a scalar to a different value (that would widen)', () => {
        const r = resolver as unknown as { meet: (d: unknown, c: unknown, s: unknown) => unknown };
        const dim = { name: 'Tier', narrowingOf: 'Allowed', valueDomain: 'scalar' };
        expect(() => r.meet.call(resolver, dim, 'staff', 'member')).toThrow(/would widen/i);
        expect(r.meet.call(resolver, dim, 'member', 'member')).toBe('member');
    });

    it('rejects narrowingOf pointing at an undeclared dimension, and circular chains', async () => {
        await expect(resolve(scopeWith({ dimensions: [{ name: 'A', narrowingOf: 'Nope' }] }), undefined))
            .rejects.toThrow(/not a declared dimension/i);
        await expect(resolve(scopeWith({
            dimensions: [{ name: 'A', narrowingOf: 'B' }, { name: 'B', narrowingOf: 'A' }],
        }), undefined)).rejects.toThrow(/circular/i);
    });
});

describe('malformed declarations fail closed', () => {
    it('refuses to search when SearchContextConfig is not valid JSON', async () => {
        const scope = { ID: 's', Name: 'Broken', SearchContextConfig: '{ oops' } as MJSearchScopeEntity;
        await expect(resolve(scope, undefined)).rejects.toThrow(/not valid JSON/i);
    });

    it('rejects when a required dimension cannot be resolved', async () => {
        const config: ScopeSearchContextConfig = {
            dimensions: [{ name: 'MustHave', trust: 'CallerSupplied', required: true }],
        };
        await expect(resolve(scopeWith(config), { SecondaryScopes: {} })).rejects.toThrow(/Required dimension/i);
    });
});

describe('§5.9 — a boundary defaults to strict, and permissive must be deliberate', () => {
    // `inheritanceMode` shipped in the declaration type and NOTHING read it — the exact failure this
    // resolver exists to fix, reproduced inside the fix. These tests are what stop that recurring.
    it('REJECTS cascading on a restricting dimension without an explicit acknowledgment', async () => {
        const config: ScopeSearchContextConfig = {
            dimensions: [{ name: 'Tier', restricts: true, valueType: 'uuid', inheritanceMode: 'cascading' }],
        };
        await expect(resolve(scopeWith(config), undefined)).rejects.toThrow(/PERMISSIVE/i);
        await expect(resolve(scopeWith(config), undefined)).rejects.toThrow(/acknowledgeCascadingOnBoundary/);
    });

    it('ALLOWS cascading on a boundary once acknowledged, because it is sometimes genuinely wanted', async () => {
        const config: ScopeSearchContextConfig = {
            dimensions: [{
                name: 'Tier', restricts: true, valueType: 'uuid',
                inheritanceMode: 'cascading', acknowledgeCascadingOnBoundary: true,
            }],
        };
        const result = await resolve(scopeWith(config), { SecondaryScopes: {} });
        expect(result.Provenance[0].InheritanceMode).toBe('cascading');
    });

    it('leaves cascading alone on a NON-restricting dimension — it is only a boundary concern', async () => {
        const config: ScopeSearchContextConfig = {
            dimensions: [{ name: 'Topic', trust: 'CallerSupplied', valueType: 'freetext', inheritanceMode: 'cascading' }],
        };
        const result = await resolve(scopeWith(config), { SecondaryScopes: { Topic: 'x' } });
        expect(result.Provenance[0].InheritanceMode).toBe('cascading');
    });

    it('reports the ENFORCED mode, not the raw declaration', async () => {
        // A boundary that declares nothing is strict; provenance must say what was enforced so an
        // auditor is not left inferring it from an absent field.
        const config: ScopeSearchContextConfig = {
            dimensions: [
                { name: 'Bound', restricts: true, valueType: 'uuid' },
                { name: 'Hint', trust: 'CallerSupplied', valueType: 'freetext' },
            ],
        };
        const result = await resolve(scopeWith(config), { SecondaryScopes: { Hint: 'x' } });
        const byName = Object.fromEntries(result.Provenance.map((p) => [p.Name, p]));
        expect(byName.Bound.InheritanceMode).toBe('strict');
        expect(byName.Hint.InheritanceMode).toBe('cascading');
    });
});

describe('a defaultValue must not relabel a discard (regression, pass 5)', () => {
    // ServerDerived + NOT restricting + a defaultValue: the caller's value is discarded, nothing
    // derives, and the default fills in. Provenance previously became 'Default', which hides the
    // attempt from the only filter an auditor would run against ScopeDecisionJSON.
    it('keeps DiscardedCaller even when a default supplies the value', async () => {
        const config: ScopeSearchContextConfig = {
            dimensions: [{
                name: 'D', trust: 'ServerDerived', valueType: 'uuid',
                defaultValue: '11111111-1111-4111-8111-111111111111',
            }],
        };
        const result = await resolve(scopeWith(config), {
            SecondaryScopes: { D: '22222222-2222-4222-8222-222222222222' },
        });
        const p = result.Provenance[0];
        expect(p.Provenance).toBe('DiscardedCaller');
        expect(p.Value).toBe('11111111-1111-4111-8111-111111111111');   // the default still applied
        expect(p.Note).toMatch(/discarded/i);
    });
});
