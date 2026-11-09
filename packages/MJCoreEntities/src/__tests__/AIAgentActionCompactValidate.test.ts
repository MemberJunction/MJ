import { describe, it, expect } from 'vitest';
import { EntityInfo } from '@memberjunction/core';
import { MJAIAgentActionEntity } from '../generated/entities/__mj';

/**
 * `MJAIAgentActionEntity.Validate()` runs the CHECK constraints on result expiration in code. Two of
 * them meet on `Compact`: CK_AIAgentAction_CompactModeRequired (Compact needs a CompactMode) and
 * CK_AIAgentAction_CompactSettingsOnlyWhenCompact (the compact settings only belong on a Compact
 * row). MJ#6421: the generated validator for the second one was inverted, so no Compact row could
 * be saved.
 */

const NUMERIC_FIELDS = new Set(['MinExecutionsPerRun', 'MaxExecutionsPerRun', 'ResultExpirationTurns', 'CompactLength']);
const AGENT_ACTION_FIELDS = [
    'ID', 'AgentID', 'ActionID', 'Status', 'MinExecutionsPerRun', 'MaxExecutionsPerRun', 'ResultExpirationTurns',
    'ResultExpirationMode', 'CompactMode', 'CompactLength', 'CompactPromptID',
];

/** Every column is nullable, so the base field checks pass and only the entity's own validators can fail. */
function agentActionEntityInfo(): EntityInfo {
    return new EntityInfo({
        ID: 'ai-agent-actions',
        Name: 'MJ: AI Agent Actions',
        Status: 'Active',
        EntityFields: AGENT_ACTION_FIELDS.map((name, i) => ({
            ID: `f-${name}`,
            EntityID: 'ai-agent-actions',
            Name: name,
            Type: NUMERIC_FIELDS.has(name) ? 'int' : 'nvarchar',
            Length: NUMERIC_FIELDS.has(name) ? 4 : 510,
            AllowsNull: true,
            IsPrimaryKey: name === 'ID',
            AllowUpdateAPI: true,
            ValueListType: 'None',
            Sequence: i + 1,
            Status: 'Active',
            EntityFieldValues: [],
        })),
        EntityPermissions: [],
        EntityRelationships: [],
        EntitySettings: [],
    });
}

function row(mode: 'None' | 'Remove' | 'Compact'): MJAIAgentActionEntity {
    const r = new MJAIAgentActionEntity(agentActionEntityInfo());
    r.Status = 'Active';
    r.ResultExpirationMode = mode;
    r.ResultExpirationTurns = mode === 'None' ? null : 1;
    return r;
}

describe('MJAIAgentActionEntity.Validate: result expiration', () => {
    it('passes a Compact row with its compact settings', () => {
        const r = row('Compact');
        r.CompactMode = 'First N Chars';
        r.CompactLength = 2000;
        const result = r.Validate();
        expect(result.Errors).toEqual([]);
        expect(result.Success).toBe(true);
    });

    it('fails a Compact row with no CompactMode, naming CompactMode', () => {
        expect(row('Compact').Validate().Errors.map(e => e.Source)).toEqual(['CompactMode']);
    });

    it('passes Remove and None rows with no compact settings', () => {
        expect(row('Remove').Validate().Errors).toEqual([]);
        expect(row('None').Validate().Errors).toEqual([]);
    });

    it('fails a Remove row that sets compact settings, naming ResultExpirationMode', () => {
        const r = row('Remove');
        r.CompactMode = 'First N Chars';
        r.CompactLength = 2000;
        expect(r.Validate().Errors.map(e => e.Source)).toEqual(['ResultExpirationMode']);
    });
});
