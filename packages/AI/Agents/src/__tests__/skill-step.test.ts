/**
 * Unit tests for Skill activation logic (validateSkillNextStep / executeSkillStep and its
 * decomposed sub-methods in base-agent.ts).
 *
 * Mirrors the established pattern in action-changes.test.ts: standalone copies of the pure logic,
 * without instantiating the full BaseAgent class (which requires heavy provider/engine wiring not
 * worth mocking here). Keep these in sync with base-agent.ts if that logic changes.
 */
import { describe, it, expect } from 'vitest';

interface MockSkill {
    ID: string;
    Name: string;
    Instructions: string;
}

interface SkillActivationRequest {
    name: string;
}

// Mirrors BaseAgent.resolveSkillActivations — exact case-insensitive match only (no fuzzy fallback;
// that's validateSkillNextStep's job, upstream of execution).
function resolveSkillActivations(requested: SkillActivationRequest[], availableSkills: MockSkill[]): MockSkill[] {
    const resolved: MockSkill[] = [];
    for (const req of requested) {
        const requestedName = req.name.trim().toLowerCase();
        const match = availableSkills.find(s => s.Name.trim().toLowerCase() === requestedName);
        if (match && !resolved.some(s => s.ID === match.ID)) {
            resolved.push(match);
        }
    }
    return resolved;
}

// Mirrors BaseAgent.buildSkillActivationMessage
function buildSkillActivationMessage(skills: MockSkill[]): string {
    const sections = skills.map(s => `## Skill Activated: ${s.Name}\n\n${s.Instructions}`);
    return `The following skill(s) have been activated. Their instructions are now in effect ` +
        `for the remainder of this run:\n\n${sections.join('\n\n')}`;
}

// Mirrors BaseAgent.validateSkillNextStep's fuzzy-matching missing-skill detection (exact match
// first, then CONTAINS fallback when exactly one candidate matches — same UX as validateActionsNextStep).
function findMissingSkills(requested: SkillActivationRequest[], availableSkills: MockSkill[]): SkillActivationRequest[] {
    return requested.filter(req => {
        const requestedName = req.name.trim().toLowerCase();
        const exactMatch = availableSkills.find(s => s.Name.trim().toLowerCase() === requestedName);
        if (exactMatch) return false;

        const containsMatches = availableSkills.filter(s => s.Name.trim().toLowerCase().includes(requestedName));
        if (containsMatches.length === 1) {
            req.name = containsMatches[0].Name; // fuzzy-corrected in place, mirroring the real method
            return false;
        }
        return true;
    });
}

// Mirrors BaseAgent.enableSkillCapabilities's ActionChange/SubAgentChange construction.
// Scope is 'specific' targeted at the activating agent's own ID so it applies to that agent at
// ANY depth (a 'root'-scoped change would only apply at depth 0) and never cascades to sub-agents.
function buildSkillCapabilityChanges(actionIds: string[], subAgentIds: string[], activatingAgentId: string) {
    const agentIds = [activatingAgentId];
    const actionChanges = actionIds.length > 0
        ? [{ scope: 'specific' as const, mode: 'add' as const, actionIds, agentIds }]
        : [];
    const subAgentChanges = subAgentIds.length > 0
        ? [{ scope: 'specific' as const, mode: 'add' as const, subAgentIds, agentIds }]
        : [];
    return { actionChanges, subAgentChanges };
}

const SKILLS: MockSkill[] = [
    { ID: 's1', Name: 'Report Builder', Instructions: 'Build reports carefully.' },
    { ID: 's2', Name: 'Data Validator', Instructions: 'Validate data rigorously.' },
];

