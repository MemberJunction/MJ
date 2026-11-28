/**
 * @fileoverview Object-oriented AI HTTP transport manager (`AITransportManager`) and browser-safe
 * long-running `undici` dispatcher helpers for MemberJunction AI provider requests.
 *
 * Node's built-in `fetch` (backed by `undici`) enforces a default `headersTimeout` of `300_000ms`
 * (5 minutes). Long-running extended-thinking or tool-calling LLM requests (where streaming is
 * suppressed or first-byte latency exceeds 5 minutes) hit `UND_ERR_HEADERS_TIMEOUT`
 * (`TypeError: fetch failed`) well before the agent's liveness watchdog or caller `AbortSignal`
 * expires.
 *
 * `AITransportManager` extends `BaseSingleton<AITransportManager>` from `@memberjunction/global`,
 * guaranteeing a single process-wide transport configuration across bundled/duplicated modules
 * without touching Node's process-global `undici` dispatcher (preserving corporate `ProxyAgent` /
 * mTLS configurations and standard timeouts for non-AI outbound HTTP traffic).
 *
 * @module @memberjunction/ai
 */

import { BaseSingleton } from '@memberjunction/global';

/** Tuning: 30-minute default headers timeout when caller does not disable it (`0`) explicitly. */
export const DEFAULT_LONG_RUNNING_HEADERS_TIMEOUT_MS = 1_800_000;
/** Tuning: 30-minute finite default body timeout so dead sockets still fail cleanly; pass `0` to defer strictly to `AbortSignal`. */
export const DEFAULT_LONG_RUNNING_BODY_TIMEOUT_MS = 1_800_000;
/** Tuning: 30-second TCP/TLS connect timeout so unreachable endpoints fail fast. */
export const DEFAULT_LONG_RUNNING_CONNECT_TIMEOUT_MS = 30_000;
/** Tuning: 60-second idle keep-alive socket timeout matching standard HTTP/1.1 connection pools. */
export const DEFAULT_LONG_RUNNING_KEEP_ALIVE_TIMEOUT_MS = 60_000;
/** Tuning: 10-minute maximum keep-alive socket lifetime across pooled LLM calls. */
export const DEFAULT_LONG_RUNNING_KEEP_ALIVE_MAX_TIMEOUT_MS = 600_000;

/**
 * Configuration options for {@link AITransportManager.Configure} and {@link CreateLongRunningFetchDispatcher}.
 */
export interface LongRunningFetchDispatcherOptions {
    /**
     * Maximum time (ms) to wait for HTTP response headers before failing.
     * Pass `0` to disable undici's header timeout completely and rely on `AbortSignal`.
     * Defaults to {@link DEFAULT_LONG_RUNNING_HEADERS_TIMEOUT_MS} (`1_800_000` = 30 minutes).
     */
    headersTimeoutMs?: number;
    /**
     * Maximum time (ms) to wait between HTTP response body chunks.
     * Pass `0` to disable undici's body timeout completely and rely on `AbortSignal`.
     * Defaults to {@link DEFAULT_LONG_RUNNING_BODY_TIMEOUT_MS} (`1_800_000` = 30 minutes).
     */
    bodyTimeoutMs?: number;
    /**
     * Maximum time (ms) to establish the underlying TCP/TLS connection.
     * Defaults to {@link DEFAULT_LONG_RUNNING_CONNECT_TIMEOUT_MS} (`30_000` = 30 seconds).
     */
    connectTimeoutMs?: number;
    /**
     * Idle keep-alive timeout (ms). Defaults to {@link DEFAULT_LONG_RUNNING_KEEP_ALIVE_TIMEOUT_MS} (`60_000`).
     */
    keepAliveTimeoutMs?: number;
    /**
     * Maximum keep-alive socket age (ms). Defaults to {@link DEFAULT_LONG_RUNNING_KEEP_ALIVE_MAX_TIMEOUT_MS} (`600_000`).
     */
    keepAliveMaxTimeoutMs?: number;
    /**
     * Optional host-supplied `undici` dispatcher (e.g., custom CA / mTLS `Agent` or corporate
     * `ProxyAgent`) to bind directly instead of constructing a default `undici.Agent`.
     */
    dispatcher?: FetchDispatcherLike | null;
    /**
     * Explicit opt-out: when `true`, {@link AITransportManager} leaves AI SDKs on Node's
     * ambient global `fetch` / dispatcher untouched.
     */
    disabled?: boolean;
}

