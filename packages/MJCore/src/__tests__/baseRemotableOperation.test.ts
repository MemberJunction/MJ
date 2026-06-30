/**
 * Unit tests for the Remote Operations core primitive (RO-0):
 *  - BaseRemotableOperation: Execute (provider routing) + ExecuteServer (in-process orchestration)
 *  - ProviderBase.RouteOperation: default transport behavior (key validation + not-supported)
 *
 * No database connection — uses a lightweight in-memory provider and the existing TestMetadataProvider mock.
 */

import { describe, it, expect } from 'vitest';
import { BaseRemotableOperation, RemoteOpServerContext } from '../generic/baseRemotableOperation';
import { IMetadataProvider, IRemoteOperationProvider, RemoteOpInvokeOptions, RemoteOpResult } from '../generic/interfaces';
import { Metadata } from '../generic/metadata';
import { UserInfo } from '../generic/securityInfo';
import { TestMetadataProvider } from './mocks/TestMetadataProvider';

// --- test fixtures -------------------------------------------------------------------------------

interface GreetInput { name: string }
interface GreetOutput { message: string }

/** A minimal Sync operation with a declared scope and a real InternalExecute. */
class GreetOperation extends BaseRemotableOperation<GreetInput, GreetOutput> {
    public readonly OperationKey = 'Test.Greet';
    public readonly RequiredScope = 'test:greet';
    protected async InternalExecute(input: GreetInput): Promise<GreetOutput> {
        return { message: `Hello, ${input.name}` };
    }
}

/** Same work, but denies authorization. */
class DenyOperation extends GreetOperation {
    public readonly OperationKey = 'Test.Deny';
    protected async Authorize(): Promise<boolean> {
        return false;
    }
}

/** InternalExecute throws. */
class ThrowOperation extends BaseRemotableOperation<GreetInput, GreetOutput> {
    public readonly OperationKey = 'Test.Throw';
    protected async InternalExecute(): Promise<GreetOutput> {
        throw new Error('boom');
    }
}

/** No InternalExecute override — exercises the throwing default. */
class NoImplOperation extends BaseRemotableOperation<GreetInput, GreetOutput> {
    public readonly OperationKey = 'Test.NoImpl';
}

/** Records routing calls and returns a canned response. */
class MockRouteProvider implements IRemoteOperationProvider {
    public calls: Array<{ key: string; input: unknown; options?: RemoteOpInvokeOptions }> = [];
    public response: RemoteOpResult = { Success: true, ResultCode: 'SUCCESS', Output: { routed: true } };
    public async RouteOperation<TInput = unknown, TOutput = unknown>(
        operationKey: string,
        input: TInput,
        options?: RemoteOpInvokeOptions,
    ): Promise<RemoteOpResult<TOutput>> {
        this.calls.push({ key: operationKey, input, options });
        return this.response as RemoteOpResult<TOutput>;
    }
}

const asProvider = (p: IRemoteOperationProvider): IMetadataProvider => p as unknown as IMetadataProvider;
const serverContext = (): RemoteOpServerContext => ({
    provider: {} as IMetadataProvider,
    user: {} as UserInfo,
    emitProgress: () => { /* no-op */ },
});

// --- tests ---------------------------------------------------------------------------------------

describe('BaseRemotableOperation', () => {
    describe('Execute — provider routing', () => {
        it('routes through the supplied provider with the operation key and input', async () => {
            const mock = new MockRouteProvider();
            const result = await new GreetOperation().Execute({ name: 'Ada' }, { provider: asProvider(mock) });

            expect(mock.calls).toHaveLength(1);
            expect(mock.calls[0].key).toBe('Test.Greet');
            expect(mock.calls[0].input).toEqual({ name: 'Ada' });
            expect(result.Success).toBe(true);
            expect(result.Output).toEqual({ routed: true });
        });

        it('falls back to the global Metadata.Provider when none is supplied', async () => {
            const mock = new MockRouteProvider();
            const previous = Metadata.Provider;
            try {
                Metadata.Provider = asProvider(mock);
                await new GreetOperation().Execute({ name: 'Grace' });
                expect(mock.calls[0].key).toBe('Test.Greet');
                expect(mock.calls[0].input).toEqual({ name: 'Grace' });
            } finally {
                Metadata.Provider = previous;
            }
        });

        it('returns NO_PROVIDER when no provider is available', async () => {
            const previous = Metadata.Provider;
            try {
                Metadata.Provider = undefined as unknown as IMetadataProvider;
                const result = await new GreetOperation().Execute({ name: 'x' });
                expect(result.Success).toBe(false);
                expect(result.ResultCode).toBe('NO_PROVIDER');
            } finally {
                Metadata.Provider = previous;
            }
        });
    });

    describe('ExecuteServer — in-process orchestration', () => {
        it('authorizes, runs InternalExecute, and returns the typed output', async () => {
            const result = await new GreetOperation().ExecuteServer({ name: 'Ada' }, serverContext());
            expect(result.Success).toBe(true);
            expect(result.ResultCode).toBe('SUCCESS');
            expect(result.Output).toEqual({ message: 'Hello, Ada' });
        });

        it('returns FORBIDDEN when Authorize denies', async () => {
            const result = await new DenyOperation().ExecuteServer({ name: 'Ada' }, serverContext());
            expect(result.Success).toBe(false);
            expect(result.ResultCode).toBe('FORBIDDEN');
            expect(result.Output).toBeUndefined();
        });

        it('captures an InternalExecute throw as EXECUTION_ERROR', async () => {
            const result = await new ThrowOperation().ExecuteServer({ name: 'x' }, serverContext());
            expect(result.Success).toBe(false);
            expect(result.ResultCode).toBe('EXECUTION_ERROR');
            expect(result.ErrorMessage).toContain('boom');
        });

        it('surfaces the throwing default with the operation key when no body is provided', async () => {
            const result = await new NoImplOperation().ExecuteServer({ name: 'x' }, serverContext());
            expect(result.Success).toBe(false);
            expect(result.ResultCode).toBe('EXECUTION_ERROR');
            expect(result.ErrorMessage).toContain('Test.NoImpl');
        });
    });

    describe('declared metadata', () => {
        it('exposes OperationKey, RequiredScope, and ExecutionMode', () => {
            const op = new GreetOperation();
            expect(op.OperationKey).toBe('Test.Greet');
            expect(op.RequiredScope).toBe('test:greet');
            expect(op.ExecutionMode).toBe('Sync');
        });

        it('defaults ExecutionMode to Sync and RequiredScope to undefined', () => {
            const op = new NoImplOperation();
            expect(op.ExecutionMode).toBe('Sync');
            expect(op.RequiredScope).toBeUndefined();
        });
    });
});

describe('ProviderBase.RouteOperation — default transport', () => {
    it('rejects an empty / whitespace operation key', async () => {
        const result = await new TestMetadataProvider().RouteOperation('   ', {});
        expect(result.Success).toBe(false);
        expect(result.ResultCode).toBe('INVALID_OPERATION_KEY');
    });

    it('reports NOT_SUPPORTED for a provider that has not opted into remote operations', async () => {
        const result = await new TestMetadataProvider().RouteOperation('Test.Greet', { name: 'x' });
        expect(result.Success).toBe(false);
        expect(result.ResultCode).toBe('NOT_SUPPORTED');
    });
});
