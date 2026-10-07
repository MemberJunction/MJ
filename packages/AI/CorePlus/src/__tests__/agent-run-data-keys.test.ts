/**
 * The reserved run-data keys — the `ExecuteAgentParams.data` keys that change what an agent run is — and the pure
 * removal both the server's agent-run resolvers and BaseAgent's sub-agent build apply to less-trusted data.
 */
import { describe, it, expect } from 'vitest';
import { RESERVED_AGENT_RUN_DATA_KEYS, WithoutReservedAgentRunDataKeys } from '../agent-run-data-keys';

describe('RESERVED_AGENT_RUN_DATA_KEYS', () => {
    it('names the scope family and the agent-type parameter layer', () => {
        expect([...RESERVED_AGENT_RUN_DATA_KEYS]).toEqual([
            'PrimaryScopeEntityName',
            'PrimaryScopeEntityID',
            'PrimaryScopeRecordID',
            'SecondaryScopes',
            '__agentTypePromptParams',
        ]);
    });
});

describe('WithoutReservedAgentRunDataKeys', () => {
    it('removes every reserved key, keeps the rest, and reports what it removed in list order', () => {
        const data = { __agentTypePromptParams: {}, topic: 'refunds', PrimaryScopeRecordID: 'org-1', SecondaryScopes: { Region: 'US' } };
        const result = WithoutReservedAgentRunDataKeys(data);
        expect(result.Data).toEqual({ topic: 'refunds' });
        expect(result.StrippedKeys).toEqual(['PrimaryScopeRecordID', 'SecondaryScopes', '__agentTypePromptParams']);
    });

    it('never mutates its input', () => {
        const data = { PrimaryScopeRecordID: 'org-1', topic: 'refunds' };
        WithoutReservedAgentRunDataKeys(data);
        expect(data).toEqual({ PrimaryScopeRecordID: 'org-1', topic: 'refunds' });
    });

    it('returns the input itself when there is nothing to remove', () => {
        const data = { topic: 'refunds' };
        const result = WithoutReservedAgentRunDataKeys(data);
        expect(result.Data).toBe(data);
        expect(result.StrippedKeys).toEqual([]);
    });

    it('removes a reserved key even when its value is empty or null (presence is what matters)', () => {
        const result = WithoutReservedAgentRunDataKeys({ PrimaryScopeRecordID: null, SecondaryScopes: '' });
        expect(result.Data).toEqual({});
        expect(result.StrippedKeys).toEqual(['PrimaryScopeRecordID', 'SecondaryScopes']);
    });

    it('matches keys exactly: only top-level, case-sensitive names are read by the agent framework', () => {
        const result = WithoutReservedAgentRunDataKeys({ primaryScopeRecordID: 'org-1', nested: { PrimaryScopeRecordID: 'org-2' } });
        expect(result.StrippedKeys).toEqual([]);
    });
});