describe('resolveSkillActivations', () => {
    it('resolves an exact case-insensitive name match', () => {
        const result = resolveSkillActivations([{ name: 'report builder' }], SKILLS);
        expect(result).toHaveLength(1);
        expect(result[0].ID).toBe('s1');
    });

    it('resolves multiple requested skills', () => {
        const result = resolveSkillActivations([{ name: 'Report Builder' }, { name: 'Data Validator' }], SKILLS);
        expect(result.map(s => s.ID).sort()).toEqual(['s1', 's2']);
    });

    it('drops unresolvable names silently (validation is upstream)', () => {
        const result = resolveSkillActivations([{ name: 'Nonexistent Skill' }], SKILLS);
        expect(result).toHaveLength(0);
    });

    it('deduplicates when the same skill is requested twice', () => {
        const result = resolveSkillActivations([{ name: 'Report Builder' }, { name: 'report builder' }], SKILLS);
        expect(result).toHaveLength(1);
    });
});

describe('buildSkillActivationMessage', () => {
    it('includes each skill name and its full Instructions', () => {
        const message = buildSkillActivationMessage([SKILLS[0]]);
        expect(message).toContain('Report Builder');
        expect(message).toContain('Build reports carefully.');
    });

    it('concatenates multiple activated skills', () => {
        const message = buildSkillActivationMessage(SKILLS);
        expect(message).toContain('Report Builder');
        expect(message).toContain('Data Validator');
    });
});

describe('findMissingSkills (validateSkillNextStep fuzzy matching)', () => {
    it('finds no missing skills when all requested names match exactly', () => {
        expect(findMissingSkills([{ name: 'Report Builder' }], SKILLS)).toHaveLength(0);
    });

    it('fuzzy-corrects a unique partial match and reports it as not missing', () => {
        const requested = [{ name: 'Report' }];
        const missing = findMissingSkills(requested, SKILLS);
        expect(missing).toHaveLength(0);
        expect(requested[0].name).toBe('Report Builder'); // corrected in place
    });

    it('reports a name with zero matches as missing', () => {
        const missing = findMissingSkills([{ name: 'Nonexistent' }], SKILLS);
        expect(missing).toHaveLength(1);
    });

    it('reports an ambiguous partial match (2+ candidates) as missing rather than guessing', () => {
        const ambiguousSkills: MockSkill[] = [
            { ID: 's1', Name: 'Report Builder', Instructions: '' },
            { ID: 's3', Name: 'Report Formatter', Instructions: '' },
        ];
        const missing = findMissingSkills([{ name: 'Report' }], ambiguousSkills);
        expect(missing).toHaveLength(1);
    });
});

describe('buildSkillCapabilityChanges (enableSkillCapabilities)', () => {
    it('produces a specific-scoped add ActionChange targeting the activating agent', () => {
        const { actionChanges } = buildSkillCapabilityChanges(['act1', 'act2'], [], 'agent-1');
        expect(actionChanges).toEqual([{ scope: 'specific', mode: 'add', actionIds: ['act1', 'act2'], agentIds: ['agent-1'] }]);
    });

    it('produces a specific-scoped add SubAgentChange targeting the activating agent', () => {
        const { subAgentChanges } = buildSkillCapabilityChanges([], ['sa1'], 'agent-1');
        expect(subAgentChanges).toEqual([{ scope: 'specific', mode: 'add', subAgentIds: ['sa1'], agentIds: ['agent-1'] }]);
    });

    it('produces no changes for a skill with neither actions nor sub-agents', () => {
        const { actionChanges, subAgentChanges } = buildSkillCapabilityChanges([], [], 'agent-1');
        expect(actionChanges).toEqual([]);
        expect(subAgentChanges).toEqual([]);
    });

    it('targets the activating agent by ID so activation applies at any depth but never cascades to sub-agents', () => {
        // 'specific'/[agent.ID] applies to exactly the activating agent (unlike 'root', which only
        // applies at depth 0 and would silently skip a sub-agent that activates a skill).
        // filterActionChangesForSubAgent propagates 'specific' as-is; each child checks
        // includes(itsOwnID) -> false, so the grant never leaks downward.
        const { actionChanges } = buildSkillCapabilityChanges(['act1'], [], 'sub-agent-7');
        expect(actionChanges[0].scope).toBe('specific');
        expect(actionChanges[0].agentIds).toEqual(['sub-agent-7']);
    });
});

