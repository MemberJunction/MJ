/**
 * The reserved run-data keys — the `ExecuteAgentParams.data` keys that change what an agent run is — the pure
 * removal BaseAgent's sub-agent build applies to model-authored template parameters, and the trust rule
 * (`ExecuteAgentParams.TrustReservedRunData`) `BaseAgent.Execute` applies to every run's `data`.
 */
import { describe, it, expect } from 'vitest';
import { RESERVED_AGENT_RUN_DATA_KEYS, WithAgentRunDataTrustApplied, WithoutReservedAgentRunDataKeys } from '../agent-run-data-keys';
import type { ExecuteAgentParams, MJAIAgentEntityExtended } from '../index';

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

describe('WithAgentRunDataTrustApplied', () => {
    const TENANT = 'aaaaaaaa-0000-4000-8000-0000000000a7';
    const reservedData = (): Record<string, unknown> => ({
        topic: 'refunds',
        conversationId: 'conv-1',
        PrimaryScopeEntityName: 'Organizations',
        PrimaryScopeRecordID: TENANT,
        SecondaryScopes: { Region: 'EMEA' },
        __agentTypePromptParams: { enableTaskGraphs: true },
    });
    const runParams = (extra: Partial<ExecuteAgentParams> = {}): ExecuteAgentParams => ({
        agent: { ID: 'agent-1', Name: 'Agent' } as unknown as MJAIAgentEntityExtended,
        conversationMessages: [{ role: 'user', content: 'hello' }],
        PrimaryScopeRecordID: 'explicit-tenant',
        ...extra,
    });

    it('drops the reserved keys from data when the caller did not set TrustReservedRunData', () => {
        const result = WithAgentRunDataTrustApplied(runParams({ data: reservedData() }));
        expect(result.Params.data).toEqual({ topic: 'refunds', conversationId: 'conv-1' });
        expect(result.StrippedKeys).toEqual(['PrimaryScopeEntityName', 'PrimaryScopeRecordID', 'SecondaryScopes', '__agentTypePromptParams']);
    });

    it('drops them when TrustReservedRunData is anything but true', () => {
        const result = WithAgentRunDataTrustApplied(runParams({ data: reservedData(), TrustReservedRunData: false }));
        expect(result.Params.data).toEqual({ topic: 'refunds', conversationId: 'conv-1' });
    });

    it('keeps everything, and returns the params themselves, when the caller set TrustReservedRunData', () => {
        const params = runParams({ data: reservedData(), TrustReservedRunData: true });
        const result = WithAgentRunDataTrustApplied(params);
        expect(result.Params).toBe(params);
        expect(result.Params.data).toEqual(reservedData());
        expect(result.StrippedKeys).toEqual([]);
    });

    it('never mutates the params or their data, and keeps every other param on the copy', () => {
        const data = reservedData();
        const params = runParams({ data });
        const result = WithAgentRunDataTrustApplied(params);
        expect(result.Params).not.toBe(params);
        expect(params.data).toBe(data);
        expect(data).toEqual(reservedData());
        expect(result.Params.PrimaryScopeRecordID).toBe('explicit-tenant');
        expect(result.Params.agent).toBe(params.agent);
    });

    it('returns the params themselves when data is absent or carries no reserved key', () => {
        const noData = runParams();
        const ordinary = runParams({ data: { topic: 'refunds' } });
        expect(WithAgentRunDataTrustApplied(noData)).toEqual({ Params: noData, StrippedKeys: [] });
        expect(WithAgentRunDataTrustApplied(ordinary).Params).toBe(ordinary);
    });
});
