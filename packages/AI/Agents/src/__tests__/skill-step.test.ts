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
function buildSkillCapabilityChanges(actionIds: string[], subAgentIds: string[]) {
    const actionChanges = actionIds.length > 0
        ? [{ scope: 'root' as const, mode: 'add' as const, actionIds }]
        : [];
    const subAgentChanges = subAgentIds.length > 0
        ? [{ scope: 'root' as const, mode: 'add' as const, subAgentIds }]
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
    it('produces a root-scoped add ActionChange when the skill bundles actions', () => {
        const { actionChanges } = buildSkillCapabilityChanges(['act1', 'act2'], []);
        expect(actionChanges).toEqual([{ scope: 'root', mode: 'add', actionIds: ['act1', 'act2'] }]);
    });

    it('produces a root-scoped add SubAgentChange when the skill bundles sub-agents', () => {
        const { subAgentChanges } = buildSkillCapabilityChanges([], ['sa1']);
        expect(subAgentChanges).toEqual([{ scope: 'root', mode: 'add', subAgentIds: ['sa1'] }]);
    });

    it('produces no changes for a skill with neither actions nor sub-agents', () => {
        const { actionChanges, subAgentChanges } = buildSkillCapabilityChanges([], []);
        expect(actionChanges).toEqual([]);
        expect(subAgentChanges).toEqual([]);
    });

    it('uses root scope specifically so activation does NOT propagate to sub-agents', () => {
        // 'root' scope means: applies only to the activating agent; filterActionChangesForSubAgent
        // explicitly drops 'root'-scoped changes when propagating to a child agent.
        const { actionChanges } = buildSkillCapabilityChanges(['act1'], []);
        expect(actionChanges[0].scope).toBe('root');
    });
});
