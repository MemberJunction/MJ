/**
 * Field-level security on the agent-run and test-run streams.
 *
 * Each of these publishes an entity object's `GetAll()` to the caller's session: the agent run on
 * every progress and streaming message and in the final result, the test run on every progress
 * message. The objects come from long-running engines and can have been built for another
 * identity, so the transport projects them for the recipient. The objects here are FULL WIDTH,
 * and the recipient may not read `Salary`.
 */
import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';
import type { PubSubEngine } from 'type-graphql';

vi.mock('type-graphql', () => {
    const decoratorFactory = (..._args: unknown[]) => (..._decorated: unknown[]) => undefined;
    const exportNames = [
        'Resolver', 'Query', 'Mutation', 'Subscription', 'Arg', 'Args', 'ArgsType', 'Ctx', 'Root',
        'Info', 'Field', 'FieldResolver', 'ObjectType', 'InputType', 'InterfaceType', 'Authorized',
        'UseMiddleware', 'Extensions', 'Directive', 'ID', 'Int', 'Float', 'GraphQLISODateTime',
        'GraphQLTimestamp', 'registerEnumType', 'createMethodDecorator', 'createParamDecorator',
        'buildSchema', 'buildSchemaSync', 'PubSub',
    ];
    return Object.fromEntries(exportNames.map((name) => [name, decoratorFactory]));
});

vi.mock('@memberjunction/ai-agents', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@memberjunction/ai-agents')>()),
    AgentRunner: class {},
}));

import type { ExecuteAgentResult } from '@memberjunction/ai-core-plus';
import { AgentRunStatusPublisher } from '../resolvers/AgentRunStatusPublisher.js';
import { RunAIAgentResolver } from '../resolvers/RunAIAgentResolver.js';
import { RunTestResolver } from '../resolvers/RunTestResolver.js';
import type { UserPayload } from '../types.js';
import { EmployeeEntity, FullWidthEmployeeRow, Intern, SECRET_SALARY } from './fieldSecurityFixtures.js';

/** A run object holding every column, as one built for another identity would. */
function fullWidthRun() {
    return {
        ID: 'emp-1',
        ConversationDetailID: 'detail-1',
        Steps: [{ StepName: 'Answer' }],
        EntityInfo: EmployeeEntity(),
        GetAll: () => FullWidthEmployeeRow(),
    };
}

function capture() {
    const publish = vi.fn().mockResolvedValue(undefined);
    const pubSub = { publish } as unknown as PubSubEngine;
    const userPayload = { sessionId: 'session-1', userRecord: Intern() } as unknown as UserPayload;
    const messages = () => publish.mock.calls.map((call) => String((call[1] as { message: string }).message));
    return { pubSub, userPayload, messages };
}

describe('AgentRunStatusPublisher: the run is projected for the recipient', () => {
    it('REGRESSION: progress and streaming messages never carry a denied value', () => {
        const { pubSub, userPayload, messages } = capture();
        const publisher = new AgentRunStatusPublisher(pubSub, userPayload);
        publisher.OnProgress({ step: 'prompt_execution', percentage: 10, message: 'm', metadata: { agentRun: fullWidthRun() } } as never);
        publisher.OnStreaming({ content: 'hi', isComplete: false } as never);

        expect(messages()).toHaveLength(2);
        for (const message of messages()) {
            expect(message).not.toContain(String(SECRET_SALARY));
            expect(message).toContain('"Name":"Ada"');
        }
    });
});

describe('RunAIAgentResolver: the final result is projected for the recipient', () => {
    it('REGRESSION: the sanitized result never carries a denied value of the run', () => {
        const sanitize = (RunAIAgentResolver.prototype as unknown as {
            sanitizeAgentResult(result: ExecuteAgentResult, user?: unknown): Record<string, unknown>;
        }).sanitizeAgentResult;
        const result = { success: true, agentRun: fullWidthRun() } as unknown as ExecuteAgentResult;

        const sanitized = sanitize.call(new RunAIAgentResolver(), result, Intern());

        expect(JSON.stringify(sanitized)).not.toContain(String(SECRET_SALARY));
        expect(sanitized.agentRun).toMatchObject({ ID: 'emp-1', Name: 'Ada' });
    });
});

describe('RunTestResolver: progress is projected for the recipient', () => {
    it('REGRESSION: a progress message never carries a denied value of the test run', () => {
        const { pubSub, userPayload, messages } = capture();
        const create = (RunTestResolver.prototype as unknown as {
            createProgressCallback(pubSub: PubSubEngine, userPayload: UserPayload, testId: string): (progress: unknown) => void;
        }).createProgressCallback;
        const onProgress = create.call(new RunTestResolver(), pubSub, userPayload, 'test-1');

        onProgress({ step: 'running', percentage: 50, message: 'm', metadata: { testRun: fullWidthRun() } });

        expect(messages()).toHaveLength(1);
        expect(messages()[0]).not.toContain(String(SECRET_SALARY));
        expect(messages()[0]).toContain('Ada');
    });
});
