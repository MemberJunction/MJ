/**
 * @fileoverview The agent service's artifact lookups read the agent's replies with their own
 * RunView, then the artifact versions by those reply IDs. A subquery over the conversation
 * message view would skip that entity's row-level security, and the server refuses one for a user
 * whose read of messages is row-filtered.
 *
 * Instantiated via the prototype (no Angular DI), with RunView stubbed.
 */
import '@angular/compiler'; // JIT support — the service module evaluates Angular decorators in vitest's node env
import { describe, it, expect, vi, afterEach } from 'vitest';
import { RunView } from '@memberjunction/core';

import { ConversationAgentService } from '../lib/services/conversation-agent.service';

const AGENT_ID = 'AAAAAAAA-0000-0000-0000-000000000002';

/** The parts of a RunView request these tests read. */
interface ViewRequest {
    EntityName?: string;
    ExtraFilter?: string;
}

interface ServiceHarness {
    service: ConversationAgentService;
    runViewParams: ViewRequest[];
}

/** A service whose RunView records each request and answers with the rows given for its entity. */
function buildService(rows: Record<string, object[]> = {}): ServiceHarness {
    const runViewParams: ViewRequest[] = [];
    vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({
        RunView: vi.fn(async (params: ViewRequest) => {
            runViewParams.push(params);
            return { Success: true, Results: rows[params.EntityName ?? ''] ?? [] };
        }),
    } as unknown as RunView);

    const service = Object.create(ConversationAgentService.prototype) as ConversationAgentService;
    Object.assign(service as unknown as Record<string, unknown>, { _provider: { CurrentUser: null } });
    return { service, runViewParams };
}

describe('ConversationAgentService — FindLatestAgentOutputVersion', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('reads the agent replies first, for this conversation and agent', async () => {
        const h = buildService();
        await h.service.FindLatestAgentOutputVersion('conv-1', AGENT_ID);

        expect(h.runViewParams[0].EntityName).toBe('MJ: Conversation Details');
        expect(h.runViewParams[0].ExtraFilter).toContain(`ConversationID='conv-1' AND AgentID='${AGENT_ID}'`);
        expect(h.runViewParams[0].ExtraFilter).toContain(`Role='AI' AND Status <> 'Error'`);
    });

    it('reads the versions by the IDs of the replies, with no subquery over conversation messages', async () => {
        const h = buildService({ 'MJ: Conversation Details': [{ ID: 'reply-1' }, { ID: 'reply-2' }] });
        await h.service.FindLatestAgentOutputVersion('conv-1', AGENT_ID);

        expect(h.runViewParams.map(p => p.EntityName)).toEqual(['MJ: Conversation Details', 'MJ: Artifact Versions']);
        expect(h.runViewParams[1].ExtraFilter).toContain(`ConversationDetailID IN ('reply-1','reply-2')`);
        expect(h.runViewParams.map(p => p.ExtraFilter ?? '').join(' ')).not.toContain('vwConversationDetails]');
    });

    it('reads the replies again on every lookup, so a newer reply counts', async () => {
        const rows: Record<string, object[]> = { 'MJ: Conversation Details': [{ ID: 'reply-1' }] };
        const h = buildService(rows);

        await h.service.FindLatestAgentOutputVersion('conv-1', AGENT_ID);
        rows['MJ: Conversation Details'] = [{ ID: 'reply-1' }, { ID: 'reply-2' }];
        await h.service.FindLatestAgentOutputVersion('conv-1', AGENT_ID);

        const versionFilters = h.runViewParams.filter(p => p.EntityName === 'MJ: Artifact Versions').map(p => p.ExtraFilter ?? '');
        expect(versionFilters).toHaveLength(2);
        expect(versionFilters[1]).toContain(`ConversationDetailID IN ('reply-1','reply-2')`);
    });

    it('reads no versions when the agent has no reply in the conversation', async () => {
        const h = buildService();

        await expect(h.service.FindLatestAgentOutputVersion('conv-1', AGENT_ID)).resolves.toBeNull();
        expect(h.runViewParams.map(p => p.EntityName)).toEqual(['MJ: Conversation Details']);
    });
});