// Mirrors BaseAgent.preActivateRequestedSkills's guard: intersect the caller's requested skill IDs
// with the set GetSkillsForAgent(agent, user) already narrowed (agent-accepted ∩ user-run-permitted),
// then drop any already active this run. `allowedSkills` stands in for that pre-guarded set, so a
// requested ID absent from it (agent doesn't accept it OR the user can't run it) is silently dropped.
function selectPreActivations(requestedIds: string[], allowedSkills: MockSkill[], alreadyActivatedIds: string[]): MockSkill[] {
    return allowedSkills.filter(
        s => requestedIds.includes(s.ID) && !alreadyActivatedIds.includes(s.ID)
    );
}

describe('preActivateRequestedSkills (requested-skill guard)', () => {
    it('activates a requested skill that is in the agent-accepted ∩ user-permitted set', () => {
        const result = selectPreActivations(['s1'], SKILLS, []);
        expect(result.map(s => s.ID)).toEqual(['s1']);
    });

    it('silently drops a requested ID not in the allowed set (agent rejects it OR user lacks Run permission)', () => {
        // 's9' is requested but not present in the guarded `allowedSkills` — never surfaced.
        const result = selectPreActivations(['s1', 's9'], SKILLS, []);
        expect(result.map(s => s.ID)).toEqual(['s1']);
    });

    it('drops a requested ID for a skill that is already active this run (no duplicate activation)', () => {
        const result = selectPreActivations(['s1', 's2'], SKILLS, ['s1']);
        expect(result.map(s => s.ID)).toEqual(['s2']);
    });

    it('returns nothing when no requested IDs survive the guard', () => {
        expect(selectPreActivations(['s9'], SKILLS, [])).toHaveLength(0);
        expect(selectPreActivations([], SKILLS, [])).toHaveLength(0);
    });
});

// Mirrors BaseAgent.notifyDroppedSkillRequests: requested IDs absent from the guarded allowed set
// are surfaced (warning log + injected system note) instead of vanishing. The reason text branches
// on the agent's AcceptsSkills value: 'None' (agent opts out entirely) vs anything else (skill not
// Active / not assigned under 'Limited' / user lacks Run permission). Note that dropped-detection
// ignores the already-activated list — re-requesting an ACTIVE skill is a harmless no-op, not a drop.
function selectDroppedRequests(requestedIds: string[], allowedSkills: MockSkill[]): string[] {
    return requestedIds.filter(id => !allowedSkills.some(s => s.ID === id));
}
function droppedReasonKind(acceptsSkills: string): 'agent-opts-out' | 'not-available' {
    return acceptsSkills === 'None' ? 'agent-opts-out' : 'not-available';
}

describe('notifyDroppedSkillRequests (dropped-request detection)', () => {
    it('flags a requested ID that is not in the allowed set', () => {
        expect(selectDroppedRequests(['s1', 's9'], SKILLS)).toEqual(['s9']);
    });

    it('flags every requested ID when the agent accepts no skills (empty allowed set)', () => {
        expect(selectDroppedRequests(['s1', 's2'], [])).toEqual(['s1', 's2']);
    });

    it('flags nothing when all requested IDs are allowed', () => {
        expect(selectDroppedRequests(['s1', 's2'], SKILLS)).toEqual([]);
        expect(selectDroppedRequests([], SKILLS)).toEqual([]);
    });

    it('does NOT flag a re-request of an already-active allowed skill (idempotent no-op, not a drop)', () => {
        // 's1' already active: selectPreActivations skips it, but it is still in the allowed set,
        // so dropped-detection must not report it.
        expect(selectPreActivations(['s1'], SKILLS, ['s1'])).toHaveLength(0);
        expect(selectDroppedRequests(['s1'], SKILLS)).toEqual([]);
    });

    it("selects the agent-opts-out reason only for AcceptsSkills='None'", () => {
        expect(droppedReasonKind('None')).toBe('agent-opts-out');
        expect(droppedReasonKind('All')).toBe('not-available');
        expect(droppedReasonKind('Limited')).toBe('not-available');
    });
});

