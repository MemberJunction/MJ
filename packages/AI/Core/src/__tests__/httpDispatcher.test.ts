import { describe, it, expect, vi } from 'vitest';
import {
    ConfigureLongRunningAIFetch,
    CreateLongRunningFetch,
    CreateLongRunningFetchDispatcher,
    DEFAULT_LONG_RUNNING_BODY_TIMEOUT_MS,
    DEFAULT_LONG_RUNNING_CONNECT_TIMEOUT_MS,
    DEFAULT_LONG_RUNNING_HEADERS_TIMEOUT_MS,
    DEFAULT_LONG_RUNNING_KEEP_ALIVE_MAX_TIMEOUT_MS,
    DEFAULT_LONG_RUNNING_KEEP_ALIVE_TIMEOUT_MS,
    GetLongRunningAIFetch,
    InstallGlobalLongRunningFetchDispatcher,
    PrimeNodeBuiltinUndiciDispatcher,
    ResetLongRunningAIFetch,
    ResolveLongRunningFetchDispatcherOptions,
    ResolveNodeBuiltinUndiciModule,
    type FetchDispatcherLike,
    type ResolvedUndiciAgentOptions,
    type UndiciModuleLike,
} from '../generic/httpDispatcher';

describe('httpDispatcher (long-running undici transport helpers)', () => {
    it('resolves safe long-running defaults and accepts explicit 0 timeouts to defer to AbortSignal', () => {
        const defaults = ResolveLongRunningFetchDispatcherOptions();
        expect(defaults).toEqual({
            headersTimeout: DEFAULT_LONG_RUNNING_HEADERS_TIMEOUT_MS,
            bodyTimeout: DEFAULT_LONG_RUNNING_BODY_TIMEOUT_MS,
            connectTimeout: DEFAULT_LONG_RUNNING_CONNECT_TIMEOUT_MS,
            keepAliveTimeout: DEFAULT_LONG_RUNNING_KEEP_ALIVE_TIMEOUT_MS,
            keepAliveMaxTimeout: DEFAULT_LONG_RUNNING_KEEP_ALIVE_MAX_TIMEOUT_MS,
        });

        const zeroed = ResolveLongRunningFetchDispatcherOptions({
            headersTimeoutMs: 0,
            bodyTimeoutMs: 0,
            connectTimeoutMs: 45_000,
        });
        expect(zeroed.headersTimeout).toBe(0);
        expect(zeroed.bodyTimeout).toBe(0);
        expect(zeroed.connectTimeout).toBe(45_000);

        // Negative or non-finite inputs fall back safely.
        const sanitized = ResolveLongRunningFetchDispatcherOptions({
            headersTimeoutMs: -500,
            bodyTimeoutMs: Number.NaN,
        });
        expect(sanitized.headersTimeout).toBe(DEFAULT_LONG_RUNNING_HEADERS_TIMEOUT_MS);
        expect(sanitized.bodyTimeout).toBe(DEFAULT_LONG_RUNNING_BODY_TIMEOUT_MS);
    });

    it('constructs an undici Agent dispatcher with resolved timeout options and degrades cleanly without undici', () => {
        expect(CreateLongRunningFetchDispatcher(undefined, null)).toBeNull();

        let capturedOptions: ResolvedUndiciAgentOptions | null = null;
        class FakeUndiciAgent implements FetchDispatcherLike {
            public readonly closed = vi.fn(async () => undefined);
            public constructor(opts: ResolvedUndiciAgentOptions) {
                capturedOptions = opts;
            }
            public async close(): Promise<void> {
                await this.closed();
            }
        }
        const fakeUndici: UndiciModuleLike = { Agent: FakeUndiciAgent };

        const dispatcher = CreateLongRunningFetchDispatcher({ headersTimeoutMs: 2_400_000, bodyTimeoutMs: 0 }, fakeUndici);
        expect(dispatcher).toBeInstanceOf(FakeUndiciAgent);
        expect(capturedOptions?.headersTimeout).toBe(2_400_000);
        expect(capturedOptions?.bodyTimeout).toBe(0);
    });

    it('attaches dispatcher to CreateLongRunningFetch requests while preserving AbortSignal and custom dispatcher', async () => {
        const createdDispatcher: FetchDispatcherLike = { close: vi.fn(async () => undefined) };
        const fakeUndici: UndiciModuleLike = {
            Agent: class {
                public constructor() {
                    return createdDispatcher;
                }
            },
        };

        const mockResponse = new Response('ok', { status: 200 });
        const baseFetch = vi.fn(async () => mockResponse);
        const wrappedFetch = CreateLongRunningFetch({ headersTimeoutMs: 0 }, baseFetch, fakeUndici);

        const controller = new AbortController();
        await wrappedFetch('https://api.example.com/v1/chat', {
            method: 'POST',
            signal: controller.signal,
            headers: { 'content-type': 'application/json' },
        });

        expect(baseFetch).toHaveBeenCalledTimes(1);
        const [, init] = baseFetch.mock.calls[0] as [string, { dispatcher?: FetchDispatcherLike; signal?: AbortSignal }];
        expect(init.dispatcher).toBe(createdDispatcher);
        expect(init.signal).toBe(controller.signal);

        // Explicit per-call dispatcher is preserved rather than clobbered.
        const customDispatcher: FetchDispatcherLike = {};
        await wrappedFetch('https://api.example.com/v1/chat', { dispatcher: customDispatcher });
        const [, secondInit] = baseFetch.mock.calls[1] as [string, { dispatcher?: FetchDispatcherLike }];
        expect(secondInit.dispatcher).toBe(customDispatcher);
    });

    it('installs and cleanly restores the global undici dispatcher', async () => {
        const originalGlobal: FetchDispatcherLike = { close: vi.fn(async () => undefined) };
        let currentGlobal: FetchDispatcherLike = originalGlobal;
        const closeMock = vi.fn(async () => undefined);

        class FakeAgent implements FetchDispatcherLike {
            public constructor(public readonly options: ResolvedUndiciAgentOptions) {}
            public close = closeMock;
        }
        const fakeUndici: UndiciModuleLike = {
            Agent: FakeAgent,
            getGlobalDispatcher: () => currentGlobal,
            setGlobalDispatcher: (d) => {
                currentGlobal = d;
            },
        };

        const install = InstallGlobalLongRunningFetchDispatcher({ headersTimeoutMs: 0, bodyTimeoutMs: 0 }, fakeUndici);
        expect(install.Installed).toBe(true);
        expect(install.Dispatcher).toBeInstanceOf(FakeAgent);
        expect(currentGlobal).toBe(install.Dispatcher);

        await install.Restore();
        expect(currentGlobal).toBe(originalGlobal);
        expect(closeMock).toHaveBeenCalledTimes(1);

        // Idempotent second restore.
        await install.Restore();
        expect(closeMock).toHaveBeenCalledTimes(1);
    });

    it('uses a finite 30-minute default bodyTimeout and primes/resolves Node built-in undici without external deps (2.7 regression)', async () => {
        expect(DEFAULT_LONG_RUNNING_BODY_TIMEOUT_MS).toBe(1_800_000);
        expect(DEFAULT_LONG_RUNNING_HEADERS_TIMEOUT_MS).toBe(1_800_000);

        const primed = await PrimeNodeBuiltinUndiciDispatcher();
        expect(primed).toBe(true);
        const builtin = ResolveNodeBuiltinUndiciModule();
        expect(builtin).not.toBeNull();

        const install = InstallGlobalLongRunningFetchDispatcher();
        expect(install.Installed).toBe(true);
        expect(install.Options.headersTimeout).toBe(1_800_000);
        expect(install.Options.bodyTimeout).toBe(1_800_000);
        await install.Restore();
    });

    it('scopes long-running fetch to AI SDKs via ConfigureLongRunningAIFetch without touching global dispatcher and skips ProxyAgent safely (B6)', async () => {
        await ResetLongRunningAIFetch();
        expect(GetLongRunningAIFetch()).toBeUndefined();

        const symbolKey = Symbol.for('undici.globalDispatcher.1');
        const slotHolder = globalThis as Record<PropertyKey, unknown>;
        const originalSlot = slotHolder[symbolKey];

        // 1. Simulate corporate ProxyAgent installed globally — MUST skip cleanly without throwing!
        class ProxyAgent implements FetchDispatcherLike {
            public constructor(opts: unknown) {
                if (!opts || typeof opts !== 'object' || !('uri' in (opts as Record<string, unknown>))) {
                    throw new Error('Proxy uri is mandatory');
                }
            }
        }
        try {
            slotHolder[symbolKey] = new ProxyAgent({ uri: 'http://corp-proxy.internal:8080' });
            expect(ResolveNodeBuiltinUndiciModule()).toBeNull();
            const skippedScoped = ConfigureLongRunningAIFetch({ headersTimeoutMs: 1_800_000, bodyTimeoutMs: 1_800_000 });
            expect(skippedScoped.Installed).toBe(false);
            expect(skippedScoped.SkippedReason).toMatch(/ProxyAgent/);
            expect(GetLongRunningAIFetch()).toBeUndefined();

            const skippedGlobal = InstallGlobalLongRunningFetchDispatcher();
            expect(skippedGlobal.Installed).toBe(false);
            expect(skippedGlobal.SkippedReason).toMatch(/ProxyAgent/);
        } finally {
            slotHolder[symbolKey] = originalSlot;
        }

        // 2. Scoped AI fetch attaches dispatcher only to calls using GetLongRunningAIFetch() and leaves global slot untouched
        const createdDispatcher: FetchDispatcherLike = { close: vi.fn(async () => undefined) };
        const fakeUndici: UndiciModuleLike = {
            Agent: class {
                public constructor() {
                    return createdDispatcher;
                }
            },
        };
        const baseFetch = vi.fn(async () => new Response('ok', { status: 200 }));
        const scoped = ConfigureLongRunningAIFetch({ headersTimeoutMs: 2_000_000, bodyTimeoutMs: 1_500_000 }, fakeUndici, baseFetch);
        expect(scoped.Installed).toBe(true);
        expect(slotHolder[symbolKey]).toBe(originalSlot);

        const aiFetch = GetLongRunningAIFetch();
        expect(aiFetch).toBeTypeOf('function');
        await aiFetch!('https://api.openai.com/v1/chat/completions', { method: 'POST' });
        const [, init] = baseFetch.mock.calls[0] as [string, { dispatcher?: FetchDispatcherLike }];
        expect(init.dispatcher).toBe(createdDispatcher);

        await scoped.Restore();
        expect(GetLongRunningAIFetch()).toBeUndefined();

        // R2-9: explicit disabled opt-out, host-supplied custom dispatcher, and constructor error surfacing
        const disabledRes = ConfigureLongRunningAIFetch({ disabled: true }, fakeUndici, baseFetch);
        expect(disabledRes.Installed).toBe(false);
        expect(disabledRes.SkippedReason).toMatch(/disabled/i);

        const hostClose = vi.fn(async () => undefined);
        const hostDispatcher: FetchDispatcherLike = { close: hostClose };
        const hostRes = ConfigureLongRunningAIFetch({ dispatcher: hostDispatcher }, undefined, baseFetch);
        expect(hostRes.Installed).toBe(true);
        expect(hostRes.Dispatcher).toBe(hostDispatcher);
        await hostRes.Restore();
        // Must NOT close a host-supplied dispatcher on Restore
        expect(hostClose).not.toHaveBeenCalled();

        const throwingUndici: UndiciModuleLike = {
            Agent: class {
                public constructor() {
                    throw new Error('custom-ctor-boom');
                }
            },
        };
        const failedRes = ConfigureLongRunningAIFetch({}, throwingUndici, baseFetch);
        expect(failedRes.Installed).toBe(false);
        expect(failedRes.SkippedReason).toContain('custom-ctor-boom');
    });
});
