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
import { describe, it, expect, vi } from 'vitest';

// The explain path now mirrors the action's skill gate, so it needs the same engine call. Only this
// file is affected — vi.mock is per-file.
const skillsForAgentSpy = vi.fn(() => [{ ID: 'skill-1', Name: 'Test Skill' }]);
const agentPermsSpy = vi.fn(async () => ({ canView: true, canRun: true, canEdit: false, canDelete: false, isOwner: false }));
vi.mock('@memberjunction/aiengine', () => ({
    AIEngine: {
        Instance: {
            Config: async () => undefined,
            GetSkillsForAgent: (...args: unknown[]) => skillsForAgentSpy(...(args as [])),
            GetUserAgentPermissions: (...args: unknown[]) => agentPermsSpy(...(args as [])),
        },
    },
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
            return this.explainEntitlement('scope-1', input, user);
        }
    }

    it('reports a skill the agent cannot activate as DENIED, not as a grant', async () => {
        skillsForAgentSpy.mockReturnValue([]);
        const out = await new EntitlementProbe().Explain(
            { AIAgentID: 'agent-1', AISkillID: 'skill-1' }, USER);
        expect(out.Allowed).toBe(false);
        // A distinct Source, not 'NoGrant'. 'NoGrant' means "no applicable row found"; an audit
        // reader could not otherwise tell a principal rejection from an absent grant.
        expect(out.Source).toBe('PrincipalNotActivatable');
        expect(out.Reason).toContain('not activatable');
        // and it still records what was asked for, so the denial is diagnosable
        expect(out.Principals.SkillID).toBe('skill-1');
    });

    it('refuses a principal id that will not load, as the action does', async () => {
        // The gates sit behind `if (agent)` / `if (skill)`, so a null principal used to skip them
        // and the explanation reported whatever the user's own grants gave — while the action
        // refuses the same input outright. That is the drift this mirroring exists to remove.
        class NullLoadProbe extends SearchEngine {
            protected override async loadPrincipal<T extends MJAIAgentEntity | MJAISkillEntity>(
            ): Promise<T | null> { return null; }
            public Explain(input: { AIAgentID?: string; AISkillID?: string }, user: UserInfo) {
                return this.explainEntitlement('scope-1', input, user);
            }
        }
        const out = await new NullLoadProbe().Explain({ AIAgentID: 'agent-1' }, USER);
        expect(out.Allowed).toBe(false);
        expect(out.Source).toBe('PrincipalNotActivatable');
        expect(out.Reason).toContain('could not be loaded');
    });

    it('says a skill needs an agent, rather than blaming an agent nobody supplied', async () => {
        // GetSkillsForAgent(null) returns [], so a skill-only explain used to come back
        // "not activatable by this agent" with no agent anywhere in the input.
        const out = await new EntitlementProbe().Explain({ AISkillID: 'skill-1' }, USER);
        expect(out.Allowed).toBe(false);
        expect(out.Source).toBe('PrincipalNotActivatable');
        expect(out.Reason).toContain('AIAgentID is required');
    });

    it('reports an agent the user cannot run as DENIED', async () => {
        agentPermsSpy.mockResolvedValue({ canView: true, canRun: false, canEdit: false, canDelete: false, isOwner: false });
        const out = await new EntitlementProbe().Explain({ AIAgentID: 'agent-1' }, USER);
        expect(out.Allowed).toBe(false);
        expect(out.Reason).toContain('not runnable');
        agentPermsSpy.mockResolvedValue({ canView: true, canRun: true, canEdit: false, canDelete: false, isOwner: false });
    });

    it('does not bind a refused principal into dimension resolution', async () => {
        // deriveServerValue binds Principals.SkillID into server-authored SQL. Explaining with a
        // skill the gate just refused must not parameterise that query with it — the action refuses
        // outright rather than "continuing with a null skill", and the preview must not be laxer.
        skillsForAgentSpy.mockReturnValue([]);          // skill is NOT activatable -> denied
        const seen: Array<{ AgentID: string | null; SkillID: string | null }> = [];
        const scope = scopeWith(null);

        class BindProbe extends SearchEngine {
            protected override get Base() {
                return { GetScopeBundle: () => ({ Scope: scope, ExternalIndexes: [], Entities: [], StorageAccounts: [] }),
                         GetActiveScopeByID: () => scope } as unknown as ReturnType<() => never>;
            }
            protected override get dimensionResolver() {
                return { Resolve: async (a: { Principals?: { AgentID: string | null; SkillID: string | null } }) => {
                    seen.push(a.Principals ?? { AgentID: null, SkillID: null });
                    return { Context: {}, Provenance: [], Diagnostics: [] };
                } } as unknown as ReturnType<() => never>;
            }
            protected override async loadPrincipal<T extends MJAIAgentEntity | MJAISkillEntity>(
                _entityName: string, id: string | null | undefined
            ): Promise<T | null> {
                return id ? ({ ID: id, Name: id } as unknown as T) : null;
            }
        }

        const out = await new BindProbe().ExplainScope(
            { ScopeIDs: ['scope-1'], AIAgentID: 'agent-1', AISkillID: 'skill-1' }, USER);
        expect(seen).toHaveLength(1);
        expect(seen[0].SkillID).toBeNull();
        expect(seen[0].AgentID).toBeNull();
        expect(out[0].Diagnostics.join(' ')).toContain('NOT bound into dimension resolution');
        skillsForAgentSpy.mockReturnValue([{ ID: 'skill-1', Name: 'Test Skill' }]);
    });

    it('lets an activatable skill through to the permission resolver', async () => {
        skillsForAgentSpy.mockReturnValue([{ ID: 'skill-1', Name: 'Test Skill' }]);
        const out = await new EntitlementProbe().Explain(
            { AIAgentID: 'agent-1', AISkillID: 'skill-1' }, USER);
        // No resolver is configured in this harness, so it lands in the fail-closed catch — the
        // point is that it got PAST the gate rather than being stopped by it.
        expect(out.Reason).not.toContain('not activatable');
    });
});