/**
 * Normalized undici `Agent` constructor options emitted by {@link ResolveLongRunningFetchDispatcherOptions}.
 */
export interface ResolvedUndiciAgentOptions {
    headersTimeout: number;
    bodyTimeout: number;
    connectTimeout: number;
    keepAliveTimeout: number;
    keepAliveMaxTimeout: number;
}

/**
 * Minimal structural contract satisfied by an `undici` `Dispatcher` / `Agent` instance.
 */
export interface FetchDispatcherLike {
    close?: () => Promise<void>;
    destroy?: (err?: Error | null) => Promise<void>;
}

/**
 * Minimal structural contract satisfied by the `undici` package (`Agent`, `setGlobalDispatcher`, `getGlobalDispatcher`).
 */
export interface UndiciModuleLike {
    Agent: new (options: ResolvedUndiciAgentOptions) => FetchDispatcherLike;
    setGlobalDispatcher?: (dispatcher: FetchDispatcherLike) => void;
    getGlobalDispatcher?: () => FetchDispatcherLike;
}

/**
 * `RequestInit` extended with Node `undici`'s `dispatcher` property (supported by Node's built-in `fetch`).
 */
export interface DispatcherAwareRequestInit extends RequestInit {
    dispatcher?: FetchDispatcherLike;
}

/**
 * Fetch function signature compatible with global `fetch` and provider SDK custom `fetch` hooks.
 */
export type FetchFunction = (input: RequestInfo | URL, init?: DispatcherAwareRequestInit) => Promise<Response>;

/**
 * Result returned by {@link AITransportManager.Configure} and {@link InstallGlobalLongRunningFetchDispatcher}.
 */
export interface GlobalFetchDispatcherInstallation {
    /** True when the dispatcher was actively created/installed. */
    Installed: boolean;
    /** Normalized timeout options applied to the dispatcher. */
    Options: ResolvedUndiciAgentOptions;
    /** Created dispatcher instance when installed, or `null` when unavailable/skipped. */
    Dispatcher: FetchDispatcherLike | null;
    /** Optional diagnostic reason when installation was skipped (e.g., custom `ProxyAgent` active). */
    SkippedReason?: string;
    /** Restores the prior dispatcher (no-op if not installed) and closes the created dispatcher. */
    Restore: () => Promise<void>;
}

/**
 * Symbol key used by Node's built-in `undici` runtime for its global dispatcher slot.
 */
export const UNDICI_GLOBAL_DISPATCHER_SYMBOL: symbol = Symbol.for('undici.globalDispatcher.1');

interface ScopedAIFetchSlot {
    Fetch: FetchFunction | undefined;
    Dispatcher: FetchDispatcherLike | null;
    Options: ResolvedUndiciAgentOptions;
    OwnsDispatcher: boolean;
    Disabled?: boolean;
    UndiciModule?: UndiciModuleLike | null;
    BaseFetch?: FetchFunction;
}

interface CachedOverrideEntry {
    Fetch: FetchFunction;
    Dispatcher: FetchDispatcherLike;
}

/**
 * Returns true only when `dispatcher` appears to be Node's plain built-in `undici.Agent`
 * (and NOT a `ProxyAgent`, `EnvHttpProxyAgent`, `MockAgent`, or custom interceptor/subclass).
 */
export function IsPlainUndiciAgentDispatcher(dispatcher: unknown): boolean {
    if (!dispatcher || typeof dispatcher !== 'object') {
        return false;
    }
    const ctor = (dispatcher as { constructor?: unknown }).constructor;
    if (typeof ctor !== 'function') {
        return false;
    }
    const ctorName = (ctor as { name?: string }).name ?? '';
    return ctorName === 'Agent';
}

