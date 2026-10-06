/**
 * Tests for Phase F — the scope decision record.
 *
 * Two halves:
 *
 *  1. **Provenance** (`ScopeDimensionResolver.Resolve().Provenance`) — the structured answer to
 *     "who decided this value?". `Diagnostics` already said so in prose, but prose cannot be
 *     stored, queried, or asserted on. The distinction that matters is `CallerSupplied` versus
 *     `ServerDerived`: a value an outside party chose is a search refinement, and only a value
 *     the engine derived can carry an access decision. `DiscardedCaller` records an attempt that
 *     was thrown away, which is the single most interesting event in a security review.
 *
 *  2. **`SummarizeExplanation`** — the human-readable rendering, including the case where
 *     entitlement was not evaluated at all.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// The explain path resolves entitlement through this seam. Mocking it lets these tests assert what
// `explainEntitlement` HANDS the resolver — the parity claim — without standing up a permission
// corpus. The resolver's own rules (including which principals it judges, and where) are covered by
// its own test file, SearchScopePermissionResolver.test.ts.
//
// NOTE: this file deliberately does NOT mock '@memberjunction/aiengine' — with the resolver
// stubbed, nothing on the explain path ever reaches AIEngine, so such a mock would be inert
// scaffolding.
//
// importOriginal is spread so the mock stays partial-but-safe: this module exports types and the
// resolver class as well, and the first VALUE import added to that graph would otherwise be
// undefined at runtime with no obvious cause.
type ResolvedPermission = {
    Allowed: boolean; Level: string; Source: string; Reason: string; toSqlPredicate: () => string;
};
// Annotated rather than inferred: without this the literal initializer narrows toSqlPredicate to
// () => '1=1', and a test returning '1=0' fails to typecheck.
const resolveSpy = vi.fn(async (_input: unknown): Promise<ResolvedPermission> => ({
    Allowed: true, Level: 'Search', Source: 'DirectGrant', Reason: 'ok', toSqlPredicate: () => '1=1',
}));
vi.mock('../permissions/SearchScopePermissionResolver', async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    GetSearchScopePermissionResolver: () => ({ ResolveEffectivePermission: resolveSpy }),
}));

import { ScopeDimensionResolver } from '../generic/ScopeDimensionResolver';
import { SearchEngine } from '../generic/SearchEngine';
import { SummarizeExplanation, type ScopeExplanation } from '../generic/ScopeExplanation';
import type { MJAIAgentEntity, MJAISkillEntity, MJSearchScopeEntity } from '@memberjunction/core-entities';
import type { UserInfo } from '@memberjunction/core';
import type { SearchContext, ScopeSearchContextConfig } from '../generic/search.types';

const USER = { ID: 'B1000000-0000-4000-8000-000000000001', Name: 'T', Email: 't@e.com' } as UserInfo;
const CH_MEMBER = 'A37B6EEE-EC7A-F111-B336-3833C5D7934F';

const scopeWith = (config: ScopeSearchContextConfig | null): MJSearchScopeEntity =>
    ({ ID: 'scope-1', Name: 'Test Scope', SearchContextConfig: config ? JSON.stringify(config) : null }) as MJSearchScopeEntity;

const resolver = new ScopeDimensionResolver();
const resolve = (scope: MJSearchScopeEntity, caller: SearchContext | undefined) =>
    resolver.Resolve({ Scope: scope, CallerContext: caller, ContextUser: USER });

describe('dimension provenance', () => {
    it('is empty for an undeclared scope, which decides nothing', async () => {
        const result = await resolve(scopeWith(null), { SecondaryScopes: { Anything: 'goes' } });
        expect(result.Provenance).toEqual([]);
    });

    it('labels a caller-supplied value on a trusting dimension as CallerSupplied', async () => {
        const config: ScopeSearchContextConfig = {
            dimensions: [{ name: 'Keywords', trust: 'CallerSupplied', valueType: 'freetext' }],
        };
        const result = await resolve(scopeWith(config), { SecondaryScopes: { Keywords: 'benefits' } });
        expect(result.Provenance).toHaveLength(1);
        expect(result.Provenance[0]).toMatchObject({
            Name: 'Keywords',
            Value: 'benefits',
            Provenance: 'CallerSupplied',
            Restricts: false,
        });
    });

    it('labels a DISCARDED caller value on a restricting dimension as DiscardedCaller', async () => {
        // The security-relevant event. The value did not survive — but the ATTEMPT is what an
        // audit needs to see, so the discard wins the label even though the resolved value is
        // whatever the server derived (here, nothing: no expansion query is declared).
        const config: ScopeSearchContextConfig = {
            dimensions: [{ name: 'EffectiveChannelID', restricts: true, valueType: 'uuid' }],
        };
        const result = await resolve(scopeWith(config), { SecondaryScopes: { EffectiveChannelID: CH_MEMBER } });
        expect(result.Provenance[0]).toMatchObject({
            Name: 'EffectiveChannelID',
            Provenance: 'DiscardedCaller',
            Restricts: true,
            Value: null,
        });
        expect(result.Provenance[0].Note).toMatch(/discarded/i);
        // The discarded value itself is recorded, so an investigator can see WHAT was attempted.
        expect(result.Provenance[0].Note).toContain(CH_MEMBER);
    });

    it('distinguishes ServerDerived-with-no-attempt from DiscardedCaller', async () => {
        const config: ScopeSearchContextConfig = {
            dimensions: [{ name: 'EffectiveChannelID', restricts: true, valueType: 'uuid' }],
        };
        const result = await resolve(scopeWith(config), { SecondaryScopes: {} });
        // Nobody tried to author it, so there is no discard to report — and with no expansion
        // query there is nothing to derive either, leaving the dimension simply Absent.
        expect(result.Provenance[0].Provenance).toBe('Absent');
        expect(result.Provenance[0].Note).toBeUndefined();
    });

    it('labels an applied default as Default', async () => {
        const config: ScopeSearchContextConfig = {
            dimensions: [{ name: 'Tier', trust: 'CallerSupplied', valueType: 'enum', enumValues: ['public'], defaultValue: 'public' }],
        };
        const result = await resolve(scopeWith(config), { SecondaryScopes: {} });
        expect(result.Provenance[0]).toMatchObject({ Name: 'Tier', Value: 'public', Provenance: 'Default' });
    });

    it('labels a dimension declared but never supplied as Absent', async () => {
        const config: ScopeSearchContextConfig = {
            dimensions: [{ name: 'Optional', trust: 'CallerSupplied', valueType: 'uuid' }],
        };
        const result = await resolve(scopeWith(config), { SecondaryScopes: {} });
        expect(result.Provenance[0]).toMatchObject({ Name: 'Optional', Value: null, Provenance: 'Absent' });
    });

    it('reports one entry per declared dimension, in resolution order', async () => {
        const config: ScopeSearchContextConfig = {
            dimensions: [
                { name: 'Chosen', trust: 'CallerSupplied', valueType: 'uuid', narrowingOf: 'Allowed' },
                { name: 'Allowed', restricts: true, valueType: 'uuid' },
            ],
        };
        const result = await resolve(scopeWith(config), { SecondaryScopes: { Chosen: CH_MEMBER } });
        // `narrowingOf` forces Allowed to resolve first; provenance follows that same order so
        // the record reads in the sequence the decisions were actually made.
        expect(result.Provenance.map((p) => p.Name)).toEqual(['Allowed', 'Chosen']);
    });

    it('keeps Provenance and the resolved Context in agreement', async () => {
        const config: ScopeSearchContextConfig = {
            dimensions: [
                { name: 'Keywords', trust: 'CallerSupplied', valueType: 'freetext' },
                { name: 'Bound', restricts: true, valueType: 'uuid' },
            ],
        };
        const result = await resolve(scopeWith(config), { SecondaryScopes: { Keywords: 'x', Bound: CH_MEMBER } });
        const resolved = result.Context?.SecondaryScopes ?? {};
        for (const entry of result.Provenance) {
            // A provenance row claiming a value the context does not carry would make the audit
            // log describe a search that never happened.
            expect(entry.Value).toEqual(resolved[entry.Name] ?? null);
        }
    });
});

describe('SummarizeExplanation', () => {
    const base: ScopeExplanation = {
        ScopeID: 'scope-1',
        ScopeName: 'Betty Content',
        Entitlement: {
            Allowed: true,
            Level: 'Search',
            Source: 'RoleGrant',
            Reason: 'granted via role Member',
            Principals: { UserID: USER.ID, AgentID: null, SkillID: null, PrimaryScopeRecordID: 'org-1' },
        },
        Dimensions: [
            { Name: 'EffectiveChannelID', Value: CH_MEMBER, Provenance: 'ServerDerived', Restricts: true },
        ],
        Lanes: [
            { Kind: 'ExternalIndex', Target: 'betty-idx', LaneID: 'l1', Status: 'Active', RenderedFilter: '{"OrganizationID":"org-1"}' },
        ],
        Diagnostics: [],
        Reachable: true,
        Unbounded: false,
    };

    it('marks a restricting dimension as a BOUND so it stands out from a refinement', () => {
        const text = SummarizeExplanation(base).join('\n');
        expect(text).toContain('EffectiveChannelID [BOUND]');
        expect(text).toContain('(ServerDerived)');
    });

    it('reports a skipped lane with its reason', () => {
        const text = SummarizeExplanation({
            ...base,
            Reachable: false,
            Lanes: [{
                Kind: 'ExternalIndex', Target: 'betty-idx', LaneID: 'l1', Status: 'Skipped',
                RenderedFilter: null, RequiredMetadataKeys: ['OrganizationID', 'ContentSourceID'],
                Reason: 'missing required metadata key [ContentSourceID]',
            }],
        }).join('\n');
        expect(text).toContain('Reachable: NO');
        expect(text).toContain('[Skipped]');
        expect(text).toContain('requires: OrganizationID, ContentSourceID');
        expect(text).toContain('SKIPPED: missing required metadata key');
    });

    it('says so plainly when entitlement was NOT evaluated, rather than implying a grant', () => {
        // This is what an explanation captured during a real search looks like: the engine does
        // not resolve scope entitlement, its caller does. Rendering that as "granted" would make
        // an unevaluated search read as authorized in the audit log.
        const text = SummarizeExplanation({ ...base, Entitlement: null }).join('\n');
        expect(text).toContain('entitlement not evaluated at this layer');
        expect(text).not.toMatch(/granted|DENIED/);
    });

    it('calls out a legacy scope with no declared dimensions', () => {
        const text = SummarizeExplanation({ ...base, Dimensions: [] }).join('\n');
        expect(text).toMatch(/none declared/i);
        expect(text).toMatch(/passes through unchecked/i);
    });
});

describe('principal parity between the dry run and the real search (regression)', () => {
    // Adversarial review finding, and the one that most undermined Phase F: `ExplainScope`
    // passed `Principals: { AgentID }` to the dimension resolver while the search path passed
    // none at all. Any scope deriving its bound from an expansion query bound to `AgentID`
    // therefore PREVIEWED one bound and SEARCHED with another — the preview was confidently
    // wrong, which is worse than having no preview.
    //
    // The fix is structural: both paths now go through one conversion, so they cannot disagree.
    // These tests pin that conversion.
    class Probe extends SearchEngine {
        public Principals(source: { AIAgentID?: string | null; AISkillID?: string | null }) {
            return this.principalsFrom(source);
        }
    }
    const probe = new Probe();

    it('maps both principal IDs, from either caller shape', () => {
        expect(probe.Principals({ AIAgentID: 'agent-1', AISkillID: 'skill-1' }))
            .toEqual({ AgentID: 'agent-1', SkillID: 'skill-1' });
    });

    it('normalises absent principals to null rather than undefined', () => {
        // `undefined` would serialize away in the expansion query's parameter bag, so a query
        // binding @AgentID would see a missing parameter instead of an explicit "no agent".
        expect(probe.Principals({})).toEqual({ AgentID: null, SkillID: null });
        expect(probe.Principals({ AIAgentID: undefined, AISkillID: null }))
            .toEqual({ AgentID: null, SkillID: null });
    });

    it('produces IDENTICAL principals for a SearchParams and an ExplainScopeInput carrying the same IDs', () => {
        const searchParams = { Query: 'x', AIAgentID: 'a', AISkillID: 's' };
        const explainInput = { ScopeIDs: ['scope-1'], AIAgentID: 'a', AISkillID: 's' };
        expect(probe.Principals(searchParams)).toEqual(probe.Principals(explainInput));
    });
});

describe('explain mirrors the action\'s skill gate', () => {
    // A preview that promises what the search refuses is worse than no preview. The search only
    // honours a skill on the terms it could have been ACTIVATED on, so the explanation must too —
    // otherwise SkillUnscopedAll shows here as a grant while the real search denies it.
    // Overrides rather than casts: `explainEntitlement` and `loadPrincipal` are `protected` for the
    // same reason `principalsFrom` is — so a probe can drive them without weakening types.
    class EntitlementProbe extends SearchEngine {
        protected override async loadPrincipal<T extends MJAIAgentEntity | MJAISkillEntity>(
            _entityName: string, id: string | null | undefined
        ): Promise<T | null> {
            return id ? ({ ID: id, Name: id } as unknown as T) : null;
        }
        public Explain(input: { AIAgentID?: string; AISkillID?: string }, user: UserInfo) {
            return this.explainEntitlement('scope-1', { ScopeIDs: ['scope-1'], ...input }, user);
        }
    }

    beforeEach(() => {
        resolveSpy.mockClear();
        resolveSpy.mockResolvedValue({
            Allowed: true, Level: 'Search', Source: 'DirectGrant', Reason: 'ok', toSqlPredicate: () => '1=1',
        });
    });

    it('hands BOTH loaded principals to the resolver, so preview is judged like the search', async () => {
        const probe = new EntitlementProbe();
        await probe.Explain({ AIAgentID: 'agent-1', AISkillID: 'skill-1' }, USER);
        expect(resolveSpy).toHaveBeenCalledTimes(1);
        const passed = resolveSpy.mock.calls[0][0] as { Agent: { ID: string } | null; Skill: { ID: string } | null };
        expect(passed.Agent?.ID).toBe('agent-1');
        expect(passed.Skill?.ID).toBe('skill-1');
    });

    it('reports a wieldability refusal rather than showing the fallback as a grant', async () => {
        resolveSpy.mockResolvedValue({
            Allowed: false, Level: 'None', Source: 'PrincipalNotActivatable',
            Reason: 'this user may not run agent', toSqlPredicate: () => '1=0',
        });
        const probe = new EntitlementProbe();
        const out = await probe.Explain({ AIAgentID: 'agent-1', AISkillID: 'skill-1' }, USER);
        expect(out.Allowed).toBe(false);
        expect(out.Source).toBe('PrincipalNotActivatable');
    });

    it('refuses a principal that was NAMED but would not load, instead of binding it raw', async () => {
        // loadPrincipal returns null both for "nothing supplied" and "supplied but nonexistent".
        // Conflating them let an unloadable id reach the expansion query unjudged, while the action
        // refused the same input with INVALID_PARAM.
        class UnloadableProbe extends SearchEngine {
            protected override async loadPrincipal<T extends MJAIAgentEntity | MJAISkillEntity>(): Promise<T | null> {
                return null;
            }
            public Explain(input: { AIAgentID?: string; AISkillID?: string }, user: UserInfo) {
                return this.explainEntitlement('scope-1', { ScopeIDs: ['scope-1'], ...input }, user);
            }
        }
        const out = await new UnloadableProbe().Explain({ AISkillID: 'no-such-skill' }, USER);
        expect(out.Allowed).toBe(false);
        expect(out.Source).toBe('PrincipalNotActivatable');
        expect(out.Reason).toMatch(/could not be loaded/);
        // and the resolver was never consulted — there was nothing legitimate to ask it about
        expect(resolveSpy).not.toHaveBeenCalled();
    });

    it('reads a resolver failure as denied — an explanation must never fail open', async () => {
        resolveSpy.mockRejectedValue(new Error('permission store unreachable'));
        const probe = new EntitlementProbe();
        const out = await probe.Explain({ AIAgentID: 'agent-1' }, USER);
        expect(out.Allowed).toBe(false);
        expect(out.Reason).toMatch(/reported as denied/);
    });


});
