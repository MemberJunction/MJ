/**
 * Behavioral & AST coverage-lock tests for side-effecting @Query resolvers (Item 8)
 * and async/background execution @Mutation resolvers (Item 10) during user impersonation.
 *
 * Layer 1 (Behavioral): invokes every side-effecting @Query directly with an active impersonation
 * session (both ViewAs and ActAs) and asserts `IMPERSONATION_FORBIDDEN_OPERATION` is thrown BEFORE
 * any downstream DB, connector, storage, or provider work runs. Also invokes async execution
 * resolvers directly with an ActAs impersonation session.
 *
 * Layer 2 (Decorator & Guard Coverage Lock): parses the TypeScript AST of every covered resolver
 * file to assert `@RefuseImpersonationSessions()` and/or `AssertNotImpersonationSession(...)` are
 * present on the exact classes/methods so removing a guard fails CI immediately.
 */
import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import ts from 'typescript';

vi.mock('type-graphql', () => {
    const decoratorFactory = (..._args: unknown[]) => (..._decorated: unknown[]) => undefined;
    const exportNames = [
        'Resolver', 'Query', 'Mutation', 'Subscription', 'Arg', 'Args', 'ArgsType', 'Ctx', 'Root',
        'Info', 'Field', 'FieldResolver', 'ObjectType', 'InputType', 'InterfaceType', 'Authorized',
        'UseMiddleware', 'Extensions', 'Directive', 'ID', 'Int', 'Float', 'GraphQLISODateTime',
        'GraphQLTimestamp', 'registerEnumType', 'createMethodDecorator', 'createParamDecorator',
        'buildSchema', 'buildSchemaSync', 'PubSub',
    ];
    return {
        ...Object.fromEntries(exportNames.map((name) => [name, decoratorFactory])),
        AuthorizationError: class AuthorizationError extends Error {},
        AuthenticationError: class AuthenticationError extends Error {},
    };
});

vi.mock('../config.js', () => ({
    configInfo: {
        baseUrl: 'http://localhost',
        graphqlPort: 4000,
        graphqlRootPath: '/',
        apiRootPath: '/',
        databaseSettings: {
            requestTimeout: 30000,
        },
    },
    LoadConfig: vi.fn(),
    mj_core_schema: '__mj',
}));

vi.mock('@memberjunction/server', () => {
    const decoratorFactory = (..._args: unknown[]) => (..._decorated: unknown[]) => undefined;
    const exportNames = [
        'Resolver', 'Query', 'Mutation', 'Subscription', 'Arg', 'Args', 'ArgsType', 'Ctx', 'Root',
        'Info', 'Field', 'FieldResolver', 'ObjectType', 'InputType', 'InterfaceType', 'Authorized',
        'UseMiddleware', 'Extensions', 'Directive', 'ID', 'Int', 'Float', 'PubSub',
    ];
    return {
        ...Object.fromEntries(exportNames.map((name) => [name, decoratorFactory])),
        DeleteOptionsInput: class DeleteOptionsInput {},
        AuthorizationError: class AuthorizationError extends Error {},
        AuthenticationError: class AuthenticationError extends Error {},
    };
});

vi.mock('../generated/generated.js', () => ({
    MJFileResolver: class MJFileResolver {},
    MJFile_: class MJFile_ {},
    CreateMJFileInput: class CreateMJFileInput {},
    UpdateMJFileInput: class UpdateMJFileInput {},
}));

vi.mock('../apiRoot.js', () => ({
    ApiRoute: (subpath: string) => subpath,
    NormalizeApiRootPath: (p: string | undefined) => p ?? '',
}));

import { UserInfo } from '@memberjunction/core';
import { StampImpersonationSession } from '../auth/impersonationGuard.js';
import { RegisterServerUserImpersonationConfig } from '../userImpersonationConfigUnits.js';
import { IntegrationDiscoveryResolver } from '../resolvers/IntegrationDiscoveryResolver.js';
import { FileResolver } from '../resolvers/FileResolver.js';
import { ArtifactFileResolver } from '../resolvers/ArtifactFileResolver.js';
import { ReportResolver as EntityCommunicationsResolver } from '../resolvers/EntityCommunicationsResolver.js';
import { ActionResolver } from '../resolvers/ActionResolver.js';
import { ExecuteRemoteOperationResolver } from '../resolvers/ExecuteRemoteOperationResolver.js';
import { RunAIPromptResolver } from '../resolvers/RunAIPromptResolver.js';
import { RunAIAgentResolver } from '../resolvers/RunAIAgentResolver.js';
import type { AppContext, UserPayload } from '../types.js';

const ACTOR_USER_ID = '11111111-1111-4111-8111-111111111111';
const TARGET_USER_ID = '22222222-2222-4222-8222-222222222222';
const KEY_ID = '66666666-6666-4666-8666-666666666666';