/**
 * Resolves a browser-safe {@link UndiciModuleLike} facade around Node's built-in global
 * `undici` dispatcher (`globalThis[Symbol.for('undici.globalDispatcher.1')]`) without
 * requiring an external `undici` dependency or any Node-only imports.
 *
 * Returns `null` in browser runtimes, when Node's lazy `undici` dispatcher has not been
 * initialized yet, OR when the host has installed a non-`Agent` dispatcher (such as `ProxyAgent`
 * or a custom corporate CA/mTLS/interceptor dispatcher) so we never crash or clobber host proxy
 * settings.
 */
export function ResolveNodeBuiltinUndiciModule(): UndiciModuleLike | null {
    const slotHolder = globalThis as Record<PropertyKey, unknown>;
    const current = slotHolder[UNDICI_GLOBAL_DISPATCHER_SYMBOL];
    if (!IsPlainUndiciAgentDispatcher(current)) {
        return null;
    }
    const ctor = (current as { constructor: unknown }).constructor;
    return {
        Agent: ctor as UndiciModuleLike['Agent'],
        getGlobalDispatcher: () => slotHolder[UNDICI_GLOBAL_DISPATCHER_SYMBOL] as FetchDispatcherLike,
        setGlobalDispatcher: (dispatcher: FetchDispatcherLike) => {
            slotHolder[UNDICI_GLOBAL_DISPATCHER_SYMBOL] = dispatcher;
        },
    };
}

/**
 * Primes Node's lazy built-in `undici` global dispatcher with zero network traffic (using a
 * pre-aborted `AbortSignal`) so {@link ResolveNodeBuiltinUndiciModule} can access the built-in
 * `Agent` constructor during server startup. Safe no-op in browsers or when already primed.
 */
export async function PrimeNodeBuiltinUndiciDispatcher(): Promise<boolean> {
    return AITransportManager.Instance.PrimeNodeBuiltinUndici();
}

function normalizeNonNegativeMs(value: number | undefined, fallback: number): number {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
        return fallback;
    }
    return Math.trunc(value);
}

/**
 * Resolves {@link LongRunningFetchDispatcherOptions} into concrete, validated `undici.Agent` options.
 */
export function ResolveLongRunningFetchDispatcherOptions(
    options?: LongRunningFetchDispatcherOptions
): ResolvedUndiciAgentOptions {
    return {
        headersTimeout: normalizeNonNegativeMs(options?.headersTimeoutMs, DEFAULT_LONG_RUNNING_HEADERS_TIMEOUT_MS),
        bodyTimeout: normalizeNonNegativeMs(options?.bodyTimeoutMs, DEFAULT_LONG_RUNNING_BODY_TIMEOUT_MS),
        connectTimeout: normalizeNonNegativeMs(options?.connectTimeoutMs, DEFAULT_LONG_RUNNING_CONNECT_TIMEOUT_MS),
        keepAliveTimeout: normalizeNonNegativeMs(options?.keepAliveTimeoutMs, DEFAULT_LONG_RUNNING_KEEP_ALIVE_TIMEOUT_MS),
        keepAliveMaxTimeout: normalizeNonNegativeMs(
            options?.keepAliveMaxTimeoutMs,
            DEFAULT_LONG_RUNNING_KEEP_ALIVE_MAX_TIMEOUT_MS
        ),
    };
}

/**
 * Constructs a long-running `undici` `Agent` dispatcher configured so extended-thinking and
 * non-streaming tool-calling LLM calls do not trip Node's `300s` `UND_ERR_HEADERS_TIMEOUT` cliff.
 *
 * Returns `null` cleanly in browser runtimes, when no `undici` module is supplied, or if the
 * constructor throws (e.g., an incompatible custom dispatcher constructor).
 */
export function CreateLongRunningFetchDispatcher(
    options?: LongRunningFetchDispatcherOptions,
    undiciModule?: UndiciModuleLike | null
): FetchDispatcherLike | null {
    if (!undiciModule || typeof undiciModule.Agent !== 'function') {
        return null;
    }
    const resolved = ResolveLongRunningFetchDispatcherOptions(options);
    try {
        return new undiciModule.Agent(resolved);
    } catch {
        return null;
    }
}

