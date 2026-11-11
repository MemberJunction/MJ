import { describe, it, expect, vi } from 'vitest';
import type { IMetadataProvider } from '@memberjunction/core';
import { MJGlobal } from '@memberjunction/global';
import { Outcome } from '@memberjunction/work-queue-core';
import type { WorkContext, WorkMessage, WorkOutcome } from '@memberjunction/work-queue-core';
import { BaseWorkHandler } from '../handlers/BaseWorkHandler';
import { BoundWorkHandler, IndependentProviderSource, SharedProviderSource } from '../handlers/BoundWorkHandler';
import type { IndependentInstanceRoot, WorkQueueProviderSource } from '../handlers/BoundWorkHandler';
import { ResolveWorkHandler } from '../handlers/ResolveWorkHandler';
import { MakeContext, MakeMessage, SilentLogger, TEST_PROVIDER, TEST_USER } from './runtimeFakes';

class EchoHandler extends BaseWorkHandler {
    public static LastBound: { UserID: string; Provider: IMetadataProvider } | null = null;

    public async Handle(message: WorkMessage, _context: WorkContext): Promise<WorkOutcome> {
        EchoHandler.LastBound = { UserID: this.ContextUser.ID, Provider: this.Provider };
        return message.Attributes.fail === 'yes' ? Outcome.DeadLetter('asked to fail') : Outcome.Complete();
    }
}

MJGlobal.Instance.ClassFactory.Register(BaseWorkHandler, EchoHandler, 'test.echo-handler');

function countingSource(): WorkQueueProviderSource & { Calls: number } {
    const source = {
        Calls: 0,
        CreateProvider: async (): Promise<IMetadataProvider> => {
            source.Calls++;
            return TEST_PROVIDER;
        },
    };
    return source;
}

describe('ResolveWorkHandler', () => {
    it('returns null for a blank key', () => {
        expect(ResolveWorkHandler('   ')).toBeNull();
    });

    it('returns null when nothing is registered under the key', () => {
        expect(ResolveWorkHandler('test.no-such-handler')).toBeNull();
    });

    it('returns a new instance per call, matching keys trimmed and case-insensitively', () => {
        const first = ResolveWorkHandler(' Test.Echo-Handler ');
        expect(first).toBeInstanceOf(EchoHandler);
        expect(ResolveWorkHandler('test.echo-handler')).not.toBe(first);
    });
});

describe('BoundWorkHandler', () => {
    it('binds the context user and a sourced provider, then delegates', async () => {
        const source = countingSource();
        const bound = new BoundWorkHandler('test.echo-handler', TEST_USER, source, ResolveWorkHandler);
        expect(await bound.Handle(MakeMessage(), MakeContext())).toEqual({ Kind: 'Complete' });
        expect(EchoHandler.LastBound).toEqual({ UserID: TEST_USER.ID, Provider: TEST_PROVIDER });
        expect(source.Calls).toBe(1);
    });

    it("returns the handler's own outcome", async () => {
        const bound = new BoundWorkHandler('test.echo-handler', TEST_USER, countingSource(), ResolveWorkHandler);
        const outcome = await bound.Handle(MakeMessage({ Attributes: { fail: 'yes' } }), MakeContext());
        expect(outcome).toEqual({ Kind: 'DeadLetter', Reason: 'asked to fail' });
    });

    it('dead-letters with HandlerNotRegistered when the key no longer resolves, without minting a provider', async () => {
        const source = countingSource();
        const bound = new BoundWorkHandler('test.echo-handler', TEST_USER, source, () => null);
        expect(await bound.Handle(MakeMessage(), MakeContext())).toEqual({ Kind: 'DeadLetter', Reason: 'HandlerNotRegistered' });
        expect(source.Calls).toBe(0);
    });

    it('releases the minted provider after the handler settles (#6273)', async () => {
        const released: IMetadataProvider[] = [];
        const source: WorkQueueProviderSource = {
            CreateProvider: async () => TEST_PROVIDER,
            ReleaseProvider: async provider => { released.push(provider); },
        };
        const bound = new BoundWorkHandler('test.echo-handler', TEST_USER, source, ResolveWorkHandler);
        await bound.Handle(MakeMessage(), MakeContext());
        expect(released).toEqual([TEST_PROVIDER]);
    });

    it('releases the minted provider even when the handler throws (#6273)', async () => {
        const released: IMetadataProvider[] = [];
        const source: WorkQueueProviderSource = {
            CreateProvider: async () => TEST_PROVIDER,
            ReleaseProvider: async provider => { released.push(provider); },
        };
        const bound = new BoundWorkHandler('test.echo-handler', TEST_USER, source, () => {
            const handler = ResolveWorkHandler('test.echo-handler') as EchoHandler;
            handler.Handle = async () => { throw new Error('handler blew up'); };
            return handler;
        });
        await expect(bound.Handle(MakeMessage(), MakeContext())).rejects.toThrow('handler blew up');
        expect(released).toEqual([TEST_PROVIDER]);
    });

    it("keeps the handler's outcome and logs when ReleaseProvider throws", async () => {
        const source: WorkQueueProviderSource = {
            CreateProvider: async () => TEST_PROVIDER,
            ReleaseProvider: async () => { throw new Error('rollback failed'); },
        };
        const log = new SilentLogger();
        const bound = new BoundWorkHandler('test.echo-handler', TEST_USER, source, ResolveWorkHandler);
        expect(await bound.Handle(MakeMessage(), MakeContext({ Log: log }))).toEqual({ Kind: 'Complete' });
        expect(log.Lines.some(line => line.includes('rollback failed'))).toBe(true);
    });

    it('lets a provider failure propagate so the runtime retries the delivery', async () => {
        const failing: WorkQueueProviderSource = { CreateProvider: vi.fn(async () => { throw new Error('pool exhausted'); }) };
        const bound = new BoundWorkHandler('test.echo-handler', TEST_USER, failing, ResolveWorkHandler);
        await expect(bound.Handle(MakeMessage(), MakeContext())).rejects.toThrow('pool exhausted');
    });
});

describe('SharedProviderSource', () => {
    it('returns the same provider on every call', async () => {
        const source = new SharedProviderSource(TEST_PROVIDER);
        expect(await source.CreateProvider()).toBe(TEST_PROVIDER);
        expect(await source.CreateProvider()).toBe(TEST_PROVIDER);
    });
});

describe('IndependentProviderSource', () => {
    function root() {
        const minted: Array<{ Name: string; Released: number; ReleaseIndependentInstance(): Promise<void> }> = [];
        const provider = {
            Name: 'root',
            CreateIndependentInstance: async () => {
                const child = { Name: `child-${minted.length + 1}`, Released: 0, ReleaseIndependentInstance: async (): Promise<void> => { child.Released++; } };
                minted.push(child);
                return child;
            },
        };
        return { provider, minted };
    }

    it('mints a new instance for every delivery instead of sharing the root provider (#6273)', async () => {
        const { provider, minted } = root();
        const source = new IndependentProviderSource(provider as unknown as IndependentInstanceRoot);
        const first = await source.CreateProvider();
        const second = await source.CreateProvider();
        expect(first).not.toBe(second);
        expect(first).not.toBe(provider);
        expect(minted).toHaveLength(2);
    });

    it('releases the instance it minted', async () => {
        const { provider, minted } = root();
        const source = new IndependentProviderSource(provider as unknown as IndependentInstanceRoot);
        const child = await source.CreateProvider();
        await source.ReleaseProvider(child);
        expect(minted[0].Released).toBe(1);
    });
});
