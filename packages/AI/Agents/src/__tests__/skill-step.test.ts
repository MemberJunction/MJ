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
