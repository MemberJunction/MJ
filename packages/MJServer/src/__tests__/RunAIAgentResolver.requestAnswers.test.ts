/**
 * @fileoverview The two resolver paths a person answers an agent request through.
 *
 * `MJAIAgentRequestEntityServer` records a request's responder only for a save that is the user's own
 * client request, so both paths save inside a client CRUD boundary: `RespondToAgentRequest`, and the
 * conversation reply sync (`syncFeedbackRequestFromConversation`). The sync also never answers a
 * workflow step's request: the graph's own run is that request's provenance, so a follow-up message
 * to the run is not an answer to it.
 */
import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';

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

vi.mock('@memberjunction/ai-agents', () => ({
    AgentRunner: class {},
    ArtifactToolManager: class {},
    CanAgentOwnSubAgentConsults: () => false,
    LoadOpenSubAgentConsults: async () => [],
}));

vi.mock('../realtimeWidget/widgetGuestElevation.js', () => ({
    ResolveWidgetGuestRunContext: vi.fn().mockResolvedValue(null),
    ElevateUserPayload: vi.fn(),
}));

import { RunView, ServerOperationScopeManager } from '@memberjunction/core';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { RunAIAgentResolver } from '../resolvers/RunAIAgentResolver.js';
import type { AppContext } from '../types.js';

const USER = { ID: '44444444-4444-4444-8444-444444444444', Email: 'person@example.com' } as unknown as UserInfo;
const LAST_RUN_ID = '33333333-3333-4333-8333-333333333333';

/** A request row whose save records whether it ran as the caller's own client request. */
function recordingRequest(seen: { client?: boolean }): Record<string, unknown> {
    return {
        ID: 'req-1',
        Status: 'Requested',
        Load: vi.fn().mockResolvedValue(true),
        Save: vi.fn(async () => {
            seen.client = ServerOperationScopeManager.Instance.IsInDirectClientCrud();
            return true;
        }),
    };
}

interface SyncCallable {
    syncFeedbackRequestFromConversation(
        lastRunId: string, newRunId: string, userMessage: string | undefined, contextUser: UserInfo, provider: IMetadataProvider,
    ): Promise<void>;
}

describe('RunAIAgentResolver: a person answering an agent request', () => {
    let runViewMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        runViewMock = vi.fn();
        vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({ RunView: runViewMock } as unknown as RunView);
    });

    it("the conversation reply sync skips workflow steps' requests and saves as the person's own request", async () => {
        const seen: { client?: boolean } = {};
        runViewMock.mockResolvedValue({ Success: true, Results: [recordingRequest(seen)] });
        const resolver = new RunAIAgentResolver() as unknown as SyncCallable;

        await resolver.syncFeedbackRequestFromConversation(LAST_RUN_ID, 'new-run', 'yes, go ahead', USER, {} as IMetadataProvider);

        const filter = (runViewMock.mock.calls[0][0] as { ExtraFilter: string }).ExtraFilter;
        expect(filter).toContain(`OriginatingAgentRunID='${LAST_RUN_ID}'`);
        expect(filter).toContain('OriginatingTaskID IS NULL');
        expect(seen.client).toBe(true);
    });

    it("RespondToAgentRequest saves the answer as the caller's own request", async () => {
        const seen: { client?: boolean } = {};
        const request = recordingRequest(seen);
        const provider = { GetEntityObject: vi.fn().mockResolvedValue(request) };
        const resolver = new RunAIAgentResolver();
        vi.spyOn(resolver as unknown as { GetUserFromPayload(): UserInfo }, 'GetUserFromPayload').mockReturnValue(USER);
        const ctx = { userPayload: {}, providers: [{ provider, type: 'Read-Write' }], dataSource: {} } as unknown as AppContext;

        const result = await resolver.RespondToAgentRequest('req-1', 'Approved', ctx);

        expect(result.success).toBe(true);
        expect(seen.client).toBe(true);
    });
});
