import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PubSubEngine } from 'type-graphql';

vi.mock('../config.js', () => ({
    configInfo: {},
}));

import { RegisterClass } from '@memberjunction/global';
import {
    BaseRemotableOperation,
    RemoteOperationError,
    type IMetadataProvider,
    type RemoteOpInvokeOptions,
    type RemoteOpResult,
    type RemoteOpServerContext,
    type UserInfo,
} from '@memberjunction/core';
import { RemoteOperationEngineBase } from '@memberjunction/core-entities';
import { DispatchRemoteOperationInProcess } from '@memberjunction/core';
import { ExecuteRemoteOperationResolver, ExecuteRemoteOperationInput } from '../resolvers/ExecuteRemoteOperationResolver.js';
import type { AppContext } from '../types.js';

interface TestOpInput {
    message: string;
}

interface TestOpOutput {
    echoed: string;
    origin?: string;
    ip?: string;
    sessionId?: string;
    apiKeyHash?: string;
}

@RegisterClass(BaseRemotableOperation, 'TestServer.ContextEcho')
class ContextEchoOperation extends BaseRemotableOperation<TestOpInput, TestOpOutput> {
    public readonly OperationKey = 'TestServer.ContextEcho';
    public override readonly ContractFingerprint = 'ro_fp_expected12345678';

    protected override async Authorize(
        _input: TestOpInput,
        _user: UserInfo,
        context?: RemoteOpServerContext,
    ): Promise<boolean> {
        return context?.requestOrigin !== 'https://evil.example.com';
    }

    protected override async InternalExecute(
        input: TestOpInput,
        _provider: IMetadataProvider,
        _user: UserInfo,
        context: RemoteOpServerContext,
    ): Promise<TestOpOutput> {
        return {
            echoed: input.message,
            origin: context.requestOrigin,
            ip: context.clientIp,
            sessionId: context.sessionId,
            apiKeyHash: context.apiKeyHash,
        };
    }
}
void ContextEchoOperation;

@RegisterClass(BaseRemotableOperation, 'TestServer.StructuredFailure')
class StructuredFailureOperation extends BaseRemotableOperation<TestOpInput, TestOpOutput> {
    public readonly OperationKey = 'TestServer.StructuredFailure';

    protected override async InternalExecute(): Promise<TestOpOutput> {
        throw new RemoteOperationError('CUSTOM_DOMAIN_CODE', 'Structured domain validation rejected request');
    }
}
void StructuredFailureOperation;