// =============================================================================
// v5.45 — Skill Activation Governance & Observability
// =============================================================================

interface MockGatedSkill extends MockSkill {
    ActivationMode: string;
}
interface MockGatedAgent {
    ID: string;
    AcceptsSkills: string;
    SkillActivationMode: string;
}
interface MockInvocation {
    SkillID: string;
    SkillName: string;
    ActivationType: 'requested' | 'auto';
    Provenance: {
        AgentAcceptsSkills: string;
        SkillActivationMode: string;
        AgentSkillActivationMode: string;
        RequestedBy: 'user-request' | 'agent-decision';
    };
    Reason?: string;
}

// Mirrors AIEngineBase.GetAutoActivatableSkillsForAgent's double gate as consumed by
// validateSkillNextStep / resolveSkillActivations / the prompt catalog: self-activation
// requires 'Auto' on BOTH the agent AND the skill, on top of the availability set.
function selectAutoActivatable(agent: MockGatedAgent, availableSkills: MockGatedSkill[]): MockGatedSkill[] {
    if (agent.SkillActivationMode !== 'Auto') return [];
    return availableSkills.filter(s => s.ActivationMode === 'Auto');
}

// Mirrors BaseAgent.buildSkillInvocation.
function buildSkillInvocation(
    skill: MockGatedSkill,
    agent: MockGatedAgent,
    activationType: 'requested' | 'auto',
    reason?: string
): MockInvocation {
    return {
        SkillID: skill.ID,
        SkillName: skill.Name,
        ActivationType: activationType,
        Provenance: {
            AgentAcceptsSkills: agent.AcceptsSkills,
            SkillActivationMode: skill.ActivationMode,
            AgentSkillActivationMode: agent.SkillActivationMode,
            RequestedBy: activationType === 'requested' ? 'user-request' : 'agent-decision'
        },
        ...(reason ? { Reason: reason } : {})
    };
}

// Mirrors BaseAgent.getSkillAttributionForAction: native grants take precedence (undefined =
// "the agent had this tool anyway"); otherwise the invocations whose skill bundles the action.
function attributeAction(
    actionId: string,
    invocations: MockInvocation[],
    nativeActionIds: string[],
    skillActionBundles: Record<string, string[]>
): MockInvocation[] | undefined {
    if (invocations.length === 0 || !actionId) return undefined;
    if (nativeActionIds.includes(actionId)) return undefined;
    const granting = invocations.filter(inv => (skillActionBundles[inv.SkillID] ?? []).includes(actionId));
    return granting.length > 0 ? granting : undefined;
}

// Mirrors the validateSkillNextStep plan-phase pre-check: agent-initiated activations are only
// legal BEFORE plan approval so the reviewed plan always reflects the widened tool surface.
function planPhaseBlocksSkillActivation(planModeActive: boolean, planApproved: boolean): boolean {
    return planModeActive && planApproved;
}

// Mirrors createStepEntity's Skills default: Prompt steps carry everything currently in effect;
// other step types only carry what the caller attributes explicitly.
function skillsForStep(
    stepType: string,
    explicit: MockInvocation[] | undefined,
    inEffect: MockInvocation[]
): MockInvocation[] | undefined {
    const result = explicit ?? (stepType === 'Prompt' && inEffect.length > 0 ? inEffect : undefined);
    return result && result.length > 0 ? result : undefined;
}

