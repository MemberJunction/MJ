/**
 * Unit tests for in-process Remote Operation dispatch — resolving a registered operation by key
 * and running it server-side, including the unknown-operation and no-user failure paths.
 */

import { describe, it, expect } from 'vitest';
import { RegisterClass } from '@memberjunction/global';
import { BaseRemotableOperation, RemoteOpServerContext } from '../generic/baseRemotableOperation';
import { dispatchRemoteOperationInProcess } from '../generic/remoteOperationDispatch';
import { IMetadataProvider, RemoteOpProgress } from '../generic/interfaces';
import { UserInfo } from '../generic/securityInfo';

interface EchoInput { value: number }
interface EchoOutput { doubled: number }

@RegisterClass(BaseRemotableOperation, 'Test.DispatchEcho')
class EchoOperation extends BaseRemotableOperation<EchoInput, EchoOutput> {
    public readonly OperationKey = 'Test.DispatchEcho';
    protected async InternalExecute(input: EchoInput): Promise<EchoOutput> {
        return { doubled: input.value * 2 };
    }
}
// reference the class so bundlers/registration retain it
void EchoOperation;

/** A LongRunning op that emits two progress updates before returning — exercises the context.emitProgress path. */
@RegisterClass(BaseRemotableOperation, 'Test.DispatchProgress')
class ProgressOperation extends BaseRemotableOperation<EchoInput, EchoOutput> {
    public readonly OperationKey = 'Test.DispatchProgress';
    public readonly ExecutionMode = 'LongRunning' as const;
    protected async InternalExecute(input: EchoInput, _p: IMetadataProvider, _u: UserInfo, context: RemoteOpServerContext): Promise<EchoOutput> {
        context.emitProgress({ OperationKey: this.OperationKey, Processed: 1, Total: 2, Message: 'half' });
        context.emitProgress({ OperationKey: this.OperationKey, Processed: 2, Total: 2, Message: 'done' });
        return { doubled: input.value * 2 };
    }
}
void ProgressOperation;

const PROVIDER = {} as IMetadataProvider;
const USER = {} as UserInfo;

describe('dispatchRemoteOperationInProcess', () => {
    it('resolves a registered operation by key and runs it server-side', async () => {
        const result = await dispatchRemoteOperationInProcess<EchoInput, EchoOutput>(
            'Test.DispatchEcho',
            { value: 21 },
            { user: USER },
            PROVIDER,
        );
        expect(result.Success).toBe(true);
        expect(result.ResultCode).toBe('SUCCESS');
        expect(result.Output).toEqual({ doubled: 42 });
    });

    it('returns UNKNOWN_OPERATION for an unregistered key', async () => {
        const result = await dispatchRemoteOperationInProcess('Test.NotRegistered', {}, { user: USER }, PROVIDER);
        expect(result.Success).toBe(false);
        expect(result.ResultCode).toBe('UNKNOWN_OPERATION');
    });

    it('returns NO_USER when no acting user is available', async () => {
        const result = await dispatchRemoteOperationInProcess('Test.DispatchEcho', { value: 1 }, {}, PROVIDER);
        expect(result.Success).toBe(false);
        expect(result.ResultCode).toBe('NO_USER');
    });

    it('falls back to the provided fallback user when options.user is absent', async () => {
        const result = await dispatchRemoteOperationInProcess<EchoInput, EchoOutput>(
            'Test.DispatchEcho',
            { value: 5 },
            {},
            PROVIDER,
            USER,
        );
        expect(result.Success).toBe(true);
        expect(result.Output).toEqual({ doubled: 10 });
    });

    it('forwards each context.emitProgress to options.onProgress (attached in-process)', async () => {
        const events: RemoteOpProgress[] = [];
        const result = await dispatchRemoteOperationInProcess<EchoInput, EchoOutput>(
            'Test.DispatchProgress',
            { value: 3 },
            { user: USER, onProgress: (p) => events.push(p) },
            PROVIDER,
        );
        expect(result.Success).toBe(true);
        expect(result.Output).toEqual({ doubled: 6 });
        expect(events).toHaveLength(2);
        expect(events.map((e) => e.OperationKey)).toEqual(['Test.DispatchProgress', 'Test.DispatchProgress']);
        expect(events.map((e) => e.Processed)).toEqual([1, 2]);
    });

    it('runs without error when no onProgress is supplied (emitProgress is a safe no-op)', async () => {
        const result = await dispatchRemoteOperationInProcess('Test.DispatchProgress', { value: 4 }, { user: USER }, PROVIDER);
        expect(result.Success).toBe(true);
        expect(result.Output).toEqual({ doubled: 8 });
    });
});