/**
 * Creates a `fetch`-compatible wrapper that attaches a long-running dispatcher to every request
 * (when provided or constructible from `undiciModule`) while preserving caller `AbortSignal`,
 * headers, method, and body untouched.
 */
export function CreateLongRunningFetch(
    options?: LongRunningFetchDispatcherOptions,
    baseFetch?: FetchFunction,
    undiciModule?: UndiciModuleLike | null,
    existingDispatcher?: FetchDispatcherLike | null
): FetchFunction {
    const targetFetch: FetchFunction =
        baseFetch ?? ((input, init) => globalThis.fetch(input, init as RequestInit));
    const dispatcher = existingDispatcher ?? CreateLongRunningFetchDispatcher(options, undiciModule);

    if (!dispatcher) {
        return (input, init) => targetFetch(input, init);
    }

    return (input, init) => {
        const mergedInit: DispatcherAwareRequestInit = init
            ? { ...init, dispatcher: init.dispatcher ?? dispatcher }
            : { dispatcher };
        return targetFetch(input, mergedInit);
    };
}

/**
 * Process-wide singleton manager for AI-scoped long-running HTTP transport (`fetch` + `undici`
 * dispatcher). Extends {@link BaseSingleton} so every bundle chunk and AI provider shares one
 * authoritative transport configuration without mutating Node's process-global dispatcher.
 *
 * Host processes (e.g., `MJServer`) configure the manager once at startup:
 * ```typescript
 * if (!AITransportManager.Instance.IsConfigured()) {
 *     await AITransportManager.Instance.PrimeNodeBuiltinUndici();
 *     AITransportManager.Instance.Configure({
 *         headersTimeoutMs: 1_800_000,
 *         bodyTimeoutMs: 1_800_000,
 *     });
 * }
 * ```
 *
 * All AI model drivers inherit transport resolution automatically through `BaseModel.CustomFetch`,
 * `BaseModel.BoundFetch`, and `BaseModel.BuildTransportClientOptions()`.
 */
export class AITransportManager extends BaseSingleton<AITransportManager> {
    private _slot: ScopedAIFetchSlot | undefined = undefined;
    private _overrideCache: Map<string, CachedOverrideEntry> = new Map<string, CachedOverrideEntry>();

    protected constructor() {
        super();
    }

    /**
     * Global singleton instance backed by `@memberjunction/global`'s Global Object Store.
     */
    public static get Instance(): AITransportManager {
        return super.getInstance<AITransportManager>();
    }

    /**
     * Primes Node's lazy built-in `undici` global dispatcher with zero network traffic (using a
     * pre-aborted `AbortSignal`) so {@link Configure} can access the built-in `Agent` constructor
     * during server startup. Safe no-op in browsers or when already primed.
     */
    public async PrimeNodeBuiltinUndici(): Promise<boolean> {
        const slotHolder = globalThis as Record<PropertyKey, unknown>;
        if (slotHolder[UNDICI_GLOBAL_DISPATCHER_SYMBOL]) {
            return ResolveNodeBuiltinUndiciModule() !== null;
        }
        if (typeof globalThis.fetch !== 'function' || typeof AbortController !== 'function') {
            return false;
        }
        try {
            const ac = new AbortController();
            ac.abort();
            await globalThis.fetch('http://127.0.0.1:1', { signal: ac.signal }).catch(() => undefined);
        } catch {
            return false;
        }
        return ResolveNodeBuiltinUndiciModule() !== null;
    }

    /**
     * Alias for {@link PrimeNodeBuiltinUndici} matching the standalone helper name.
     */
    public async PrimeNodeBuiltinUndiciDispatcher(): Promise<boolean> {
        return this.PrimeNodeBuiltinUndici();
    }

