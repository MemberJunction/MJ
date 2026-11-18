/**
 * Which BaseAgent class runs an agent (#4112).
 *
 * AgentRunner used to fall back to the agent TYPE's DriverClass (a BaseAgentType key such as
 * `LoopAgentType`, a different registry, so it never resolved), and asked the ClassFactory with a
 * null key when neither was set, which hands back the highest-priority registered subclass: some
 * other agent. CreateAgentInstance is the single resolution path now: the agent's own trimmed
 * DriverClass, a plain BaseAgent when it has none, and an error for a key nothing is registered under.
 *
 * Real ClassFactory, real registrations; only AIEngine (the agent-type lookup) is stubbed.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { RegisterClass } from '@memberjunction/global';
import type { ExecuteAgentParams, ExecuteAgentResult, MJAIAgentEntityExtended } from '@memberjunction/ai-core-plus';
import type { UserInfo } from '@memberjunction/core';

const AGENT_TYPE_ID = 'aaaaaaaa-1111-4000-8000-000000000001';

vi.mock('@memberjunction/aiengine', () => ({
    AIEngine: {
        get Instance() {
            return {
                Config: vi.fn(async () => undefined),
                // A type whose DriverClass names a registered BaseAgent subclass, to prove it is never used.
                AgentTypes: [{ ID: AGENT_TYPE_ID, DriverClass: 'ClassResolutionTypeKey' }],
            };
        },
    },
}));

import { BaseAgent } from '../base-agent';
import { CreateAgentInstance } from '../agent-instance';
import { AgentRunner } from '../AgentRunner';

@RegisterClass(BaseAgent, 'ClassResolutionTestAgent')
class ClassResolutionTestAgent extends BaseAgent {}

/** Registered at a high priority: what a null-key lookup would hand back. */
@RegisterClass(BaseAgent, 'ClassResolutionOtherAgent', 1000)
class ClassResolutionOtherAgent extends BaseAgent {}

/** Registered under the agent TYPE's DriverClass, so an agent-type fallback would pick it. */
@RegisterClass(BaseAgent, 'ClassResolutionTypeKey')
class ClassResolutionTypeKeyAgent extends BaseAgent {}

const agentRow = (driverClass: string | null): Pick<MJAIAgentEntityExtended, 'Name' | 'DriverClass'> =>
    ({ Name: 'Resolution Agent', DriverClass: driverClass }) as Pick<MJAIAgentEntityExtended, 'Name' | 'DriverClass'>;

describe('CreateAgentInstance', () => {
    it('creates the subclass registered under the agent DriverClass', async () => {
        const instance = await CreateAgentInstance(agentRow('ClassResolutionTestAgent'));
        expect(instance).toBeInstanceOf(ClassResolutionTestAgent);
    });

    it('trims the DriverClass before resolving it', async () => {
        const instance = await CreateAgentInstance(agentRow('  ClassResolutionTestAgent  '));
        expect(instance).toBeInstanceOf(ClassResolutionTestAgent);
    });

    it('runs an agent with no DriverClass on the plain BaseAgent, not the highest-priority subclass', async () => {
        const instance = await CreateAgentInstance(agentRow(null));
        expect(instance.constructor).toBe(BaseAgent);
        expect(instance).not.toBeInstanceOf(ClassResolutionOtherAgent);
    });

    it('treats a whitespace-only DriverClass as none', async () => {
        const instance = await CreateAgentInstance(agentRow('   '));
        expect(instance.constructor).toBe(BaseAgent);
    });

    it('throws for a DriverClass nothing is registered under, naming the agent and the key', async () => {
        await expect(CreateAgentInstance(agentRow('NoSuchAgentClass'))).rejects.toThrow(
            /no BaseAgent subclass is registered as 'NoSuchAgentClass' \(agent 'Resolution Agent'\)/
        );
    });
});

describe('AgentRunner.RunAgent class resolution', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    /** Runs the agent with Execute stubbed, returning the instance Execute was called on. */
    async function runWith(driverClass: string | null): Promise<BaseAgent> {
        let ranOn: BaseAgent | null = null;
        vi.spyOn(BaseAgent.prototype, 'Execute').mockImplementation(async function (this: BaseAgent) {
            ranOn = this;
            return { success: true } as ExecuteAgentResult;
        });
        const params = {
            agent: { ID: 'aaaaaaaa-1111-4000-8000-000000000002', Name: 'Resolution Agent', TypeID: AGENT_TYPE_ID, DriverClass: driverClass },
            conversationMessages: [],
            contextUser: { ID: 'user-1' } as unknown as UserInfo,
            inputArtifacts: [],
        } as unknown as ExecuteAgentParams;
        await new AgentRunner().RunAgent(params);
        expect(ranOn).not.toBeNull();
        return ranOn!;
    }

    it('runs the subclass the agent names', async () => {
        expect(await runWith('ClassResolutionTestAgent')).toBeInstanceOf(ClassResolutionTestAgent);
    });

    it('ignores the agent type DriverClass and runs an agent with none on the plain BaseAgent', async () => {
        const ranOn = await runWith(null);
        expect(ranOn.constructor).toBe(BaseAgent);
        expect(ranOn).not.toBeInstanceOf(ClassResolutionTypeKeyAgent);
        expect(ranOn).not.toBeInstanceOf(ClassResolutionOtherAgent);
    });

    it('throws for an unregistered DriverClass instead of running some other class', async () => {
        await expect(runWith('NoSuchAgentClass')).rejects.toThrow(/no BaseAgent subclass is registered as 'NoSuchAgentClass'/);
        expect(BaseAgent.prototype.Execute).not.toHaveBeenCalled();
    });
});
