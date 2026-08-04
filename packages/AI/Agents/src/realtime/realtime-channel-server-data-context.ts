/**
 * @fileoverview Optional capability a server-side realtime channel plugin can implement when it
 * needs MJ data access (a `UserInfo` + `IMetadataProvider`) to do its session-start work.
 *
 * The base {@link import('@memberjunction/ai').BaseRealtimeChannelServer} contract is deliberately
 * core-free (plain string ids only, "zero MJ dependencies past `@memberjunction/global`"), so it
 * cannot carry `UserInfo` / `IMetadataProvider` on its lifecycle hooks. Most server channels only
 * validate persisted state and never touch the DB. A channel that DOES need to query MJ at session
 * start (e.g. the Media channel resolving an agent's media kit) implements this interface; the
 * per-session host ({@link import('./realtime-channel-server-host').RealtimeChannelServerHost})
 * detects it right after `Initialize(ctx)` and hands over the session's `contextUser` + `provider`
 * BEFORE calling `OnSessionStarted()`.
 *
 * @module @memberjunction/ai-agents
 * @author MemberJunction.com
 */

import { IMetadataProvider, UserInfo } from '@memberjunction/core';

/**
 * Implemented by server-side channel plugins that need MJ data access for their session-start work.
 * The host calls {@link SetSessionDataContext} once, after `Initialize(ctx)` and before
 * `OnSessionStarted()`, with the SAME `contextUser` + `provider` the session authenticated on.
 */
export interface IRealtimeChannelServerDataAware {
    /**
     * Hands the channel the session's MJ data context. Called exactly once per session by the host
     * between `Initialize(ctx)` and `OnSessionStarted()`. Implementations should just stash the
     * values for use in their own `OnSessionStarted()`.
     *
     * @param contextUser The user the realtime session is running as (for `RunView` / entity loads).
     * @param provider The metadata provider the session authenticated on (multi-provider safe).
     */
    SetSessionDataContext(contextUser: UserInfo, provider: IMetadataProvider): void;
}

/**
 * Structural type-guard the host uses to decide whether a resolved server channel plugin wants the
 * session data context. Keeps the host decoupled from any concrete channel class.
 *
 * @param plugin The resolved server channel plugin (typed as the core-free base by the host).
 * @returns `true` when the plugin implements {@link IRealtimeChannelServerDataAware}.
 */
export function isRealtimeChannelServerDataAware(plugin: unknown): plugin is IRealtimeChannelServerDataAware {
    return (
        typeof plugin === 'object' &&
        plugin !== null &&
        typeof (plugin as IRealtimeChannelServerDataAware).SetSessionDataContext === 'function'
    );
}