function makeImpersonatedContext(mode: 'ViewAs' | 'ActAs'): AppContext {
    const user = new UserInfo(null, {
        ID: TARGET_USER_ID,
        Name: 'Bob Analyst',
        Email: 'bob@example.com',
        Type: 'User',
        IsActive: true,
    });
    const session = StampImpersonationSession(user, {
        apiKeyId: KEY_ID,
        mode,
        readOnly: mode === 'ViewAs',
        actorUserId: ACTOR_USER_ID,
        targetUserId: TARGET_USER_ID,
        expiresAtMs: Date.now() + 60_000,
    });
    const userPayload: UserPayload = {
        email: user.Email,
        userRecord: user,
        sessionId: `imp-${mode}`,
        apiKeyId: KEY_ID,
        impersonationSession: session,
    };
    return {
        dataSource: {} as AppContext['dataSource'],
        dataSources: [],
        providers: [],
        userPayload,
    };
}

describe('Impersonation Resolver Refusals — Item 8 (Side-Effecting Queries) & Item 10 (Async/Background Execution)', () => {
    beforeEach(() => {
        RegisterServerUserImpersonationConfig({ enabled: true, allowWrites: true });
    });

    afterEach(() => {
        RegisterServerUserImpersonationConfig(null);
    });

    describe('Item 8 — every side-effecting @Query refuses both ViewAs and ActAs impersonation sessions', () => {
        it.each(['ViewAs', 'ActAs'] as const)(
            'refuses IntegrationProbeCredentials, IntegrationTestConnection, IntegrationPreviewData, CreatePreAuthDownloadUrl, ArtifactFileDownloadUrl, and RunEntityCommunicationByViewID in %s mode',
            async (mode) => {
                const ctx = makeImpersonatedContext(mode);
                const integrationResolver = new IntegrationDiscoveryResolver();
                const fileResolver = new FileResolver();
                const artifactFileResolver = new ArtifactFileResolver();
                const entityCommsResolver = new EntityCommunicationsResolver();

                await expect(
                    integrationResolver.IntegrationProbeCredentials('int-1', '{}', ctx)
                ).rejects.toThrow(/prohibited during user impersonation/i);

                await expect(
                    integrationResolver.IntegrationTestConnection('ci-1', ctx)
                ).rejects.toThrow(/prohibited during user impersonation/i);

                await expect(
                    integrationResolver.IntegrationPreviewData('ci-1', 'Contacts', 5, ctx)
                ).rejects.toThrow(/prohibited during user impersonation/i);

                await expect(
                    fileResolver.CreatePreAuthDownloadUrl(
                        { AccountID: 'acc-1', ObjectName: 'secret.pdf' },
                        ctx
                    )
                ).rejects.toThrow(/prohibited during user impersonation/i);

                await expect(
                    artifactFileResolver.ArtifactFileDownloadUrl('ver-1', ctx)
                ).rejects.toThrow(/prohibited during user impersonation/i);

                await expect(
                    entityCommsResolver.RunEntityCommunicationByViewID(
                        'ent-1',
                        { ViewID: 'view-1' } as Parameters<EntityCommunicationsResolver['RunEntityCommunicationByViewID']>[1],
                        'SendGrid',
                        'Email',
                        {} as Parameters<EntityCommunicationsResolver['RunEntityCommunicationByViewID']>[4],
                        true,
                        false,
                        ctx
                    )
                ).rejects.toThrow(/prohibited during user impersonation/i);
            }
        );
    });

    describe('Item 10 — async/background execution resolvers refuse ActAs impersonation sessions', () => {
        it('refuses ActionResolver, ExecuteRemoteOperationResolver, RunAIPromptResolver, and RunAIAgentResolver even in ActAs mode', async () => {
            const ctx = makeImpersonatedContext('ActAs');
            const actionResolver = new ActionResolver();
            const remoteOpResolver = new ExecuteRemoteOperationResolver();
            const promptResolver = new RunAIPromptResolver();
            const agentResolver = new RunAIAgentResolver();

            await expect(
                actionResolver.RunAction(
                    { ActionID: 'act-1', Params: [] } as Parameters<ActionResolver['RunAction']>[0],
                    ctx
                )
            ).rejects.toThrow(/prohibited during user impersonation/i);

            await expect(
                actionResolver.RunEntityAction(
                    { EntityActionID: 'ea-1', InvocationType: 'SingleRecord' } as Parameters<ActionResolver['RunEntityAction']>[0],
                    ctx
                )
            ).rejects.toThrow(/prohibited during user impersonation/i);

            await expect(
                remoteOpResolver.ExecuteRemoteOperation(
                    { Operation: 'test.op' } as Parameters<ExecuteRemoteOperationResolver['ExecuteRemoteOperation']>[0],
                    ctx,
                    {} as Parameters<ExecuteRemoteOperationResolver['ExecuteRemoteOperation']>[2]
                )
            ).rejects.toThrow(/prohibited during user impersonation/i);

            await expect(
                promptResolver.RunAIPrompt('prompt-1', ctx)
            ).rejects.toThrow(/prohibited during user impersonation/i);

            await expect(
                promptResolver.ExecuteSimplePrompt('You are a helper', { userPayload: ctx.userPayload })
            ).rejects.toThrow(/prohibited during user impersonation/i);

            await expect(
                promptResolver.EmbedText(['hello'], 'small', { userPayload: ctx.userPayload })
            ).rejects.toThrow(/prohibited during user impersonation/i);

            await expect(
                agentResolver.RunAIAgent(
                    'agent-1',
                    ctx,
                    '[]',
                    'sess-1',
                    {} as Parameters<RunAIAgentResolver['RunAIAgent']>[4]
                )
            ).rejects.toThrow(/prohibited during user impersonation/i);

            await expect(
                agentResolver.RunAIAgentFromConversationDetail(
                    'msg-1',
                    'agent-1',
                    ctx,
                    'sess-1',
                    {} as Parameters<RunAIAgentResolver['RunAIAgentFromConversationDetail']>[4]
                )
            ).rejects.toThrow(/prohibited during user impersonation/i);

            await expect(
                agentResolver.RespondToAgentRequest('req-1', 'Approved', ctx)
            ).rejects.toThrow(/prohibited during user impersonation/i);

            await expect(
                agentResolver.ReassignAgentRequest('req-1', ACTOR_USER_ID, ctx)
            ).rejects.toThrow(/prohibited during user impersonation/i);
        });
    });

    describe('AST decorator coverage lock — @RefuseImpersonationSessions() stays attached to every side-effecting & async resolver', () => {
        const RESOLVERS_DIR = path.resolve(__dirname, '../resolvers');

        function hasDecoratorOnClassOrMethod(
            fileName: string,
            decoratorName: string,
            methodNames?: readonly string[]
        ): { classHas: boolean; methodsWith: Set<string> } {
            const fullPath = path.join(RESOLVERS_DIR, fileName);
            const src = fs.readFileSync(fullPath, 'utf8');
            const sf = ts.createSourceFile(fullPath, src, ts.ScriptTarget.Latest, true);
            let classHas = false;
            const methodsWith = new Set<string>();

            const hasDec = (mods: readonly ts.ModifierLike[] | undefined): boolean =>
                Boolean(
                    mods?.some(
                        (m) =>
                            ts.isDecorator(m) &&
                            ((ts.isCallExpression(m.expression) &&
                                ts.isIdentifier(m.expression.expression) &&
                                m.expression.expression.text === decoratorName) ||
                                (ts.isIdentifier(m.expression) && m.expression.text === decoratorName))
                    )
                );

            const visit = (node: ts.Node): void => {
                if (ts.isClassDeclaration(node)) {
                    if (hasDec(ts.getDecorators(node))) {
                        classHas = true;
                    }
                    if (methodNames) {
                        for (const member of node.members) {
                            if (
                                ts.isMethodDeclaration(member) &&
                                ts.isIdentifier(member.name) &&
                                methodNames.includes(member.name.text) &&
                                hasDec(ts.getDecorators(member))
                            ) {
                                methodsWith.add(member.name.text);
                            }
                        }
                    }
                }
                ts.forEachChild(node, visit);
            };
            visit(sf);
            return { classHas, methodsWith };
        }

        it('locks @RefuseImpersonationSessions() on every required class/method', () => {
            const classLevelFiles = [
                'RunAIPromptResolver.ts',
                'RunTemplateResolver.ts',
                'AutotagPipelineResolver.ts',
                'SqlLoggingConfigResolver.ts',
            ];
            for (const file of classLevelFiles) {
                const { classHas } = hasDecoratorOnClassOrMethod(file, 'RefuseImpersonationSessions');
                expect(classHas, `${file} is missing class-level @RefuseImpersonationSessions()`).toBe(true);
            }

            const methodLevelFiles: Array<[string, readonly string[]]> = [
                ['ActionResolver.ts', ['RunAction', 'RunEntityAction']],
                ['ExecuteRemoteOperationResolver.ts', ['ExecuteRemoteOperation']],
                ['IntegrationDiscoveryResolver.ts', ['IntegrationProbeCredentials', 'IntegrationTestConnection', 'IntegrationPreviewData']],
                ['FileResolver.ts', ['CreatePreAuthDownloadUrl']],
                ['ArtifactFileResolver.ts', ['ArtifactFileDownloadUrl']],
                ['EntityCommunicationsResolver.ts', ['RunEntityCommunicationByViewID']],
                ['RunAIAgentResolver.ts', ['RunAIAgent', 'RunAIAgentFromConversationDetail', 'RespondToAgentRequest', 'ReassignAgentRequest']],
            ];
            for (const [file, methods] of methodLevelFiles) {
                const { methodsWith } = hasDecoratorOnClassOrMethod(file, 'RefuseImpersonationSessions', methods);
                for (const m of methods) {
                    expect(
                        methodsWith.has(m),
                        `${file}.${m} is missing method-level @RefuseImpersonationSessions()`
                    ).toBe(true);
                }
            }
        });
    });
});
