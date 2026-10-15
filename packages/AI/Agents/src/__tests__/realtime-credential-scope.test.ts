/**
 * On this release line a realtime session is minted only on the platform's keys, so a run whose
 * credential scope is 'RuntimeOnly' has no key it may mint on and must be refused — not quietly run
 * on ours. The scope has to reach the session service from a bridged run (BaseAgent's prep input),
 * and the service has to refuse before resolving any model.
 */
import { describe, it, expect, vi } from 'vitest';
import type { ExecuteAgentParams, MJAIAgentEntityExtended } from '@memberjunction/ai-core-plus';
import type { UserInfo } from '@memberjunction/core';
import { BaseAgent } from '../base-agent';
import {
    PrepareClientSessionInput,
    RealtimeClientSessionService,
    RealtimeModelResolution,
} from '../realtime/realtime-client-session-service';

const coAgent = { ID: 'aaaaaaaa-0000-4000-8000-0000000000d1', Name: 'Voice Co-Agent' } as unknown as MJAIAgentEntityExtended;

/** Exposes the protected resolution seam; the default model lookup is a spy, never the DB. */
class ScopeTestService extends RealtimeClientSessionService {
    public readonly DefaultResolution = vi.fn(async (): Promise<RealtimeModelResolution | null> => ({
        ModelID: 'model-1',
        VendorID: 'vendor-1',
        APIName: 'realtime-test',
    } as unknown as RealtimeModelResolution));

    protected override async resolveRealtimeModel(): Promise<RealtimeModelResolution | null> {
        return this.DefaultResolution();
    }

    public Resolve(input: PrepareClientSessionInput): ReturnType<RealtimeClientSessionService['resolveModelForSession']> {
        return this.resolveModelForSession(input, coAgent);
    }
}

describe('RealtimeClientSessionService.resolveModelForSession under a credential scope', () => {
    it('refuses a RuntimeOnly session without resolving a model', async () => {
        const service = new ScopeTestService();

        const outcome = await service.Resolve({ CoAgent: coAgent, CredentialScope: 'RuntimeOnly' } as PrepareClientSessionInput);

        expect(outcome.ErrorMessage).toContain('credential scope is RuntimeOnly');
        expect(outcome.Resolution).toBeUndefined();
        expect(service.DefaultResolution).not.toHaveBeenCalled();
    });

    it('under Any it goes on to resolve the model', async () => {
        const service = new ScopeTestService();

        const outcome = await service.Resolve({ CoAgent: coAgent, CredentialScope: 'Any' } as PrepareClientSessionInput);

        expect(outcome.ErrorMessage).toBeUndefined();
        expect(service.DefaultResolution).toHaveBeenCalledTimes(1);
        expect(outcome.Resolution?.ModelID).toBe('model-1');
    });
});

describe("BaseAgent's bridged realtime session input", () => {
    type BridgeInternals = { buildBridgePrepInput(params: ExecuteAgentParams): PrepareClientSessionInput };

    it("carries the run's CredentialScope to the session service", () => {
        const agent = new BaseAgent() as unknown as BridgeInternals;
        const params: ExecuteAgentParams = {
            agent: coAgent,
            conversationMessages: [],
            contextUser: { ID: 'user-1' } as unknown as UserInfo,
            CredentialScope: 'RuntimeOnly',
            data: { targetAgentID: 'target-1' },
        };

        const input = agent.buildBridgePrepInput(params);

        expect(input.CredentialScope).toBe('RuntimeOnly');
        expect(input.CoAgent).toBe(coAgent);
    });
});
