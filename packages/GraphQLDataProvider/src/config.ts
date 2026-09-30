import { BaseEntity, LogError, Metadata, RunView, RunQuery, SetProvider, StartupManager } from "@memberjunction/core";
import { GraphQLDataProvider, GraphQLProviderConfigData } from "./graphQLDataProvider";
import { MJGlobal, MJEventType } from "@memberjunction/global";

/**
 * Setup the GraphQL client for the project using the provided configuration data.
 */
export async function SetupGraphQLClient(config: GraphQLProviderConfigData): Promise<GraphQLDataProvider> {
    // Set the provider for all entities to be GraphQL in this project, can use a different provider in other situations....
    const provider = new GraphQLDataProvider()

    // BaseEntity + Metadata share the same GraphQLDataProvider instance
    SetProvider(provider);

    await provider.Config(config);

    // Pre-validate cached metadata against the server BEFORE engines fire so that the
    // fast-start window is deterministic: if framework metadata is current we keep
    // fast-start engaged (engines trust local IndexedDB caches with no per-view round
    // trips); if it's stale we refresh metadata + disable fast-start so engines fall
    // through to smart-cache-check and revalidate per-view. Costs ~50-200ms on warm
    // load when data is current — well below the savings from skipping per-view
    // smart-cache-checks during the engine load.
    await provider.preValidateAndRefresh();

    // A boot with no entities is a failed boot: every EntityByName / RunView / GetEntityObject
    // would fail later, far from the cause. ProviderBase.Config logs a failed metadata download
    // and carries on (it must — a timer-driven refresh has to keep the last good graph), so the
    // boot is where "nothing loaded" becomes an error. Checked before LoggedIn so no engine
    // starts against an empty graph. The download's own failure travels in the message as well as
    // `cause`: callers classify boot errors by message text (a user with no roles fails reading
    // `MJ: User Roles`, and the Explorer/Bootstrap initializers show the no-roles screen for it).
    if (provider.Entities.length === 0) {
        const message = `SetupGraphQLClient: no entity metadata was loaded from ${config.URL} — the metadata download failed or returned nothing`;
        const cause = provider.LastMetadataLoadError;
        throw cause
            ? new Error(`${message}: ${cause.message}`, { cause })
            : new Error(`${message}; see the logged GetAllMetadata error`);
    }

    // Fire LoggedIn event BEFORE awaiting StartupManager, so that subscribers
    // (e.g., SharedService.preWarmEngines) can start overlapping with startup.
    // StartupManager.Startup() is idempotent — SharedService's LoggedIn handler
    // also calls it, and both join the same underlying promise.
    MJGlobal.Instance.RaiseEvent({ event: MJEventType.LoggedIn, eventCode: null, component: this, args: null });

    // Now await startup completion. This joins the same promise that SharedService
    // kicked off in its LoggedIn handler, ensuring all engines are loaded before
    // setupGraphQLClient returns.
    await StartupManager.Instance.Startup();

    return provider;
}

/**
 * Connects and registers the GraphQL provider WITHOUT booting metadata. For anonymous/embedded
 * surfaces that only make their own GraphQL calls (and MJ's realtime runtime): no metadata
 * download, no current-user fetch, no LoggedIn event, no startup engines. Call
 * {@link SetupGraphQLClient} later to finish the full boot on the same instance.
 *
 * If the global provider already has metadata loaded this is a no-op that returns it, so it can
 * never downgrade a fully booted provider. Called again on a connected but unbooted provider, it
 * replaces `ConfigData` and keeps the session id; when the URL, token or API keys differ from the
 * ones the current client was built with, it rebuilds the client so requests carry the new
 * identity. The same applies when {@link SetupGraphQLClient} later runs with a login's config
 * (an anonymous connect upgraded to a signed-in user).
 */
export async function ConnectGraphQLClient(config: GraphQLProviderConfigData): Promise<GraphQLDataProvider> {
    const provider = new GraphQLDataProvider(); // returns the global singleton when one exists
    if (provider.Entities.length > 0) {
        return provider;
    }

    SetProvider(provider);
    try {
        await provider.Connect(config);
    }
    catch (e) {
        const cause = e instanceof Error ? e : new Error(String(e));
        const error = new Error(`ConnectGraphQLClient: connecting to ${config.URL} failed: ${cause.message}`, { cause });
        LogError(error.message);
        throw error;
    }
    return provider;
}

/** @deprecated Use {@link SetupGraphQLClient}. */
export async function setupGraphQLClient(config: GraphQLProviderConfigData): Promise<GraphQLDataProvider> {
    return SetupGraphQLClient(config);
}