    /**
     * Configures the AI-scoped long-running `fetch` wrapper for AI provider SDK calls ONLY —
     * leaving Node's process-global `undici` dispatcher completely untouched so unrelated outbound
     * traffic (OAuth, webhooks, email/SMS, CRM connectors) retains Node's standard timeouts and
     * any host `ProxyAgent` / mTLS configuration stays intact.
     */
    public Configure(
        options?: LongRunningFetchDispatcherOptions,
        undiciModule?: UndiciModuleLike | null,
        baseFetch?: FetchFunction
    ): GlobalFetchDispatcherInstallation {
        const resolved = ResolveLongRunningFetchDispatcherOptions(options);
        if (options?.disabled === true) {
            const previousSlot = this._slot;
            const disabledSlot: ScopedAIFetchSlot = {
                Fetch: undefined,
                Dispatcher: null,
                Options: resolved,
                OwnsDispatcher: false,
                Disabled: true,
                UndiciModule: undiciModule,
                BaseFetch: baseFetch,
            };
            this._slot = disabledSlot;
            let restored = false;
            return {
                Installed: false,
                Options: resolved,
                Dispatcher: null,
                SkippedReason: 'Disabled via options.disabled',
                Restore: async () => {
                    if (restored) {
                        return;
                    }
                    restored = true;
                    if (this._slot === disabledSlot) {
                        this._slot = previousSlot;
                    }
                },
            };
        }

        let dispatcher: FetchDispatcherLike | null = options?.dispatcher ?? null;
        const ownsDispatcher = !dispatcher;
        if (!dispatcher) {
            const slotHolder = globalThis as Record<PropertyKey, unknown>;
            const existingGlobal = slotHolder[UNDICI_GLOBAL_DISPATCHER_SYMBOL];
            if (undiciModule === undefined && existingGlobal && !IsPlainUndiciAgentDispatcher(existingGlobal)) {
                const ctorName = (existingGlobal as { constructor?: { name?: string } }).constructor?.name ?? 'unknown';
                return {
                    Installed: false,
                    Options: resolved,
                    Dispatcher: null,
                    SkippedReason: `Host installed custom global dispatcher '${ctorName}'; preserving host transport configuration`,
                    Restore: async () => undefined,
                };
            }

            const targetUndici = undiciModule === undefined ? ResolveNodeBuiltinUndiciModule() : undiciModule;
            if (!targetUndici || typeof targetUndici.Agent !== 'function') {
                return {
                    Installed: false,
                    Options: resolved,
                    Dispatcher: null,
                    SkippedReason: 'Built-in undici Agent dispatcher unavailable in this runtime',
                    Restore: async () => undefined,
                };
            }
            try {
                dispatcher = new targetUndici.Agent(resolved);
            } catch (err) {
                const errMsg = err instanceof Error ? err.message : String(err);
                return {
                    Installed: false,
                    Options: resolved,
                    Dispatcher: null,
                    SkippedReason: `Failed to construct undici Agent dispatcher: ${errMsg}`,
                    Restore: async () => undefined,
                };
            }
        }

        const scopedFetch = CreateLongRunningFetch(options, baseFetch, null, dispatcher);
        const previousSlot = this._slot;
        const nextSlot: ScopedAIFetchSlot = {
            Fetch: scopedFetch,
            Dispatcher: dispatcher,
            Options: resolved,
            OwnsDispatcher: ownsDispatcher,
            UndiciModule: undiciModule,
            BaseFetch: baseFetch,
        };
        this._slot = nextSlot;

        let restored = false;
        return {
            Installed: true,
            Options: resolved,
            Dispatcher: dispatcher,
            Restore: async () => {
                if (restored) {
                    return;
                }
                restored = true;
                if (this._slot === nextSlot) {
                    this._slot = previousSlot;
                }
                if (ownsDispatcher && dispatcher?.close) {
                    await dispatcher.close();
                }
            },
        };
    }

    /**
     * Returns `true` when {@link Configure} has already been called (either with a custom
     * dispatcher/wrapper or with `{ disabled: true }`), allowing server startup to respect a
     * host's pre-startup configuration rather than overwriting it.
     */
    public IsConfigured(): boolean {
        return this._slot !== undefined;
    }

