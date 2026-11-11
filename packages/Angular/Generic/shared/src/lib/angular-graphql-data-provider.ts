import { NgZone } from '@angular/core';
import { RegisterClassEx } from '@memberjunction/global';
import {
    ConnectGraphQLClient,
    GraphQLDataProvider,
    GraphQLProviderConfigData,
    SetupGraphQLClient,
} from '@memberjunction/graphql-dataprovider';

/**
 * Structural typing for the global Zone.js root zone holder, avoiding any types or direct Zone.js imports.
 */
export interface RootZoneHolder {
    Zone?: {
        root?: {
            run<R>(cb: () => R): R;
        };
    };
}

/**
 * Angular-aware extension of {@link GraphQLDataProvider}. Delegates background transport I/O
 * (WebSocket handshakes, ping/pong watchdogs, subscription dispatch, and keep-alive intervals)
 * to `NgZone.runOutsideAngular` so continuous socket traffic does not trigger continuous
 * Angular change-detection cycles or keep the browser main thread hot.
 */
@RegisterClassEx(GraphQLDataProvider, { skipNullKeyWarning: true })
export class AngularGraphQLDataProvider extends GraphQLDataProvider {
    private _ngZone: NgZone | null = null;

    constructor(ngZone?: NgZone | null) {
        super();
        if (ngZone) {
            this.SetNgZone(ngZone);
        }
    }

    /**
     * Attaches an {@link NgZone} instance to this provider. If null or undefined is passed,
     * any existing zone reference is preserved.
     */
    public SetNgZone(ngZone: NgZone | null | undefined): void {
        if (ngZone) {
            this._ngZone = ngZone;
        }
    }

    /**
     * Currently attached {@link NgZone}, or null when running in headless/fallback mode.
     */
    public get NgZone(): NgZone | null {
        return this._ngZone;
    }

    /**
     * Runs background transport operations outside Angular's zone when an {@link NgZone} is
     * available. Falls back to Zone.js `root.run()` or direct execution when no zone has been injected.
     */
    protected override ExecuteInBackgroundScope<T>(fn: () => T): T {
        if (this._ngZone) {
            return this._ngZone.runOutsideAngular(fn);
        }

        const holder = globalThis as RootZoneHolder;
        const rootZone = holder.Zone?.root;
        if (rootZone && typeof rootZone.run === 'function') {
            return rootZone.run(fn);
        }

        return fn();
    }
}

/**
 * Resolves an {@link AngularGraphQLDataProvider} instance. Reuses and attaches `ngZone` to an
 * existing `GraphQLDataProvider.Instance` when it is already an `AngularGraphQLDataProvider`, or
 * constructs a new instance (which upgrades an unconfigured base provider in the global store).
 */
export function ResolveAngularGraphQLProvider(ngZone?: NgZone | null): AngularGraphQLDataProvider {
    const existing = GraphQLDataProvider.Instance;
    if (existing instanceof AngularGraphQLDataProvider) {
        if (ngZone) {
            existing.SetNgZone(ngZone);
        }
        return existing;
    }
    return new AngularGraphQLDataProvider(ngZone);
}

/**
 * Initializes and configures the GraphQL client with an {@link AngularGraphQLDataProvider},
 * ensuring WebSocket transport operations run outside Angular's change-detection zone.
 */
export async function SetupAngularGraphQLClient(
    config: GraphQLProviderConfigData,
    ngZone?: NgZone | null
): Promise<AngularGraphQLDataProvider> {
    const provider = ResolveAngularGraphQLProvider(ngZone);
    await SetupGraphQLClient(config, provider);
    return provider;
}

/**
 * Connects to GraphQL and metadata with an {@link AngularGraphQLDataProvider}, ensuring WebSocket
 * transport operations run outside Angular's change-detection zone.
 */
export async function ConnectAngularGraphQLClient(
    config: GraphQLProviderConfigData,
    ngZone?: NgZone | null
): Promise<AngularGraphQLDataProvider> {
    const provider = ResolveAngularGraphQLProvider(ngZone);
    await ConnectGraphQLClient(config, provider);
    return provider;
}
