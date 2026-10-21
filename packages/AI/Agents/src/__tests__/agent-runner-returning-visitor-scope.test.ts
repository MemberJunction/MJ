/**
 * AgentRunner's returning-visitor memory scope (RV3) and the reserved run-data keys.
 *
 * For a public web-widget guest with remembering on, `RunAgentInConversation` derives the run's memory scope from the
 * conversation unless the caller already chose one. A scope in `data` counts as "already chosen" only when the run
 * will honour it (`TrustReservedRunData`): `BaseAgent.Execute` drops an untrusted one, so letting it suppress the
 * derived scope would leave the guest's run unscoped instead of scoped to its own visitor.
 *
 * No DB: the conversation load and the entity lookup come from a fake provider.
 */
import { describe, it, expect, vi } from 'vitest';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { ExecuteAgentParams, MJAIAgentEntityExtended } from '@memberjunction/ai-core-plus';

vi.mock('@memberjunction/aiengine', () => ({
    AIEngine: { get Instance() { return { Config: vi.fn(async () => undefined), AgentTypes: [] }; } },
}));

import { AgentRunner } from '../AgentRunner';

/** The private seam under test, reached through an explicit shape (no `any`). */
interface ReturningVisitorSeam {
    applyReturningVisitorMemoryScope(params: ExecuteAgentParams, conversationId: string, contextUser: UserInfo, md: IMetadataProvider): Promise<void>;
}

const VISITOR_ENTITY_ID = 'aaaaaaaa-0000-4000-8000-0000000000e1';
const VISITOR_RECORD_ID = 'aaaaaaaa-0000-4000-8000-0000000000e2';
const OTHER_TENANT = 'aaaaaaaa-0000-4000-8000-0000000000ff';
const GUEST = { ID: 'guest-1', Email: 'guest@example.com', ReturningVisitorContext: { Remember: true } } as unknown as UserInfo;

/** A provider whose conversation is linked to a known visitor record. */
function linkedConversationProvider(): IMetadataProvider {
    const conversation = { LinkedEntityID: VISITOR_ENTITY_ID, LinkedRecordID: VISITOR_RECORD_ID, LastConversationID: null, Load: async () => true };
    return {
        GetEntityObject: async () => conversation,
        Entities: [{ ID: VISITOR_ENTITY_ID, Name: 'Contacts' }],
    } as unknown as IMetadataProvider;
}

function guestParams(extra: Partial<ExecuteAgentParams> = {}): ExecuteAgentParams {
    return { agent: { ID: 'agent-1', Name: 'Widget Agent' } as unknown as MJAIAgentEntityExtended, conversationMessages: [], contextUser: GUEST, ...extra };
}

async function applyScope(params: ExecuteAgentParams): Promise<ExecuteAgentParams> {
    const md = linkedConversationProvider();
    await (new AgentRunner(md) as unknown as ReturningVisitorSeam).applyReturningVisitorMemoryScope(params, 'conv-1', GUEST, md);
    return params;
}

describe('AgentRunner — returning-visitor scope vs a scope in data', () => {
    it("derives the visitor's scope when the only scope in data is one the run will drop (no TrustReservedRunData)", async () => {
        const params = await applyScope(guestParams({ data: { PrimaryScopeRecordID: OTHER_TENANT } }));
        expect(params.PrimaryScopeEntityName).toBe('Contacts');
        expect(params.PrimaryScopeRecordID).toBe(VISITOR_RECORD_ID);
    });

    it('keeps a trusted caller\'s data scope: nothing is derived', async () => {
        const params = await applyScope(guestParams({ data: { PrimaryScopeRecordID: OTHER_TENANT }, TrustReservedRunData: true }));
        expect(params.PrimaryScopeRecordID).toBeUndefined();
        expect(params.PrimaryScopeEntityName).toBeUndefined();
    });

    it('keeps an explicit scope field: nothing is derived', async () => {
        const params = await applyScope(guestParams({ PrimaryScopeRecordID: OTHER_TENANT }));
        expect(params.PrimaryScopeRecordID).toBe(OTHER_TENANT);
        expect(params.PrimaryScopeEntityName).toBeUndefined();
    });
});