    /**
     * Returns the AI-scoped long-running `fetch` wrapper configured via {@link Configure},
     * optionally customized with per-model `overrides` (e.g., tighter or longer per-model
     * timeouts or a per-model dispatcher), or `undefined` when unconfigured, explicitly disabled,
     * running in a browser, or when a host `ProxyAgent` is active.
     */
    public ResolveFetch(overrides?: LongRunningFetchDispatcherOptions): FetchFunction | undefined {
        const slot = this._slot;
        if (!overrides || !this.hasAnyOverride(overrides)) {
            return slot?.Disabled ? undefined : slot?.Fetch;
        }

        if (overrides.disabled === true) {
            return undefined;
        }

        if (slot?.Disabled && overrides.disabled !== false) {
            return undefined;
        }

        if (overrides.dispatcher) {
            return CreateLongRunningFetch(overrides, slot?.BaseFetch, null, overrides.dispatcher);
        }

        const mergedOptions = this.mergeOverrideOptions(slot?.Options, overrides);
        const cacheKey = this.overrideCacheKey(mergedOptions);
        const cached = this._overrideCache.get(cacheKey);
        if (cached) {
            return cached.Fetch;
        }

        const undiciModule = slot?.UndiciModule;
        const slotHolder = globalThis as Record<PropertyKey, unknown>;
        const existingGlobal = slotHolder[UNDICI_GLOBAL_DISPATCHER_SYMBOL];
        if (undiciModule === undefined && existingGlobal && !IsPlainUndiciAgentDispatcher(existingGlobal)) {
            return undefined;
        }

        const targetUndici = undiciModule === undefined ? ResolveNodeBuiltinUndiciModule() : undiciModule;
        if (!targetUndici || typeof targetUndici.Agent !== 'function') {
            return slot?.Disabled ? undefined : slot?.Fetch;
        }

        let dispatcher: FetchDispatcherLike;
        try {
            dispatcher = new targetUndici.Agent(mergedOptions);
        } catch {
            return slot?.Disabled ? undefined : slot?.Fetch;
        }

        const fetchFn = CreateLongRunningFetch(overrides, slot?.BaseFetch, null, dispatcher);
        this._overrideCache.set(cacheKey, { Fetch: fetchFn, Dispatcher: dispatcher });
        return fetchFn;
    }

    /**
     * Returns a **late-bound** `FetchFunction` that resolves {@link ResolveFetch} at request
     * execution time (falling back to `globalThis.fetch` when unconfigured).
     *
     * Ideal for provider SDKs initialized inside a model `constructor()` before
     * `AITransportManager.Instance.Configure(...)` or `SetAdditionalSettings(...)` is called:
     * requests automatically pick up the active transport configuration when executed.
     */
    public CreateBoundFetch(
        getOverrides?: () => LongRunningFetchDispatcherOptions | undefined
    ): FetchFunction {
        return (input: RequestInfo | URL, init?: DispatcherAwareRequestInit): Promise<Response> => {
            const resolved = this.ResolveFetch(getOverrides ? getOverrides() : undefined);
            if (resolved) {
                return resolved(input, init);
            }
            return globalThis.fetch(input, init as RequestInit);
        };
    }

    /**
     * Clears any configured AI-scoped long-running `fetch` wrapper, closes its dispatcher ONLY
     * when owned by MJ (never closes a host-supplied or global dispatcher), and closes/clears
     * any cached per-model override dispatchers.
     */
    public async Reset(): Promise<void> {
        const slot = this._slot;
        this._slot = undefined;

        const overrideEntries = Array.from(this._overrideCache.values());
        this._overrideCache.clear();

        if (slot?.OwnsDispatcher && slot.Dispatcher?.close) {
            await slot.Dispatcher.close();
        }
        for (const entry of overrideEntries) {
            if (entry.Dispatcher.close) {
                await entry.Dispatcher.close();
            }
        }
    }

    private hasAnyOverride(overrides: LongRunningFetchDispatcherOptions): boolean {
        return (
            overrides.disabled !== undefined ||
            overrides.dispatcher !== undefined ||
            overrides.headersTimeoutMs !== undefined ||
            overrides.bodyTimeoutMs !== undefined ||
            overrides.connectTimeoutMs !== undefined ||
            overrides.keepAliveTimeoutMs !== undefined ||
            overrides.keepAliveMaxTimeoutMs !== undefined
        );
    }

