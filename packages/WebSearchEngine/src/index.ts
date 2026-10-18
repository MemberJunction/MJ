/**
 * @fileoverview Public surface of the MemberJunction web search engine.
 *
 * Importing this module runs every driver's `@RegisterClass` decorator as a side effect, which
 * is what makes them resolvable by `DriverClass`. That is why the providers are exported here
 * rather than left for consumers to import individually.
 *
 * @module @memberjunction/web-search-engine
 */

export * from './types';
export * from './BaseWebSearchProvider';
export * from './WebSearchEngine';

// Drivers — exported for their registration side effect as much as for their types.
export * from './providers/BraveWebSearchProvider';
export * from './providers/TavilyWebSearchProvider';
export * from './providers/PerplexityWebSearchProvider';
export * from './providers/GoogleCustomSearchWebSearchProvider';
export * from './providers/DuckDuckGoWebSearchProvider';
export * from './providers/httpFailure';
export * from './operations/WebSearchQueryOperation';

import { LoadBraveWebSearchProvider } from './providers/BraveWebSearchProvider';
import { LoadTavilyWebSearchProvider } from './providers/TavilyWebSearchProvider';
import { LoadPerplexityWebSearchProvider } from './providers/PerplexityWebSearchProvider';
import { LoadGoogleCustomSearchWebSearchProvider } from './providers/GoogleCustomSearchWebSearchProvider';
import { LoadDuckDuckGoWebSearchProvider } from './providers/DuckDuckGoWebSearchProvider';
import { LoadWebSearchOperations } from './operations/WebSearchQueryOperation';

/**
 * Keep every driver registration alive through tree-shaking.
 *
 * Bundlers drop a module whose exports are unused, and a dropped module never runs its
 * decorator — so the driver silently vanishes from `ClassFactory` and the engine reports
 * "no registered driver" for a `DriverClass` that plainly exists in the source.
 */
export function LoadWebSearchProviders(): void {
    LoadBraveWebSearchProvider();
    LoadTavilyWebSearchProvider();
    LoadPerplexityWebSearchProvider();
    LoadGoogleCustomSearchWebSearchProvider();
    LoadDuckDuckGoWebSearchProvider();
    LoadWebSearchOperations();
}

LoadWebSearchProviders();

