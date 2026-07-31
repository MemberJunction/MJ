/**
 * §5.12 — supersession: subtraction, deliberately OUTSIDE the boundary.
 *
 * The requirement is Amith's Example 3: skill A grants {A,B}; activating A+B grants C and **removes**
 * B. The decision recorded in the proposal is that this is *not* an entitlement requirement — every
 * concrete case is relevance or precedence (contradictory corpora, a specific source superseding a
 * general one, a specialist narrowing away the general), never "this principal may not see that."
 *
 * So it is built with the opposite posture to the bound, and these tests are mostly about that
 * inversion holding:
 *
 *              bound (restricts)          supersession (advisory)
 *   compose    intersection only          ordered, may subtract
 *   widen?     never                      never — it only removes
 *   on failure FAIL CLOSED (refuse)       FAIL SOFT (drop, carry on)
 *   bug costs  a data leak                worse relevance
 *
 * The last row is the justification for the third: it is why supersession needs none of the grammar,
 * positive-assertion or fail-closed machinery a boundary requires.
 */
import { describe, it, expect } from 'vitest';

import { ScopeDimensionResolver, ScopeDimensionError } from '../generic/ScopeDimensionResolver';
import type { MJSearchScopeEntity } from '@memberjunction/core-entities';
import type { UserInfo } from '@memberjunction/core';
import type { SearchContext, ScopeSearchContextConfig } from '../generic/search.types';

const USER = { ID: 'B1000000-0000-4000-8000-000000000001', Name: 'T', Email: 't@e.com' } as UserInfo;
const SKILL_A = 'AA000000-0000-4000-8000-00000000000A';
const SKILL_B = 'BB000000-0000-4000-8000-00000000000B';

const scopeWith = (config: ScopeSearchContextConfig | null): MJSearchScopeEntity =>
    ({ ID: 'scope-1', Name: 'Test Scope', SearchContextConfig: config ? JSON.stringify(config) : null }) as MJSearchScopeEntity;

const resolver = new ScopeDimensionResolver();
const resolve = (scope: MJSearchScopeEntity, caller: SearchContext | undefined) =>
    resolver.Resolve({ Scope: scope, CallerContext: caller, ContextUser: USER });

// Example 3, expressed as data: A alone supersedes nothing; A+B supersedes the B corpus.
const EXAMPLE_3: ScopeSearchContextConfig = {
    dimensions: [
        { name: 'ActiveSkillIDs', trust: 'CallerSupplied', valueType: 'uuid[]' },
        {
            name: 'SupersededByKey',
            advisory: true,
            valueType: 'enum',
            enumValues: ['b-superseded-by-ab'],
            supersededByRules: [
                {
                    when: { ActiveSkillIDs: [SKILL_A, SKILL_B] },
                    key: 'b-superseded-by-ab',
                    because: 'A+B together supersede the B corpus, which would otherwise contradict C',
                },
            ],
        },
    ],
};

describe('Amith\'s Example 3, as ordered data rather than a rule engine', () => {
    it('publishes NO key for skill A alone — nothing is superseded', async () => {
        const r = await resolve(scopeWith(EXAMPLE_3), { SecondaryScopes: { ActiveSkillIDs: [SKILL_A] } });
        expect(r.Context?.SecondaryScopes?.SupersededByKey).toBeUndefined();
        // Absent is the SAFE state for an excluding clause: an unmatched key removes nothing, so the
        // guarded `{% if %}` simply does not render and the search is unchanged.
        expect(r.Provenance.find((p) => p.Name === 'SupersededByKey')?.Provenance).toBe('Absent');
    });

    it('publishes the key for A+B, so the filter can exclude the B corpus', async () => {
        const r = await resolve(scopeWith(EXAMPLE_3), { SecondaryScopes: { ActiveSkillIDs: [SKILL_A, SKILL_B] } });
        expect(r.Context?.SecondaryScopes?.SupersededByKey).toBe('b-superseded-by-ab');
        const p = r.Provenance.find((x) => x.Name === 'SupersededByKey');
        expect(p?.Provenance).toBe('RuleDerived');
        expect(p?.Restricts).toBe(false);            // it is NOT part of the bound
        expect(p?.Note).toMatch(/contradict C/);     // the reason travels with the decision
    });

    it('matches a set-valued dimension by MEMBERSHIP, in any order', async () => {
        const r = await resolve(scopeWith(EXAMPLE_3), { SecondaryScopes: { ActiveSkillIDs: [SKILL_B, SKILL_A] } });
        expect(r.Context?.SecondaryScopes?.SupersededByKey).toBe('b-superseded-by-ab');
    });

    it('matches case-insensitively, because MJ UUID casing is not consistent', async () => {
        const r = await resolve(scopeWith(EXAMPLE_3), {
            SecondaryScopes: { ActiveSkillIDs: [SKILL_A.toLowerCase(), SKILL_B.toLowerCase()] },
        });
        expect(r.Context?.SecondaryScopes?.SupersededByKey).toBe('b-superseded-by-ab');
    });
});

