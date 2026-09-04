/**
 * Tests for the `filterAvailableSkills` seam (base-agent.ts) — against the REAL BaseAgent, the same
 * `new BaseAgent()` + cast recipe as expand-message-failure.test.ts / base-agent-step-save.test.ts.
 * The engine singleton is module-mocked (as base-agent-loop.test.ts does); the step-recording and
 * capability-enabling side effects are stubbed on the instance so the gate logic runs bare.
 *
 * Contract pinned:
 *   1. the default policy is the identity — MJ's gates alone decide;
 *   2. an override composes as an INTERSECTION with MJ's gates and the refused request gets the note;
 *   3. a throwing override fails CLOSED at the site: nothing activates, the note is still emitted,
 *      one error is logged, and the run does not fail.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ExecuteAgentParams, MJAIAgentEntityExtended, SkillAvailabilityPurpose } from '@memberjunction/ai-core-plus';
import type { MJAISkillEntity } from '@memberjunction/core-entities';
import type { UserInfo } from '@memberjunction/core';

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

const A = { ID: 'aaaaaaaa-0000-4000-8000-000000000001', Name: 'Alpha', Instructions: 'be alpha', Status: 'Active', ActivationMode: 'RequestedOnly' } as unknown as MJAISkillEntity;
const B = { ID: 'bbbbbbbb-0000-4000-8000-000000000002', Name: 'Beta', Instructions: 'be beta', Status: 'Active', ActivationMode: 'RequestedOnly' } as unknown as MJAISkillEntity;
const AGENT = { ID: '11111111-0000-4000-8000-000000000001', Name: 'Test Agent', AcceptsSkills: 'All', SkillActivationMode: 'RequestedOnly' } as unknown as MJAIAgentEntityExtended;

/** A BaseAgent whose policy can refuse a set of skill ids, or throw. */
class PolicyAgent extends BaseAgent {
    public refuse = new Set<string>();
    public throwPolicy = false;
    public calls: SkillAvailabilityPurpose[] = [];
    protected override async filterAvailableSkills(skills: MJAISkillEntity[], purpose: SkillAvailabilityPurpose): Promise<MJAISkillEntity[]> {
        this.calls.push(purpose);
        if (this.throwPolicy) throw new Error('licensing service down');
        return skills.filter(s => !this.refuse.has(s.ID));
    }
}

interface Internals {
    _depth: number;
    _activatedSkillIDs: string[];
    recordSkillActivationStep: () => Promise<void>;
    enableSkillCapabilities: () => void;
    logError: (msg: string) => void;
    preActivateRequestedSkills(params: ExecuteAgentParams): Promise<void>;
    availableSkills(gated: MJAISkillEntity[], purpose: SkillAvailabilityPurpose, agent: MJAIAgentEntityExtended, user?: UserInfo): Promise<MJAISkillEntity[]>;
}

function bare(agent: BaseAgent): Internals {
    const i = agent as unknown as Internals;
    i._depth = 0;
    i.recordSkillActivationStep = async () => undefined;
    i.enableSkillCapabilities = () => undefined;
    i.logError = vi.fn();
    return i;
}

function paramsFor(requested: string[]): ExecuteAgentParams {
    return { agent: AGENT, contextUser: {} as UserInfo, requestedSkillIDs: requested, conversationMessages: [] } as unknown as ExecuteAgentParams;
}

function notes(params: ExecuteAgentParams, type: string): string[] {
    return (params.conversationMessages ?? [])
        .filter(m => (m as { metadata?: { messageType?: string } }).metadata?.messageType === type)
        .map(m => String(m.content));
}

describe('filterAvailableSkills — the application policy seam (real BaseAgent)', () => {
    beforeEach(() => { engine.skills = [A, B]; });

    it('defaults to the identity: with no override, MJ\'s gates are the whole policy', async () => {
        const agent = new BaseAgent();
        const i = bare(agent);
        const params = paramsFor([A.ID, B.ID]);
        await i.preActivateRequestedSkills(params);
        expect(i._activatedSkillIDs).toEqual([A.ID, B.ID]);
        expect(notes(params, 'skill-activation-refused')).toEqual([]);
        expect(notes(params, 'skill-activation')).toHaveLength(1);
    });

    it('an override narrows what MJ admitted, and the refused explicit request gets the system note', async () => {
        const agent = new PolicyAgent();
        agent.refuse.add(B.ID);
        const i = bare(agent);
        const params = paramsFor([A.ID, B.ID]);
        await i.preActivateRequestedSkills(params);
        expect(i._activatedSkillIDs).toEqual([A.ID]);
        expect(agent.calls).toEqual(['requested']);
        const refused = notes(params, 'skill-activation-refused');
        expect(refused).toHaveLength(1);
        expect(refused[0]).toContain('Beta');
        expect(refused[0]).not.toContain('Alpha');
        expect(refused[0]).toContain('skill-availability policy');
    });

    it('a throwing override fails CLOSED at the site: nothing activates, the note still goes out, one error is logged', async () => {
        const agent = new PolicyAgent();
        agent.throwPolicy = true;
        const i = bare(agent);
        const params = paramsFor([A.ID]);
        await expect(i.preActivateRequestedSkills(params)).resolves.toBeUndefined();
        expect(i._activatedSkillIDs).toEqual([]);
        expect(notes(params, 'skill-activation-refused')).toHaveLength(1);
        expect(i.logError).toHaveBeenCalledTimes(1);
        expect(String((i.logError as ReturnType<typeof vi.fn>).mock.calls[0][0])).toContain("'requested'");
    });

    it('the same fail-closed helper serves every purpose (catalog too)', async () => {
        const agent = new PolicyAgent();
        agent.throwPolicy = true;
        const i = bare(agent);
        expect(await i.availableSkills([A, B], 'catalog', AGENT)).toEqual([]);
        agent.throwPolicy = false;
        agent.refuse.add(A.ID);
        expect(await i.availableSkills([A, B], 'auto-activation', AGENT)).toEqual([B]);
    });
});
