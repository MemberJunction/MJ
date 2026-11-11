/**
 * @fileoverview Registers the semantic-graph expansion service for this MJAPI process.
 *
 * The graph search lane (`GraphSearchProvider` in `@memberjunction/search-engine`) and the agent
 * pipeline's `graphExpand` stage (`@memberjunction/ai-agents`) expand graphs only through a registered
 * `IGraphExpansionService`; with none registered both are off. The engine-backed implementation
 * (`CanonGraphEngine.AsExpansionService()` over `GraphEngine`) is registered here, at startup and before
 * any search runs, so `SearchEngine` sees the lane as available when it first configures its providers.
 *
 * Registration loads nothing: `GraphEngine` configures lazily on the first expansion, and with no active
 * graph the service returns no seeds, so the lane and the stage are no-ops.
 *
 * @module @memberjunction/server
 */
import { CanonGraphEngine, GetRegisteredGraphExpansionService, RegisterGraphExpansionService } from '@memberjunction/core-entities';

/**
 * Register the engine-backed graph expansion service unless the host already registered its own.
 * @returns `true` when this call registered it.
 */
export function RegisterSemanticGraphExpansionService(): boolean {
    if (GetRegisteredGraphExpansionService()) {
        return false;
    }
    RegisterGraphExpansionService(CanonGraphEngine.Instance.AsExpansionService());
    return true;
}
