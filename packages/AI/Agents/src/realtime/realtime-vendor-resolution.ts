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

import { AIAPIKeyResolver, AICredentialScope, CredentialScopeAllows, MakeAIAPIKeyResolver } from '@memberjunction/ai';
import { LogStatus } from '@memberjunction/core';
import { NormalizeUUID, UUIDsEqual } from '@memberjunction/global';
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
 * When no vendor qualifies, one log line names the model and, for each vendor considered, the
 * credential it would need ({@link DescribeRealtimeVendorKeyNeeds}) — a host whose LLM key works but
 * whose realtime driver class has none otherwise fails with no trace of why.
 *
 * @param modelID The `MJ: AI Models` row id to resolve a vendor for.
 * @param resolveAPIKey Key-resolution seam; defaults to the process's configured AI API keys.
 * @param scope The run's credential scope, used only to word the log line; omitted means `'Any'`.
 * @returns The vendor identifiers, or `null` when no active vendor has a usable key.
 */
export function SelectRealtimeVendorForModel(
    modelID: string,
    resolveAPIKey: RealtimeAPIKeyResolver = defaultAPIKeyResolver,
    scope?: AICredentialScope
): RealtimeVendorSelection | null {
    const vendors = ListRealtimeVendorsForModel(modelID);
    for (const v of vendors) {
        if (resolveAPIKey(v.DriverClass)) {
            return v;
        }
    }
    LogStatus(DescribeUnkeyedRealtimeModel(modelID, vendors, scope));
    return null;
}

/**
 * The log line for a realtime model none of whose vendors has a key: the model, then each vendor
 * considered with what it needs.
 *
 * @param modelID The `MJ: AI Models` row id.
 * @param vendors The vendors considered (the model's Active vendor rows).
 * @param scope The run's credential scope; omitted means `'Any'`.
 */
export function DescribeUnkeyedRealtimeModel(modelID: string, vendors: RealtimeVendorSelection[], scope?: AICredentialScope): string {
    const modelName = cachedName(() => AIEngine.Instance.ModelsByID.get(NormalizeUUID(modelID))?.Name) ?? modelID;
    if (vendors.length === 0) {
        return `[Realtime] Realtime model '${modelName}' was skipped: it has no Active AI Model Vendor row with a DriverClass.`;
    }
    const needs = vendors.map(v => `  - ${DescribeRealtimeVendorKeyNeeds(v, scope)}`).join('\n');
    return `[Realtime] Realtime model '${modelName}' was skipped: none of its ${vendors.length} active vendor(s) has a usable key.\n${needs}`;
}

/**
 * What one realtime vendor needs before a session can mint on it, tier by tier in resolution order.
 * The environment variable is named for the vendor's REALTIME `DriverClass` (e.g.
 * `AI_VENDOR_API_KEY__OPENAIREALTIME`), which is a different key name from the same provider's LLM
 * driver class — the usual reason a host whose prompts work has no realtime vendor.
 *
 * @param vendor The vendor considered.
 * @param scope The run's credential scope; under `'RuntimeOnly'` only the run's own keys count.
 */
export function DescribeRealtimeVendorKeyNeeds(vendor: RealtimeVendorSelection, scope?: AICredentialScope): string {
    const vendorName = (vendor.VendorID && cachedName(() => AIEngine.Instance.VendorsByID.get(NormalizeUUID(vendor.VendorID))?.Name)) || vendor.VendorID || 'unnamed vendor';
    const tiers: string[] = [];
    if (CredentialScopeAllows(scope, 'PlatformCredential')) {
        tiers.push(`an AI Credential Binding on the vendor '${vendorName}' or on this model's vendor row`);
        tiers.push(`a default credential of the vendor's credential type`);
    }
    tiers.push(`an apiKeys entry for driver class '${vendor.DriverClass}' on the run`);
    if (CredentialScopeAllows(scope, 'Environment')) {
        tiers.push(`the environment variable ${RealtimeEnvKeyName(vendor.DriverClass)}`);
    }
    return `vendor '${vendorName}' (DriverClass ${vendor.DriverClass}) needs one of: ${tiers.join('; ')}`;
}

/**
 * The user-facing "how to fix it" sentence for a realtime session that found no keyed vendor, worded
 * for the run's credential scope. The per-vendor detail is in the server log
 * ({@link DescribeUnkeyedRealtimeModel}); this names the fixes.
 *
 * @param scope The run's credential scope; omitted means `'Any'`.
 */
export function RealtimeKeyFixHint(scope?: AICredentialScope): string {
    const logNote = 'The server log lists each vendor considered and what it needed.';
    if (!CredentialScopeAllows(scope, 'PlatformCredential')) {
        return (
            "This session may use only the caller's own keys (credential scope RuntimeOnly): pass an apiKeys entry " +
            `for the realtime vendor's driver class (e.g. 'OpenAIRealtime'). ${logNote}`
        );
    }
    return (
        'To fix it, give a realtime vendor a key: bind an MJ Credential to it (an AI Credential Binding on the AI ' +
        "Vendor or on the model's AI Model Vendor row), mark a default credential of the vendor's credential type, or " +
        `set the environment variable for its realtime driver class (e.g. ${RealtimeEnvKeyName('OpenAIRealtime')}, a ` +
        `different name from the provider's LLM key). ${logNote}`
    );
}

/** A display name from the engine's cache; `undefined` when absent or the cache is not loaded. A log line never throws. */
function cachedName(read: () => string | null | undefined): string | undefined {
    try {
        return read() || undefined;
    } catch {
        return undefined;
    }
}

/**
 * The environment variable that keys a driver class (`AI_VENDOR_API_KEY__<DRIVERCLASS>`, matched
 * case-insensitively by `GetAIAPIKey`).
 *
 * @param driverClass The vendor's `DriverClass`.
 */
export function RealtimeEnvKeyName(driverClass: string): string {
    return `AI_VENDOR_API_KEY__${driverClass.toUpperCase()}`;
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