const GATED_SKILLS: MockGatedSkill[] = [
    { ID: 's1', Name: 'Web Research', Instructions: 'Research well.', ActivationMode: 'Auto' },
    { ID: 's2', Name: 'Communications', Instructions: 'Confirm before sending.', ActivationMode: 'RequestedOnly' },
];
const AUTO_AGENT: MockGatedAgent = { ID: 'a1', AcceptsSkills: 'All', SkillActivationMode: 'Auto' };
const RESTRICTED_AGENT: MockGatedAgent = { ID: 'a2', AcceptsSkills: 'All', SkillActivationMode: 'RequestedOnly' };

describe('double activation gate (self-activation eligibility)', () => {
    it('Auto agent × Auto skill → self-activatable', () => {
        expect(selectAutoActivatable(AUTO_AGENT, GATED_SKILLS).map(s => s.ID)).toEqual(['s1']);
    });

    it('RequestedOnly agent → nothing self-activatable, even Auto skills', () => {
        expect(selectAutoActivatable(RESTRICTED_AGENT, GATED_SKILLS)).toHaveLength(0);
    });

    it('RequestedOnly skill never self-activatable, even for an Auto agent', () => {
        const onlyRequested = GATED_SKILLS.filter(s => s.ID === 's2');
        expect(selectAutoActivatable(AUTO_AGENT, onlyRequested)).toHaveLength(0);
    });

    it('empty availability set stays empty regardless of gate posture', () => {
        expect(selectAutoActivatable(AUTO_AGENT, [])).toHaveLength(0);
    });
});

describe('buildSkillInvocation (provenance of authority)', () => {
    it('captures the gate values in effect at activation time', () => {
        const inv = buildSkillInvocation(GATED_SKILLS[0], AUTO_AGENT, 'auto', 'need web data');
        expect(inv.Provenance).toEqual({
            AgentAcceptsSkills: 'All',
            SkillActivationMode: 'Auto',
            AgentSkillActivationMode: 'Auto',
            RequestedBy: 'agent-decision'
        });
        expect(inv.Reason).toBe('need web data');
    });

    it("maps 'requested' to RequestedBy='user-request' and omits Reason when none given", () => {
        const inv = buildSkillInvocation(GATED_SKILLS[1], RESTRICTED_AGENT, 'requested');
        expect(inv.ActivationType).toBe('requested');
        expect(inv.Provenance.RequestedBy).toBe('user-request');
        expect('Reason' in inv).toBe(false);
    });

    it('records the skill identity as of activation (ID + Name)', () => {
        const inv = buildSkillInvocation(GATED_SKILLS[0], AUTO_AGENT, 'auto');
        expect(inv.SkillID).toBe('s1');
        expect(inv.SkillName).toBe('Web Research');
    });
});

describe('getSkillAttributionForAction (native precedence)', () => {
    const invocations = [buildSkillInvocation(GATED_SKILLS[0], AUTO_AGENT, 'auto')];
    const bundles = { s1: ['act-search', 'act-summarize'] };

    it('attributes a skill-granted action to its invocation(s)', () => {
        const result = attributeAction('act-search', invocations, [], bundles);
        expect(result).toHaveLength(1);
        expect(result![0].SkillID).toBe('s1');
    });

    it('returns undefined (native) when the agent has the action natively — even if a skill also bundles it', () => {
        expect(attributeAction('act-search', invocations, ['act-search'], bundles)).toBeUndefined();
    });

    it('returns undefined when no activated skill bundles the action', () => {
        expect(attributeAction('act-unrelated', invocations, [], bundles)).toBeUndefined();
    });

    it('returns undefined when no skills are active at all', () => {
        expect(attributeAction('act-search', [], [], bundles)).toBeUndefined();
    });
});

