import { describe, it, expect, vi } from 'vitest';
import type { IMetadataProvider } from '@memberjunction/core';
import { MJGlobal } from '@memberjunction/global';
import { Outcome } from '@memberjunction/work-queue-core';
import type { WorkContext, WorkMessage, WorkOutcome } from '@memberjunction/work-queue-core';
import { BaseWorkHandler } from '../handlers/BaseWorkHandler';
import { BoundWorkHandler, SharedProviderSource } from '../handlers/BoundWorkHandler';
import type { WorkQueueProviderSource } from '../handlers/BoundWorkHandler';
import { ResolveWorkHandler } from '../handlers/ResolveWorkHandler';
import { IndependentProviderSource } from '../handlers/IndependentProviderSource';
import { MakeContext, MakeMessage, TEST_PROVIDER, TEST_USER } from './runtimeFakes';

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

class SlowHandler extends BaseWorkHandler {
    public static Seen: IMetadataProvider[] = [];
    public async Handle(message: WorkMessage, _context: WorkContext): Promise<WorkOutcome> {
        SlowHandler.Seen.push(this.Provider);
        await new Promise((resolve) => setTimeout(resolve, 5));
        if (message.Attributes.throw === 'yes') {
            throw new Error('handler blew up');
        }
        return Outcome.Complete();
    }
}
MJGlobal.Instance.ClassFactory.Register(BaseWorkHandler, SlowHandler, 'test.slow-handler');

describe('IndependentProviderSource — a provider per delivery (#6273)', () => {
    function factory() {
        const released: string[] = [];
        let n = 0;
        const base = {
            CreateIndependentInstance: vi.fn(async () => {
                const id = `p${++n}`;
                return { Id: id, ReleaseIndependentInstance: vi.fn(async () => { released.push(id); }) } as unknown as IMetadataProvider & { ReleaseIndependentInstance(): Promise<void> };
            }),
        };
        return { base, released };
    }

    it('gives two concurrent deliveries distinct providers and releases each once', async () => {
        const { base, released } = factory();
        SlowHandler.Seen = [];
        const bound = new BoundWorkHandler('test.slow-handler', TEST_USER, new IndependentProviderSource(base), ResolveWorkHandler);

        await Promise.all([bound.Handle(MakeMessage(), MakeContext()), bound.Handle(MakeMessage(), MakeContext())]);

        expect(SlowHandler.Seen).toHaveLength(2);
        expect(SlowHandler.Seen[0]).not.toBe(SlowHandler.Seen[1]);
        expect(released.sort()).toEqual(['p1', 'p2']);
    });

    it('releases the provider when the handler throws', async () => {
        const { base, released } = factory();
        const bound = new BoundWorkHandler('test.slow-handler', TEST_USER, new IndependentProviderSource(base), ResolveWorkHandler);

        await expect(bound.Handle(MakeMessage({ Attributes: { throw: 'yes' } }), MakeContext())).rejects.toThrow('handler blew up');
        expect(released).toEqual(['p1']);
    });

    it('a shared source needs no release', async () => {
        const bound = new BoundWorkHandler('test.echo-handler', TEST_USER, new SharedProviderSource(TEST_PROVIDER), ResolveWorkHandler);
        expect(await bound.Handle(MakeMessage(), MakeContext())).toEqual({ Kind: 'Complete' });
    });
});