describe('validatePrincipals — the one place a principal is judged', () => {
    // This policy used to live in the Scoped Search action. It moved onto the engine because
    // Search() has seven callers — three GraphQL resolvers, two actions, the pre-execution RAG
    // path — and a gate in one of them is a gate the other six route around. ExplainScope needing
    // its own copy was the tell.
    class PrincipalProbe extends SearchEngine {
        protected override async loadPrincipal<T extends MJAIAgentEntity | MJAISkillEntity>(
            _entityName: string, id: string | null | undefined
        ): Promise<T | null> {
            return id === 'missing' ? null : (id ? ({ ID: id, Name: id } as unknown as T) : null);
        }
        public Check(input: { AIAgentID?: string; AISkillID?: string }, user: UserInfo) {
            return this.validatePrincipals(input, user);
        }
    }
    const allow = () => { agentPermsSpy.mockResolvedValue({ canView: true, canRun: true, canEdit: false, canDelete: false, isOwner: false });
                          skillsForAgentSpy.mockReturnValue([{ ID: 'skill-1', Name: 'Test Skill' }]); };

    it('passes when the caller may wield both principals', async () => {
        allow();
        const r = await new PrincipalProbe().Check({ AIAgentID: 'agent-1', AISkillID: 'skill-1' }, USER);
        expect(r.ok).toBe(true);
    });

    it('refuses an agent the user cannot run', async () => {
        allow();
        agentPermsSpy.mockResolvedValue({ canView: true, canRun: false, canEdit: false, canDelete: false, isOwner: false });
        const r = await new PrincipalProbe().Check({ AIAgentID: 'agent-1' }, USER);
        expect(r.ok).toBe(false);
        if (r.ok === false) expect(r.reason).toContain('not runnable');
    });

    it('refuses a skill the agent cannot activate — AgentUnscopedAll/SkillUnscopedAll GRANT', async () => {
        allow();
        skillsForAgentSpy.mockReturnValue([]);
        const r = await new PrincipalProbe().Check({ AIAgentID: 'agent-1', AISkillID: 'skill-1' }, USER);
        expect(r.ok).toBe(false);
        if (r.ok === false) expect(r.reason).toContain('not activatable');
    });

    it('refuses a supplied id that will not load, rather than treating it as absent', async () => {
        allow();
        const r = await new PrincipalProbe().Check({ AIAgentID: 'missing' }, USER);
        expect(r.ok).toBe(false);
        if (r.ok === false) expect(r.reason).toContain('could not be loaded');
    });

    it('refuses a skill with no agent, because a skill is judged relative to one', async () => {
        allow();
        const r = await new PrincipalProbe().Check({ AISkillID: 'skill-1' }, USER);
        expect(r.ok).toBe(false);
        if (r.ok === false) expect(r.reason).toContain('AIAgentID is required');
    });
});