describe('plan-phase skill activation rule', () => {
    it('allows activation before the plan is approved (plan reflects the widened surface)', () => {
        expect(planPhaseBlocksSkillActivation(true, false)).toBe(false);
    });

    it('BLOCKS agent-initiated activation after plan approval (re-plan required)', () => {
        expect(planPhaseBlocksSkillActivation(true, true)).toBe(true);
    });

    it('never blocks outside plan mode', () => {
        expect(planPhaseBlocksSkillActivation(false, false)).toBe(false);
        expect(planPhaseBlocksSkillActivation(false, true)).toBe(false);
    });
});

describe('per-step Skills population (createStepEntity default)', () => {
    const inEffect = [buildSkillInvocation(GATED_SKILLS[0], AUTO_AGENT, 'requested')];

    it('Prompt steps default to the full set of skills in effect', () => {
        expect(skillsForStep('Prompt', undefined, inEffect)).toEqual(inEffect);
    });

    it('Prompt steps carry nothing when no skills are active (Skills stays NULL)', () => {
        expect(skillsForStep('Prompt', undefined, [])).toBeUndefined();
    });

    it('non-Prompt steps carry nothing unless the caller attributes explicitly', () => {
        expect(skillsForStep('Actions', undefined, inEffect)).toBeUndefined();
        expect(skillsForStep('Actions', inEffect, [])).toEqual(inEffect);
    });

    it('an explicit empty attribution collapses to undefined (never persist "[]")', () => {
        expect(skillsForStep('Actions', [], inEffect)).toBeUndefined();
    });
});

describe('skillActivations reason threading (LoopAgentType mapping)', () => {
    // Mirrors loop-agent-type.ts: response.nextStep.skills → retVal.skillActivations
    function mapSkills(skills: Array<{ name: string; reason?: string }>) {
        return skills.map(skill => ({ name: skill.name, ...(skill.reason ? { reason: skill.reason } : {}) }));
    }

    it('carries the reason through when the model supplies one', () => {
        expect(mapSkills([{ name: 'Web Research', reason: 'user asked for current dates' }]))
            .toEqual([{ name: 'Web Research', reason: 'user asked for current dates' }]);
    });

    it('omits the reason key entirely when absent', () => {
        const mapped = mapSkills([{ name: 'Web Research' }]);
        expect(mapped).toEqual([{ name: 'Web Research' }]);
        expect('reason' in mapped[0]).toBe(false);
    });
});

// =============================================================================
// v5.45 regression — skill-granted sub-agent EXECUTION resolution
// (Live incident: Research Agent looped 36+ turns re-picking the skill-granted
// Infographic Agent because the prompt/validation used the runtime-effective
// sub-agent set while resolveSubAgentByName only checked ParentID children +
// relationship rows. Execution must resolve from the SAME effective set.)
// =============================================================================

interface MockResolveAgent { ID: string; Name: string; Status: string; ParentID?: string | null }
interface MockRelationship { AgentID: string; SubAgentID: string; Status: string }

// Mirrors BaseAgent.resolveSubAgentByName's three-branch resolution:
// 1) ParentID children, 2) Active relationships, 3) runtime-effective set (skill/caller granted).
function resolveSubAgent(
    name: string,
    agentId: string,
    allAgents: MockResolveAgent[],
    relationships: MockRelationship[],
    effectiveSubAgents: MockResolveAgent[]
): { subAgent: MockResolveAgent; relationship?: MockRelationship } | undefined {
    const normalized = name.trim().toLowerCase();
    const child = allAgents.find(a => a.ParentID === agentId && a.Status === 'Active' && a.Name.trim().toLowerCase() === normalized);
    if (child) return { subAgent: child };
    for (const rel of relationships.filter(r => r.AgentID === agentId && r.Status === 'Active')) {
        const related = allAgents.find(a => a.ID === rel.SubAgentID && a.Status === 'Active' && a.Name.trim().toLowerCase() === normalized);
        if (related) return { subAgent: related, relationship: rel };
    }
    const effective = effectiveSubAgents.find(a => a.Status === 'Active' && a.Name.trim().toLowerCase() === normalized);
    if (effective) return { subAgent: effective };
    return undefined;
}

