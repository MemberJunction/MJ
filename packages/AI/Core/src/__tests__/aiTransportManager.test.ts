import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BaseSingleton } from '@memberjunction/global';
import {
    AITransportManager,
    DEFAULT_LONG_RUNNING_BODY_TIMEOUT_MS,
    DEFAULT_LONG_RUNNING_HEADERS_TIMEOUT_MS,
    UNDICI_GLOBAL_DISPATCHER_SYMBOL,
    type FetchDispatcherLike,
    type ResolvedUndiciAgentOptions,
    type UndiciModuleLike,
} from '../generic/aiTransportManager';
import {
    ConfigureLongRunningAIFetch,
    GetLongRunningAIFetch,
    IsLongRunningAIFetchConfigured,
    ResetLongRunningAIFetch,
} from '../generic/httpDispatcher';

describe('AITransportManager (BaseSingleton OO transport manager)', () => {
    beforeEach(async () => {
        await AITransportManager.Instance.Reset();
    });

    afterEach(async () => {
        await AITransportManager.Instance.Reset();
    });

    it('extends BaseSingleton and returns the same global instance across calls', () => {
        const instanceA = AITransportManager.Instance;
        const instanceB = AITransportManager.Instance;
        expect(instanceA).toBe(instanceB);
        expect(instanceA).toBeInstanceOf(BaseSingleton);
        expect(instanceA).toBeInstanceOf(AITransportManager);
    });

    it('configures, resolves, and restores AI-scoped fetch while leaving global undici slot untouched', async () => {
        expect(AITransportManager.Instance.IsConfigured()).toBe(false);
        expect(AITransportManager.Instance.ResolveFetch()).toBeUndefined();

        const createdDispatchers: Array<{ opts: ResolvedUndiciAgentOptions; close: ReturnType<typeof vi.fn> }> = [];
        const fakeUndici: UndiciModuleLike = {
            Agent: class implements FetchDispatcherLike {
                public readonly close = vi.fn(async () => undefined);
                public constructor(opts: ResolvedUndiciAgentOptions) {
                    createdDispatchers.push({ opts, close: this.close });
                }
            },
        };
        const baseFetch = vi.fn(async () => new Response('ok', { status: 200 }));
        const slotHolder = globalThis as Record<PropertyKey, unknown>;
        const originalSlot = slotHolder[UNDICI_GLOBAL_DISPATCHER_SYMBOL];

        const install = AITransportManager.Instance.Configure(
            { headersTimeoutMs: 2_400_000, bodyTimeoutMs: 900_000 },
            fakeUndici,
            baseFetch
        );

        expect(install.Installed).toBe(true);
        expect(AITransportManager.Instance.IsConfigured()).toBe(true);
        expect(slotHolder[UNDICI_GLOBAL_DISPATCHER_SYMBOL]).toBe(originalSlot);
        expect(createdDispatchers).toHaveLength(1);
        expect(createdDispatchers[0].opts.headersTimeout).toBe(2_400_000);
        expect(createdDispatchers[0].opts.bodyTimeout).toBe(900_000);

        const resolved = AITransportManager.Instance.ResolveFetch();
        expect(resolved).toBeTypeOf('function');
        await resolved!('https://api.example.com/v1/chat', { method: 'POST' });
        const [, init] = baseFetch.mock.calls[0] as [string, { dispatcher?: FetchDispatcherLike }];
        expect(init.dispatcher).toBe(install.Dispatcher);

        await install.Restore();
        expect(AITransportManager.Instance.IsConfigured()).toBe(false);
        expect(AITransportManager.Instance.ResolveFetch()).toBeUndefined();
        expect(createdDispatchers[0].close).toHaveBeenCalledTimes(1);
    });

    it('supports per-model overrides (timeout overrides, custom dispatcher, disabled opt-out) and caches override dispatchers cleanly', async () => {
        const createdDispatchers: Array<{ opts: ResolvedUndiciAgentOptions; close: ReturnType<typeof vi.fn> }> = [];
        const fakeUndici: UndiciModuleLike = {
            Agent: class implements FetchDispatcherLike {
                public readonly close = vi.fn(async () => undefined);
                public constructor(opts: ResolvedUndiciAgentOptions) {
                    createdDispatchers.push({ opts, close: this.close });
                }
            },
        };
        const baseFetch = vi.fn(async () => new Response('ok', { status: 200 }));
        AITransportManager.Instance.Configure(
            { headersTimeoutMs: 1_800_000, bodyTimeoutMs: 1_800_000 },
            fakeUndici,
            baseFetch
        );

        // Per-model timeout override creates an Agent once and reuses it from cache on identical overrides
        const overrideFetch1 = AITransportManager.Instance.ResolveFetch({ headersTimeoutMs: 60_000 });
        const overrideFetch2 = AITransportManager.Instance.ResolveFetch({ headersTimeoutMs: 60_000 });
        expect(overrideFetch1).toBeTypeOf('function');
        expect(overrideFetch2).toBe(overrideFetch1);
        expect(createdDispatchers).toHaveLength(2);
        expect(createdDispatchers[1].opts.headersTimeout).toBe(60_000);
        expect(createdDispatchers[1].opts.bodyTimeout).toBe(1_800_000);

        // Per-model disabled opt-out returns undefined
        expect(AITransportManager.Instance.ResolveFetch({ disabled: true })).toBeUndefined();

        // Per-model custom dispatcher wraps directly without constructing a new Agent
        const customDispatcher: FetchDispatcherLike = { close: vi.fn(async () => undefined) };
        const customFetch = AITransportManager.Instance.ResolveFetch({ dispatcher: customDispatcher });
        expect(customFetch).toBeTypeOf('function');
        await customFetch!('https://api.example.com/custom', { method: 'GET' });
        const [, callInit] = baseFetch.mock.calls[0] as [string, { dispatcher?: FetchDispatcherLike }];
        expect(callInit.dispatcher).toBe(customDispatcher);
        expect(createdDispatchers).toHaveLength(2);

        // Reset closes both the primary owned dispatcher and cached override dispatchers, but NOT host/custom dispatchers
        await AITransportManager.Instance.Reset();
        expect(createdDispatchers[0].close).toHaveBeenCalledTimes(1);
        expect(createdDispatchers[1].close).toHaveBeenCalledTimes(1);
        expect(customDispatcher.close).not.toHaveBeenCalled();
    });

    it('CreateBoundFetch late-binds transport configuration and dynamic overrides at execution time', async () => {
        const globalFetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('global', { status: 200 }));
        let dynamicOverrides: { headersTimeoutMs?: number } | undefined = undefined;

        // Created BEFORE AITransportManager.Instance.Configure() is called
        const boundFetch = AITransportManager.Instance.CreateBoundFetch(() => dynamicOverrides);

        // 1. Unconfigured -> falls back to globalThis.fetch
        await boundFetch('https://api.example.com/before', { method: 'POST' });
        expect(globalFetchSpy).toHaveBeenCalledTimes(1);

        // 2. Configure AFTER boundFetch was created -> boundFetch immediately picks up the new transport!
        const createdDispatchers: Array<{ opts: ResolvedUndiciAgentOptions; close: ReturnType<typeof vi.fn> }> = [];
        const fakeUndici: UndiciModuleLike = {
            Agent: class implements FetchDispatcherLike {
                public readonly close = vi.fn(async () => undefined);
                public constructor(opts: ResolvedUndiciAgentOptions) {
                    createdDispatchers.push({ opts, close: this.close });
                }
            },
        };
        const baseFetch = vi.fn(async () => new Response('scoped', { status: 200 }));
        AITransportManager.Instance.Configure(
            { headersTimeoutMs: DEFAULT_LONG_RUNNING_HEADERS_TIMEOUT_MS, bodyTimeoutMs: DEFAULT_LONG_RUNNING_BODY_TIMEOUT_MS },
            fakeUndici,
            baseFetch
        );

        await boundFetch('https://api.example.com/after', { method: 'POST' });
        expect(baseFetch).toHaveBeenCalledTimes(1);
        expect(globalFetchSpy).toHaveBeenCalledTimes(1);

        // 3. Dynamic override updated at runtime -> boundFetch picks up override dispatcher
        dynamicOverrides = { headersTimeoutMs: 45_000 };
        await boundFetch('https://api.example.com/override', { method: 'POST' });
        expect(baseFetch).toHaveBeenCalledTimes(2);
        expect(createdDispatchers).toHaveLength(2);
        expect(createdDispatchers[1].opts.headersTimeout).toBe(45_000);

        globalFetchSpy.mockRestore();
    });

    it('primes Node built-in undici dispatcher via PrimeNodeBuiltinUndici()', async () => {
        const primed = await AITransportManager.Instance.PrimeNodeBuiltinUndici();
        expect(primed).toBe(true);
    });

    it('deprecated httpDispatcher functions delegate directly to AITransportManager.Instance', async () => {
        const fakeUndici: UndiciModuleLike = {
            Agent: class implements FetchDispatcherLike {
                public readonly close = vi.fn(async () => undefined);
            },
        };
        const baseFetch = vi.fn(async () => new Response('ok'));

        expect(IsLongRunningAIFetchConfigured()).toBe(false);
        ConfigureLongRunningAIFetch({ headersTimeoutMs: 120_000 }, fakeUndici, baseFetch);
        expect(AITransportManager.Instance.IsConfigured()).toBe(true);
        expect(IsLongRunningAIFetchConfigured()).toBe(true);
        expect(GetLongRunningAIFetch()).toBe(AITransportManager.Instance.ResolveFetch());

        await ResetLongRunningAIFetch();
        expect(AITransportManager.Instance.IsConfigured()).toBe(false);
        expect(GetLongRunningAIFetch()).toBeUndefined();
    });
});