describe('ordered rules — the array order IS the precedence order', () => {
    const ordered: ScopeSearchContextConfig = {
        dimensions: [
            { name: 'Tier', trust: 'CallerSupplied', valueType: 'enum', enumValues: ['public', 'member', 'staff'] },
            {
                name: 'SupersededByKey', advisory: true, valueType: 'freetext',
                supersededByRules: [
                    { when: { Tier: 'staff' }, key: 'staff-supersedes' },
                    { when: { Tier: 'member' }, key: 'member-supersedes' },
                ],
            },
        ],
    };

    it('takes the FIRST matching rule', async () => {
        const staff = await resolve(scopeWith(ordered), { SecondaryScopes: { Tier: 'staff' } });
        expect(staff.Context?.SecondaryScopes?.SupersededByKey).toBe('staff-supersedes');
        const member = await resolve(scopeWith(ordered), { SecondaryScopes: { Tier: 'member' } });
        expect(member.Context?.SecondaryScopes?.SupersededByKey).toBe('member-supersedes');
    });

    it('publishes nothing when no rule matches', async () => {
        const r = await resolve(scopeWith(ordered), { SecondaryScopes: { Tier: 'public' } });
        expect(r.Context?.SecondaryScopes?.SupersededByKey).toBeUndefined();
        expect(r.Diagnostics.join(' ')).toMatch(/no supersession rule matched/i);
    });

    it('does not fire on a partially-matching multi-condition rule', async () => {
        const multi: ScopeSearchContextConfig = {
            dimensions: [
                { name: 'Tier', trust: 'CallerSupplied', valueType: 'enum', enumValues: ['member'] },
                { name: 'Region', trust: 'CallerSupplied', valueType: 'enum', enumValues: ['us', 'eu'] },
                {
                    name: 'SupersededByKey', advisory: true, valueType: 'freetext',
                    supersededByRules: [{ when: { Tier: 'member', Region: 'eu' }, key: 'eu-member' }],
                },
            ],
        };
        const r = await resolve(scopeWith(multi), { SecondaryScopes: { Tier: 'member', Region: 'us' } });
        expect(r.Context?.SecondaryScopes?.SupersededByKey).toBeUndefined();
    });
});

describe('the inverted failure posture — advisory fails SOFT', () => {
    it('DROPS an advisory dimension whose grammar fails, instead of refusing the search', async () => {
        // The same value on a restricting dimension rejects the whole search. Here it must not:
        // losing the exclusion leaves extra content in the results, which is not an access failure.
        const config: ScopeSearchContextConfig = {
            dimensions: [{ name: 'Hint', advisory: true, trust: 'CallerSupplied', valueType: 'uuid' }],
        };
        const r = await resolve(scopeWith(config), { SecondaryScopes: { Hint: 'not-a-uuid' } });
        expect(r.Context?.SecondaryScopes?.Hint).toBeUndefined();
        expect(r.Diagnostics.join(' ')).toMatch(/DROPPED \(fail-soft\)/);
    });

    it('a REQUIRED advisory dimension still fails soft — required cannot outrank advisory', async () => {
        const config: ScopeSearchContextConfig = {
            dimensions: [{ name: 'Hint', advisory: true, trust: 'CallerSupplied', required: true }],
        };
        const r = await resolve(scopeWith(config), { SecondaryScopes: {} });
        expect(r.Context?.SecondaryScopes?.Hint).toBeUndefined();
        expect(r.Diagnostics.join(' ')).toMatch(/fail-soft/);
    });

    it('but a RESTRICTING dimension with the same bad value still fails CLOSED', async () => {
        // The contrast that makes the split meaningful.
        const config: ScopeSearchContextConfig = {
            dimensions: [{ name: 'Bound', trust: 'CallerSupplied', valueType: 'uuid' }],
        };
        await expect(resolve(scopeWith(config), { SecondaryScopes: { Bound: 'not-a-uuid' } }))
            .rejects.toThrow(/valueType/i);
    });
});

describe('advisory and restricts are mutually exclusive', () => {
    it('REJECTS a dimension claiming both — it has no coherent failure posture', async () => {
        const config: ScopeSearchContextConfig = {
            dimensions: [{ name: 'Confused', restricts: true, advisory: true, valueType: 'uuid' }],
        };
        await expect(resolve(scopeWith(config), undefined)).rejects.toThrow(ScopeDimensionError);
        await expect(resolve(scopeWith(config), undefined)).rejects.toThrow(/Pick one/i);
    });
});

describe('resolution order', () => {
    it('resolves advisory dimensions LAST, so rules can read the others', async () => {
        // Declared first in the array, but its rule depends on Tier — so it must still run after.
        const config: ScopeSearchContextConfig = {
            dimensions: [
                {
                    name: 'SupersededByKey', advisory: true, valueType: 'freetext',
                    supersededByRules: [{ when: { Tier: 'member' }, key: 'k' }],
                },
                { name: 'Tier', trust: 'CallerSupplied', valueType: 'enum', enumValues: ['member'] },
            ],
        };
        const r = await resolve(scopeWith(config), { SecondaryScopes: { Tier: 'member' } });
        expect(r.Provenance.map((p) => p.Name)).toEqual(['Tier', 'SupersededByKey']);
        expect(r.Context?.SecondaryScopes?.SupersededByKey).toBe('k');
    });
});