describe('ExecuteRemoteOperationResolver', () => {
    const fakeUser = { ID: 'user-1', Email: 'ada@example.com' } as UserInfo;
    const pubSub: PubSubEngine = {
        publish: vi.fn(async () => undefined),
        subscribe: vi.fn(async () => 1),
        unsubscribe: vi.fn(),
        asyncIterator: vi.fn(),
    } as PubSubEngine;

    beforeEach(() => {
        vi.spyOn(RemoteOperationEngineBase.Instance, 'Config').mockResolvedValue(undefined);
        vi.spyOn(RemoteOperationEngineBase.Instance, 'IsInvokable').mockReturnValue({ Invokable: true });
        vi.spyOn(RemoteOperationEngineBase.Instance, 'GetContractFingerprint').mockReturnValue(undefined);
    });

    function buildContext(overrides: Partial<AppContext> = {}): {
        ctx: AppContext;
        capturedOptions: RemoteOpInvokeOptions[];
    } {
        const capturedOptions: RemoteOpInvokeOptions[] = [];
        const provider = {
            RouteOperation: async <TIn, TOut>(
                key: string,
                opInput: TIn,
                options: RemoteOpInvokeOptions = {},
            ): Promise<RemoteOpResult<TOut>> => {
                capturedOptions.push(options);
                return DispatchRemoteOperationInProcess<TIn, TOut>(
                    key,
                    opInput,
                    options,
                    provider as IMetadataProvider,
                    fakeUser,
                );
            },
        };

        const ctx: AppContext = {
            dataSource: {} as AppContext['dataSource'],
            dataSources: [],
            providers: [{ provider: provider as AppContext['providers'][number]['provider'], type: 'Read-Write' }],
            userPayload: {
                email: 'ada@example.com',
                userRecord: fakeUser,
                sessionId: 'sess-abc-123',
                apiKeyHash: 'hash-xyz-987',
            },
            RequestOrigin: 'https://app.example.com',
            ClientIp: '198.51.100.24',
            ...overrides,
        };
        return { ctx, capturedOptions };
    }

    it('forwards RequestOrigin, ClientIp, sessionId, and apiKeyHash into RouteOperation and Authorize/InternalExecute', async () => {
        const resolver = new ExecuteRemoteOperationResolver();
        const { ctx, capturedOptions } = buildContext();

        const input: ExecuteRemoteOperationInput = {
            operationKey: 'TestServer.ContextEcho',
            inputJSON: JSON.stringify({ message: 'hi' }),
            invokeMode: 'attached',
            contractFingerprint: 'ro_fp_expected12345678',
        };

        const res = await resolver.ExecuteRemoteOperation(input, ctx, pubSub);
        expect(res.success).toBe(true);
        expect(res.resultCode).toBe('SUCCESS');
        expect(capturedOptions).toHaveLength(1);
        expect(capturedOptions[0].requestOrigin).toBe('https://app.example.com');
        expect(capturedOptions[0].clientIp).toBe('198.51.100.24');
        expect(capturedOptions[0].sessionId).toBe('sess-abc-123');
        expect(capturedOptions[0].apiKeyHash).toBe('hash-xyz-987');

        const parsed = JSON.parse(res.outputJSON!) as TestOpOutput;
        expect(parsed).toEqual({
            echoed: 'hi',
            origin: 'https://app.example.com',
            ip: '198.51.100.24',
            sessionId: 'sess-abc-123',
            apiKeyHash: 'hash-xyz-987',
        });
    });

    it('enforces Authorize against context.requestOrigin', async () => {
        const resolver = new ExecuteRemoteOperationResolver();
        const { ctx } = buildContext({ RequestOrigin: 'https://evil.example.com' });

        const res = await resolver.ExecuteRemoteOperation(
            {
                operationKey: 'TestServer.ContextEcho',
                inputJSON: JSON.stringify({ message: 'hi' }),
                invokeMode: 'attached',
            },
            ctx,
            pubSub,
        );
        expect(res.success).toBe(false);
        expect(res.resultCode).toBe('FORBIDDEN');
    });

    it('rejects stale client contractFingerprint with CONTRACT_MISMATCH before running operation', async () => {
        const resolver = new ExecuteRemoteOperationResolver();
        const { ctx, capturedOptions } = buildContext();

        const res = await resolver.ExecuteRemoteOperation(
            {
                operationKey: 'TestServer.ContextEcho',
                inputJSON: JSON.stringify({ message: 'hi' }),
                invokeMode: 'attached',
                contractFingerprint: 'ro_fp_stale00000000000',
            },
            ctx,
            pubSub,
        );
        expect(res.success).toBe(false);
        expect(res.resultCode).toBe('CONTRACT_MISMATCH');
        expect(capturedOptions).toHaveLength(0);
    });

    it('surfaces custom RemoteOperationError ResultCodes on the GraphQL result', async () => {
        const resolver = new ExecuteRemoteOperationResolver();
        const { ctx } = buildContext();

        const res = await resolver.ExecuteRemoteOperation(
            {
                operationKey: 'TestServer.StructuredFailure',
                inputJSON: JSON.stringify({ message: 'check' }),
                invokeMode: 'attached',
            },
            ctx,
            pubSub,
        );
        expect(res.success).toBe(false);
        expect(res.resultCode).toBe('CUSTOM_DOMAIN_CODE');
        expect(res.errorMessage).toBe('Structured domain validation rejected request');
    });
});