    private mergeOverrideOptions(
        base: ResolvedUndiciAgentOptions | undefined,
        overrides: LongRunningFetchDispatcherOptions
    ): ResolvedUndiciAgentOptions {
        return ResolveLongRunningFetchDispatcherOptions({
            headersTimeoutMs: overrides.headersTimeoutMs ?? base?.headersTimeout,
            bodyTimeoutMs: overrides.bodyTimeoutMs ?? base?.bodyTimeout,
            connectTimeoutMs: overrides.connectTimeoutMs ?? base?.connectTimeout,
            keepAliveTimeoutMs: overrides.keepAliveTimeoutMs ?? base?.keepAliveTimeout,
            keepAliveMaxTimeoutMs: overrides.keepAliveMaxTimeoutMs ?? base?.keepAliveMaxTimeout,
        });
    }

    private overrideCacheKey(options: ResolvedUndiciAgentOptions): string {
        return `${options.headersTimeout}:${options.bodyTimeout}:${options.connectTimeout}:${options.keepAliveTimeout}:${options.keepAliveMaxTimeout}`;
    }
}

/**
 * Installs a long-running `undici` global dispatcher for Node host processes that explicitly opt in
 * to process-wide timeout extension. Prefer {@link AITransportManager.Instance.Configure} to scope
 * extended timeouts strictly to AI provider SDK calls.
 *
 * Skips safely (never throws) when a custom non-`Agent` dispatcher (such as `ProxyAgent`) is active.
 */
export function InstallGlobalLongRunningFetchDispatcher(
    options?: LongRunningFetchDispatcherOptions,
    undiciModule?: UndiciModuleLike | null
): GlobalFetchDispatcherInstallation {
    const resolved = ResolveLongRunningFetchDispatcherOptions(options);
    const slotHolder = globalThis as Record<PropertyKey, unknown>;
    const existingGlobal = slotHolder[UNDICI_GLOBAL_DISPATCHER_SYMBOL];
    if (undiciModule === undefined && existingGlobal && !IsPlainUndiciAgentDispatcher(existingGlobal)) {
        const ctorName = (existingGlobal as { constructor?: { name?: string } }).constructor?.name ?? 'unknown';
        return {
            Installed: false,
            Options: resolved,
            Dispatcher: null,
            SkippedReason: `Host installed custom global dispatcher '${ctorName}'; refusing to overwrite`,
            Restore: async () => undefined,
        };
    }

    const targetUndici = undiciModule === undefined ? ResolveNodeBuiltinUndiciModule() : undiciModule;
    const dispatcher = CreateLongRunningFetchDispatcher(options, targetUndici);

    if (!dispatcher || !targetUndici || typeof targetUndici.setGlobalDispatcher !== 'function') {
        return {
            Installed: false,
            Options: resolved,
            Dispatcher: dispatcher,
            SkippedReason: 'Built-in undici Agent dispatcher unavailable in this runtime',
            Restore: async () => {
                if (dispatcher?.close) {
                    await dispatcher.close();
                }
            },
        };
    }

    const previous =
        typeof targetUndici.getGlobalDispatcher === 'function' ? targetUndici.getGlobalDispatcher() : null;
    try {
        targetUndici.setGlobalDispatcher(dispatcher);
    } catch (err) {
        return {
            Installed: false,
            Options: resolved,
            Dispatcher: null,
            SkippedReason: err instanceof Error ? err.message : String(err),
            Restore: async () => {
                if (dispatcher.close) {
                    await dispatcher.close();
                }
            },
        };
    }

    let restored = false;
    return {
        Installed: true,
        Options: resolved,
        Dispatcher: dispatcher,
        Restore: async () => {
            if (restored) {
                return;
            }
            restored = true;
            if (previous && typeof targetUndici.setGlobalDispatcher === 'function') {
                targetUndici.setGlobalDispatcher(previous);
            }
            if (dispatcher.close) {
                await dispatcher.close();
            }
        },
    };
}