describe('resolveSubAgentByName (execution resolution incl. skill-granted sub-agents)', () => {
    const ROOT = 'root-1';
    const AGENTS: MockResolveAgent[] = [
        { ID: 'c1', Name: 'Child Agent', Status: 'Active', ParentID: ROOT },
        { ID: 'r1', Name: 'Related Agent', Status: 'Active', ParentID: null },
        { ID: 'g1', Name: 'Infographic Agent', Status: 'Active', ParentID: 'someone-else' },
    ];
    const RELS: MockRelationship[] = [{ AgentID: ROOT, SubAgentID: 'r1', Status: 'Active' }];
    const EFFECTIVE: MockResolveAgent[] = [
        AGENTS[0], AGENTS[1],
        { ID: 'g1', Name: 'Infographic Agent', Status: 'Active', ParentID: 'someone-else' }, // skill-granted
    ];

    it('resolves a ParentID child (no relationship)', () => {
        const r = resolveSubAgent('Child Agent', ROOT, AGENTS, RELS, EFFECTIVE);
        expect(r?.subAgent.ID).toBe('c1');
        expect(r?.relationship).toBeUndefined();
    });

    it('resolves a related sub-agent WITH its relationship (dispatch semantics preserved)', () => {
        const r = resolveSubAgent('Related Agent', ROOT, AGENTS, RELS, EFFECTIVE);
        expect(r?.subAgent.ID).toBe('r1');
        expect(r?.relationship).toBeDefined();
    });

    it('REGRESSION: resolves a skill-granted sub-agent from the effective set (child-style, no relationship)', () => {
        const r = resolveSubAgent('Infographic Agent', ROOT, AGENTS, RELS, EFFECTIVE);
        expect(r?.subAgent.ID).toBe('g1');
        expect(r?.relationship).toBeUndefined();
    });

    it('returns undefined for a name in no set — the caller Retries with the available-names hint', () => {
        expect(resolveSubAgent('Nonexistent Agent', ROOT, AGENTS, RELS, EFFECTIVE)).toBeUndefined();
    });

    it('does not resolve an Inactive agent from any branch', () => {
        const inactiveEff = [{ ID: 'g2', Name: 'Retired Agent', Status: 'Disabled', ParentID: null }];
        expect(resolveSubAgent('Retired Agent', ROOT, AGENTS, RELS, inactiveEff)).toBeUndefined();
    });

    it('is case- and whitespace-insensitive across all three branches', () => {
        expect(resolveSubAgent('  infographic agent ', ROOT, AGENTS, RELS, EFFECTIVE)?.subAgent.ID).toBe('g1');
    });
});

describe('execution-path not-found is BOUNDED (no infinite delegation loops)', () => {
    // Mirrors the fixed executeSubAgentStep failure handling: each unresolvable request
    // increments the shared validation-retry counter, so MAX_VALIDATION_RETRIES caps the loop.
    function simulateLoop(maxRetries: number, resolves: boolean): { attempts: number; failed: boolean } {
        let counter = 0;
        let attempts = 0;
        while (counter < maxRetries) {
            attempts++;
            if (resolves) return { attempts, failed: false };
            counter++; // the fix: unresolvable execution increments the shared counter
        }
        return { attempts, failed: true };
    }

    it('an unresolvable sub-agent fails the run at the retry cap instead of looping forever', () => {
        const r = simulateLoop(10, false);
        expect(r.failed).toBe(true);
        expect(r.attempts).toBe(10); // pre-fix this was unbounded (observed 36+ live)
    });

    it('a resolvable sub-agent executes on the first attempt (counter untouched)', () => {
        const r = simulateLoop(10, true);
        expect(r.failed).toBe(false);
        expect(r.attempts).toBe(1);
    });
});
