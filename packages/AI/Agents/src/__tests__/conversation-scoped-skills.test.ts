/**
 * Tests for conversation-scoped skill activation (base-agent.ts, v6.1.x) — against the REAL BaseAgent
 * (`new BaseAgent()` + casts, as expand-message-failure.test.ts does). The engine singleton is
 * module-mocked, `RunView.prototype.RunView` is spied, and the step-recording / capability-enabling
 * side effects are stubbed on the instance. Contract pinned:
 *   1. the conversation's Active skills join the request (read once, by conversation + Status);
 *   2. a refused PERSISTED skill gets no note and its row is NOT ended; a refused explicit one gets the note;
 *   3. only ActivationScope='Conversation' persists; a skill that came from the persisted set is not
 *      re-written (one read per turn, not one per skill);
 *   4. a fresh Conversation-scoped activation writes an Active row through the run's provider;
 *   5. a read failure is fail-soft: the turn proceeds with the explicit request only.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ExecuteAgentParams, MJAIAgentEntityExtended } from '@memberjunction/ai-core-plus';
import type { MJAISkillEntity } from '@memberjunction/core-entities';
import { RunView, type UserInfo } from '@memberjunction/core';

const engine = vi.hoisted(() => ({ skills: [] as unknown[] }));
vi.mock('@memberjunction/aiengine', () => ({
    AIEngine: {
        Instance: {
            get Skills(): unknown[] { return engine.skills; },
            GetSkillsForAgent: (): unknown[] => engine.skills,
            GetAutoActivatableSkillsForAgent: (): unknown[] => engine.skills,
        },
    },
}));

import { BaseAgent } from '../base-agent';

const A = { ID: 'aaaaaaaa-0000-4000-8000-000000000001', Name: 'Alpha', Instructions: 'be alpha', Status: 'Active', ActivationMode: 'RequestedOnly', ActivationScope: 'Run' } as unknown as MJAISkillEntity;
const B = { ID: 'bbbbbbbb-0000-4000-8000-000000000002', Name: 'Beta', Instructions: 'be beta', Status: 'Active', ActivationMode: 'RequestedOnly', ActivationScope: 'Conversation' } as unknown as MJAISkillEntity;
const AGENT = { ID: '11111111-0000-4000-8000-000000000001', Name: 'Test Agent', AcceptsSkills: 'All', SkillActivationMode: 'RequestedOnly' } as unknown as MJAIAgentEntityExtended;
const CONV = 'cccccccc-0000-4000-8000-000000000009';

interface Internals {
    _depth: number;
    _activeProvider: unknown;
    _activatedSkillIDs: string[];
    recordSkillActivationStep: () => Promise<void>;
    enableSkillCapabilities: () => void;
    preActivateRequestedSkills(params: ExecuteAgentParams): Promise<void>;
}
interface FakeRow { ConversationID?: string; SkillID?: string; Status?: string; EndedAt?: Date | null; ActivatedByRunID?: string | null; Save: () => Promise<boolean>; LatestResult?: unknown }

function harness(persisted: string[], existingRow?: FakeRow) {
    const runViewSpy = vi.spyOn(RunView.prototype, 'RunView').mockImplementation(async (p: { EntityName: string; ExtraFilter?: string }) => {
        if (p.EntityName !== 'MJ: Conversation Skills') return { Success: true, Results: [] };
        if (p.ExtraFilter?.includes("Status = 'Active'") && !p.ExtraFilter.includes('SkillID')) {
            return { Success: true, Results: persisted.map(SkillID => ({ SkillID })) };
        }
        return { Success: true, Results: existingRow ? [existingRow] : [] };
    });
    const created: FakeRow = { Save: vi.fn(async () => true) };
    const provider = { GetEntityObject: vi.fn(async () => created) };
    const agent = new BaseAgent();
    const i = agent as unknown as Internals;
    i._depth = 0;
    i._activeProvider = provider;
    i.recordSkillActivationStep = async () => undefined;
    i.enableSkillCapabilities = () => undefined;
    const endSpy = vi.fn(async () => undefined);
    (agent as unknown as { EndConversationSkill: unknown }).EndConversationSkill = endSpy;
    return { agent, i, runViewSpy, provider, created, endSpy };
}

function paramsFor(requested: string[], provider: unknown): ExecuteAgentParams {
    return { agent: AGENT, contextUser: {} as UserInfo, requestedSkillIDs: requested, conversationMessages: [], conversationId: CONV, provider } as unknown as ExecuteAgentParams;
}
const notes = (p: ExecuteAgentParams, type: string) => (p.conversationMessages ?? []).filter(m => (m as { metadata?: { messageType?: string } }).metadata?.messageType === type);

describe('conversation-scoped skills (real BaseAgent)', () => {
    beforeEach(() => { vi.restoreAllMocks(); });

    it('reads the conversation\'s Active skills once and merges them into the request', async () => {
        engine.skills = [A, B];
        const h = harness([B.ID]);
        const params = paramsFor([A.ID], h.provider);
        await h.i.preActivateRequestedSkills(params);
        const loads = h.runViewSpy.mock.calls.filter(c => (c[0] as { EntityName: string }).EntityName === 'MJ: Conversation Skills');
        expect(loads).toHaveLength(1);
        expect((loads[0][0] as { ExtraFilter: string }).ExtraFilter).toContain(`ConversationID = '${CONV}' AND Status = 'Active'`);
        expect(h.i._activatedSkillIDs).toEqual([A.ID, B.ID]);
        // B came from the persisted set: known Active, so no upsert read/write for it; A is Run-scoped.
        expect(h.provider.GetEntityObject).not.toHaveBeenCalled();
    });

    it('a refused PERSISTED skill gets no note and its row is left Active; a refused EXPLICIT one gets the note', async () => {
        engine.skills = [A]; // B is no longer allowed on this agent
        const h = harness([B.ID]);
        const params = paramsFor([A.ID], h.provider);
        await h.i.preActivateRequestedSkills(params);
        expect(h.i._activatedSkillIDs).toEqual([A.ID]);
        expect(notes(params, 'skill-activation-refused')).toHaveLength(0);
        expect(h.endSpy).not.toHaveBeenCalled();

        const h2 = harness([]);
        const params2 = paramsFor([A.ID, B.ID], h2.provider);
        await h2.i.preActivateRequestedSkills(params2);
        expect(notes(params2, 'skill-activation-refused')).toHaveLength(1);
        // B is not in the engine's catalog at all here, so the note names it by id.
        expect(String(notes(params2, 'skill-activation-refused')[0].content)).toContain(B.ID);
    });

    it('a fresh Conversation-scoped activation writes an Active row through the run\'s provider; Run-scoped never persists', async () => {
        engine.skills = [A, B];
        const h = harness([]);
        const params = paramsFor([A.ID, B.ID], h.provider);
        await h.i.preActivateRequestedSkills(params);
        expect(h.provider.GetEntityObject).toHaveBeenCalledTimes(1); // B only
        expect(h.created.ConversationID).toBe(CONV);
        expect(h.created.SkillID).toBe(B.ID);
        expect(h.created.Status).toBe('Active');
        expect(h.created.Save).toHaveBeenCalledTimes(1);
    });

    it('re-activates an Ended row instead of creating a duplicate', async () => {
        engine.skills = [B];
        const ended: FakeRow = { Status: 'Ended', EndedAt: new Date(0), Save: vi.fn(async () => true) };
        const h = harness([], ended);
        await h.i.preActivateRequestedSkills(paramsFor([B.ID], h.provider));
        expect(h.provider.GetEntityObject).not.toHaveBeenCalled();
        expect(ended.Status).toBe('Active');
        expect(ended.EndedAt).toBeNull();
        expect(ended.Save).toHaveBeenCalledTimes(1);
    });

    it('a failed read of the persisted set is fail-soft: the explicit request still activates', async () => {
        engine.skills = [A];
        const h = harness([]);
        h.runViewSpy.mockRejectedValue(new Error('db down'));
        const params = paramsFor([A.ID], h.provider);
        await expect(h.i.preActivateRequestedSkills(params)).resolves.toBeUndefined();
        expect(h.i._activatedSkillIDs).toEqual([A.ID]);
    });
});
