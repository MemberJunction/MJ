/**
 * @fileoverview Long-running HTTP transport dispatcher utilities for AI provider requests.
 *
 * Node's built-in `fetch` (backed by `undici`) enforces a default `headersTimeout` of `300_000ms`
 * (5 minutes). Long-running extended-thinking or tool-calling LLM requests (where streaming is
 * suppressed or first-byte latency exceeds 5 minutes) hit `UND_ERR_HEADERS_TIMEOUT`
 * (`TypeError: fetch failed`) well before the agent's liveness watchdog or caller `AbortSignal`
 * expires.
 *
 * This module stays 100% browser-safe and dependency-free inside `@memberjunction/ai`: callers in
 * Node environments pass their `undici` module (or compatible dispatcher factory) to construct a
 * dispatcher whose `headersTimeout` / `bodyTimeout` defer to the request's `AbortSignal`.
 *
 * @module @memberjunction/ai
 */

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
 * Configuration options for {@link CreateLongRunningFetchDispatcher}.
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
     * Defaults to {@link DEFAULT_LONG_RUNNING_BODY_TIMEOUT_MS} (`0`).
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
 * Result returned by {@link InstallGlobalLongRunningFetchDispatcher}.
 */
export interface GlobalFetchDispatcherInstallation {
    /** True when the global dispatcher was actively replaced. */
    Installed: boolean;
    /** Normalized timeout options applied to the dispatcher. */
    Options: ResolvedUndiciAgentOptions;
    /** Created dispatcher instance when installed, or `null` when unavailable (e.g., browser runtime). */
    Dispatcher: FetchDispatcherLike | null;
    /** Restores the prior global dispatcher (no-op if not installed) and closes the created dispatcher. */
    Restore: () => Promise<void>;
}

/**
 * Symbol key used by Node's built-in `undici` runtime for its global dispatcher slot.
 */
export const UNDICI_GLOBAL_DISPATCHER_SYMBOL: symbol = Symbol.for('undici.globalDispatcher.1');

/**
 * Resolves a browser-safe {@link UndiciModuleLike} facade around Node's built-in global
 * `undici` dispatcher (`globalThis[Symbol.for('undici.globalDispatcher.1')]`) without
 * requiring an external `undici` dependency or any Node-only imports.
 *
 * Returns `null` in browser runtimes or when Node's lazy `undici` dispatcher has not been
 * initialized yet.
 */
export function ResolveNodeBuiltinUndiciModule(): UndiciModuleLike | null {
    const slotHolder = globalThis as Record<PropertyKey, unknown>;
    const current = slotHolder[UNDICI_GLOBAL_DISPATCHER_SYMBOL];
    if (!current || typeof current !== 'object') {
        return null;
    }
    const ctor = (current as { constructor?: unknown }).constructor;
    if (typeof ctor !== 'function') {
        return null;
    }
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
    if (ResolveNodeBuiltinUndiciModule()) {
        return true;
    }
    if (typeof globalThis.fetch !== 'function' || typeof AbortController !== 'function') {
        return false;
    }
    const ac = new AbortController();
    ac.abort();
    await globalThis.fetch('http://127.0.0.1:1', { signal: ac.signal }).catch(() => undefined);
    return ResolveNodeBuiltinUndiciModule() !== null;
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
 * Returns `null` cleanly in browser runtimes or when no `undici` module is supplied.
 */
export function CreateLongRunningFetchDispatcher(
    options?: LongRunningFetchDispatcherOptions,
    undiciModule?: UndiciModuleLike | null
): FetchDispatcherLike | null {
    if (!undiciModule || typeof undiciModule.Agent !== 'function') {
        return null;
    }
    const resolved = ResolveLongRunningFetchDispatcherOptions(options);
    return new undiciModule.Agent(resolved);
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
 * Installs a long-running `undici` global dispatcher for Node host processes (such as `MJAPI`)
 * so every fetch-backed AI provider SDK inherits extended `headersTimeout` / `bodyTimeout` bounds
 * while remaining governed by per-request `AbortSignal` cancellation tokens.
 */
export function InstallGlobalLongRunningFetchDispatcher(
    options?: LongRunningFetchDispatcherOptions,
    undiciModule?: UndiciModuleLike | null
): GlobalFetchDispatcherInstallation {
    const resolved = ResolveLongRunningFetchDispatcherOptions(options);
    const targetUndici = undiciModule === undefined ? ResolveNodeBuiltinUndiciModule() : undiciModule;
    const dispatcher = CreateLongRunningFetchDispatcher(options, targetUndici);

    if (!dispatcher || !targetUndici || typeof targetUndici.setGlobalDispatcher !== 'function') {
        return {
            Installed: false,
            Options: resolved,
            Dispatcher: dispatcher,
            Restore: async () => {
                if (dispatcher?.close) {
                    await dispatcher.close();
                }
            },
        };
    }

    const previous =
        typeof targetUndici.getGlobalDispatcher === 'function' ? targetUndici.getGlobalDispatcher() : null;
    targetUndici.setGlobalDispatcher(dispatcher);

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
