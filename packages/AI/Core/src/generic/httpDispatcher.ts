/**
 * @fileoverview Backwards-compatible transport dispatcher exports delegating to
 * {@link AITransportManager} (`packages/AI/Core/src/generic/aiTransportManager.ts`).
 *
 * New code should use {@link AITransportManager.Instance} directly (for host configuration)
 * and `BaseModel.CustomFetch` / `BaseModel.BoundFetch` / `BaseModel.BuildTransportClientOptions()`
 * inside AI model drivers.
 *
 * @module @memberjunction/ai
 */

import {
    AITransportManager,
    type FetchFunction,
    type GlobalFetchDispatcherInstallation,
    type LongRunningFetchDispatcherOptions,
    type UndiciModuleLike,
} from './aiTransportManager';

export {
    AITransportManager,
    CreateLongRunningFetch,
    CreateLongRunningFetchDispatcher,
    DEFAULT_LONG_RUNNING_BODY_TIMEOUT_MS,
    DEFAULT_LONG_RUNNING_CONNECT_TIMEOUT_MS,
    DEFAULT_LONG_RUNNING_HEADERS_TIMEOUT_MS,
    DEFAULT_LONG_RUNNING_KEEP_ALIVE_MAX_TIMEOUT_MS,
    DEFAULT_LONG_RUNNING_KEEP_ALIVE_TIMEOUT_MS,
    InstallGlobalLongRunningFetchDispatcher,
    IsPlainUndiciAgentDispatcher,
    PrimeNodeBuiltinUndiciDispatcher,
    ResolveLongRunningFetchDispatcherOptions,
    ResolveNodeBuiltinUndiciModule,
    UNDICI_GLOBAL_DISPATCHER_SYMBOL,
    type DispatcherAwareRequestInit,
    type FetchDispatcherLike,
    type FetchFunction,
    type GlobalFetchDispatcherInstallation,
    type LongRunningFetchDispatcherOptions,
    type ResolvedUndiciAgentOptions,
    type UndiciModuleLike,
} from './aiTransportManager';

/**
 * @deprecated Use {@link AITransportManager.Instance.Configure} instead.
 */
export function ConfigureLongRunningAIFetch(
    options?: LongRunningFetchDispatcherOptions,
    undiciModule?: UndiciModuleLike | null,
    baseFetch?: FetchFunction
): GlobalFetchDispatcherInstallation {
    return AITransportManager.Instance.Configure(options, undiciModule, baseFetch);
}

/**
 * @deprecated Use {@link AITransportManager.Instance.IsConfigured} instead.
 */
export function IsLongRunningAIFetchConfigured(): boolean {
    return AITransportManager.Instance.IsConfigured();
}

/**
 * @deprecated Use {@link AITransportManager.Instance.ResolveFetch} or `BaseModel.CustomFetch` instead.
 */
export function GetLongRunningAIFetch(): FetchFunction | undefined {
    return AITransportManager.Instance.ResolveFetch();
}

/**
 * @deprecated Use {@link AITransportManager.Instance.Reset} instead.
 */
export async function ResetLongRunningAIFetch(): Promise<void> {
    return AITransportManager.Instance.Reset();
}
