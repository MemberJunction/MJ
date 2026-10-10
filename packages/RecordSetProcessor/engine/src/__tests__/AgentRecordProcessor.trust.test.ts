/**
 * A Record Process's agent `data` is built on the server from the admin-configured input mapping, so the run is
 * marked trusted: a mapped per-record tenant (PrimaryScopeRecordID) is honoured, not stripped as client input would be.
 */
import { describe, it, expect, vi } from 'vitest';

const { runAgentSpy, AGENT_ID } = vi.hoisted(() => ({ runAgentSpy: vi.fn(), AGENT_ID: '33333333-3333-4333-8333-333333333333' }));

vi.mock('@memberjunction/aiengine', () => ({
    AIEngine: { Instance: { Agents: [{ ID: AGENT_ID, Name: 'Per-record agent' }], Config: vi.fn() } },
}));
vi.mock('@memberjunction/ai-agents', () => ({
    AgentRunner: class { RunAgent = runAgentSpy; },
}));

import type { RecordRef } from '@memberjunction/record-set-processor-base';
import { AgentRecordProcessor } from '../processors/AgentRecordProcessor';

describe('AgentRecordProcessor.ProcessRecord', () => {
    it('runs the agent with the mapped data and marks the run trusted for reserved keys', async () => {
        runAgentSpy.mockResolvedValue({ success: true, payload: { ok: true }, agentRun: { ID: 'run-1' } });
        const processor = new AgentRecordProcessor(AGENT_ID, { PrimaryScopeRecordID: 'record.TenantID', name: 'record.Name' });
        const record: RecordRef = { EntityID: 'ENT-1', RecordID: 'c1', Record: { ID: 'c1', Name: 'Ada', TenantID: 'tenant-7' } };

        const result = await processor.ProcessRecord(record, { contextUser: { ID: 'admin' } } as never);

        expect(result.Status).toBe('Succeeded');
        const sent = runAgentSpy.mock.calls[0][0];
        expect(sent.data).toEqual({ PrimaryScopeRecordID: 'tenant-7', name: 'Ada' });
        expect(sent.TrustReservedRunData).toBe(true);
    });
});
