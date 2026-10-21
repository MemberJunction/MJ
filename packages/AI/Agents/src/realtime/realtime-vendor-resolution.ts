/**
 * @fileoverview `SelectRealtimeVendorForModel` — the ONE answer to "which vendor actually runs this
 * realtime model?".
 *
 * The decision (highest-`Priority` Active vendor whose `DriverClass` resolves an API key) previously
 * existed as three byte-identical copies: `BaseAgent.selectRealtimeVendor`,
 * `RealtimeClientSessionService.selectRealtimeVendor`, and the module-private
 * `resolveRealtimeDriverClass` in `bridge-realtime-session-factory`. Three copies of one rule is three
 * places to fix when the rule changes; this module is the single home so every realtime surface —
 * client-direct, server-bridged, and the model/voice picker — resolves the same vendor for the same model.
 *
 * @module @memberjunction/ai-agents
 * @author MemberJunction.com
 */

import { AIAPIKeyResolver, MakeAIAPIKeyResolver } from '@memberjunction/ai';
import { UUIDsEqual } from '@memberjunction/global';
import { AIEngine } from '@memberjunction/aiengine';

/** The vendor identifiers a resolved realtime model runs under. */
export interface RealtimeVendorSelection {
    /** The chosen `MJ: AI Vendors` row id (empty string when the vendor row carries none). */
    VendorID: string;
    /**
     * The chosen `MJ: AI Model Vendors` ROW id — NOT the vendor id. This is the most-specific layer of
     * the `ModelConfiguration` catalog cascade (`AIModelType` < `AIModel` < `AIModelVendor`), so it must
     * ride along with the driver identifiers: a caller that resolves a vendor in order to mint a session
     * also needs it to read that session's catalog defaults.
     */
    ModelVendorID: string;
    /** The vendor's `DriverClass` — the `ClassFactory` key AND the per-provider voice-settings match key. */
    DriverClass: string;
    /** The vendor API name passed to the provider as the model id. */
    APIName: string;
}

/**
 * Resolves a key for a `DriverClass`. Injectable so callers that already own a key-resolution seam
 * (and their tests) can substitute one without reaching into the environment.
 *
 * An alias of {@link AIAPIKeyResolver} in `@memberjunction/ai`, kept under this name because it is
 * the published realtime API. A run-scoped resolver (e.g. `MakeAIAPIKeyResolver(params.apiKeys)`)
 * is what carries a caller's own credentials in here; the default below is the platform-only lookup.
 */
export type RealtimeAPIKeyResolver = AIAPIKeyResolver;

/** The default resolver — the process's configured AI API keys, with no run-scoped keys. */
const defaultAPIKeyResolver: RealtimeAPIKeyResolver = MakeAIAPIKeyResolver();

/**
 * Selects the vendor that will run a realtime model: the highest-`Priority` **Active** `MJ: AI Model
 * Vendors` row for the model whose `DriverClass` resolves an API key.
 *
 * Vendors are walked in descending `Priority` and the FIRST with a usable key wins — a keyless
 * higher-priority vendor is skipped rather than dead-ending the resolution (a deployment that
 * configures only one provider's key must still resolve that provider).
 *
 * @param modelID The `MJ: AI Models` row id to resolve a vendor for.
 * @param resolveAPIKey Key-resolution seam; defaults to the process's configured AI API keys.
 * @returns The vendor identifiers, or `null` when no active vendor has a usable key.
 */
export function SelectRealtimeVendorForModel(
    modelID: string,
    resolveAPIKey: RealtimeAPIKeyResolver = defaultAPIKeyResolver
): RealtimeVendorSelection | null {
    for (const v of ListRealtimeVendorsForModel(modelID)) {
        if (resolveAPIKey(v.DriverClass)) {
            return v;
        }
    }
    return null;
}

/**
 * The vendors that can run a realtime model, in the order {@link SelectRealtimeVendorForModel} tries them: the model's
 * **Active** `MJ: AI Model Vendors` rows that carry a `DriverClass`, highest `Priority` first. Keys are not checked here.
 * A co-agent with video on walks them all for one whose endpoint shows an avatar, not only the first with a key.
 *
 * @param modelID The `MJ: AI Models` row id.
 * @returns The vendor identifiers, best first (empty when the model has none).
 */
export function ListRealtimeVendorsForModel(modelID: string): RealtimeVendorSelection[] {
    return AIEngine.Instance.ModelVendors
        .filter(mv => UUIDsEqual(mv.ModelID, modelID) && mv.Status === 'Active' && mv.DriverClass != null)
        .sort((a, b) => (b.Priority ?? 0) - (a.Priority ?? 0))
        .map(v => ({ VendorID: v.VendorID ?? '', ModelVendorID: v.ID, DriverClass: v.DriverClass!, APIName: v.APIName ?? '' }));
}
