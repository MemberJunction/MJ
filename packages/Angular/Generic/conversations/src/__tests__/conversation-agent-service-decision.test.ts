/**
 * @fileoverview The agent service's half of decision routing: `RunDecision` hands the call to the
 * GraphQL AI client and never throws, and `FindAgentArtifacts` honours the chat's history floor.
 *
 * Instantiated via the prototype (no Angular DI), with the transport stubbed, the same style as
 * conversation-agent-service-host-rules.test.ts.
 */
import '@angular/compiler'; // JIT support — the service module evaluates Angular decorators in vitest's node env
import { describe, it, expect, vi, afterEach } from 'vitest';
import { RunView } from '@memberjunction/core';
import type { RunDecisionParams, RunDecisionResult } from '@memberjunction/graphql-dataprovider';

import { ConversationAgentService } from '../lib/services/conversation-agent.service';

const AGENT_ID = 'AAAAAAAA-0000-0000-0000-000000000002';
const FLOOR = new Date('2026-09-01T12:00:00.000Z');

const PARAMS: RunDecisionParams = {
    State: 'The user\'s new message:\nhello',
    Questions: { continues: { Kind: 'Likelihood', Instructions: 'The message continues the thread.' } },
    TimeoutMS: 250,
};

/** A service with only the members these paths read. */
function buildService(aiClient: { RunDecision(params: RunDecisionParams): Promise<RunDecisionResult> } | null) {
    const runViewParams: Array<{ ExtraFilter?: string }> = [];
    vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({
        RunView: vi.fn(async (params: { ExtraFilter?: string }) => {
            runViewParams.push(params);
            return { Success: true, Results: [] };
        }),
    } as unknown as RunView);

    const service = Object.create(ConversationAgentService.prototype) as ConversationAgentService;
    Object.assign(service as unknown as Record<string, unknown>, {
        _aiClient: aiClient,
        _provider: { CurrentUser: null },
    });
    return { service, runViewParams };
}

describe('ConversationAgentService — decision routing', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('RunDecision', () => {
        it('hands the call to the GraphQL AI client and returns its result', async () => {
            const result: RunDecisionResult = { Success: true, Answers: { continues: { Kind: 'Likelihood', Probability: 0.2 } } };
            const runDecision = vi.fn(async () => result);
            const { service } = buildService({ RunDecision: runDecision });

            await expect(service.RunDecision(PARAMS)).resolves.toBe(result);
            expect(runDecision).toHaveBeenCalledWith(PARAMS);
        });

        it('without an AI client, fails without throwing and with no answers', async () => {
            const { service } = buildService(null);

            await expect(service.RunDecision(PARAMS)).resolves.toEqual({
                Success: false, ErrorMessage: 'AI Client not initialized', Answers: {},
            });
        });
    });

    describe('FindAgentArtifacts', () => {
        it('under a floor, considers only replies written at or after it', async () => {
            const { service, runViewParams } = buildService(null);
            await service.FindAgentArtifacts('conv-1', AGENT_ID, FLOOR);

            const filter = runViewParams[0].ExtraFilter ?? '';
            expect(filter).toContain(`AgentID='${AGENT_ID}'`);
            expect(filter).toContain(`AND __mj_CreatedAt >= '2026-09-01T12:00:00.000Z'`);
        });

        it('without one, reads the whole conversation', async () => {
            const { service, runViewParams } = buildService(null);
            await expect(service.FindAgentArtifacts('conv-1', AGENT_ID)).resolves.toEqual([]);

            expect(runViewParams[0].ExtraFilter).not.toContain('__mj_CreatedAt');
        });
    });
});
