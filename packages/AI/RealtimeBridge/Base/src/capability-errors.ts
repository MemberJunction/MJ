/**
 * Error types for the bridge capability-gating flow.
 *
 * See `/plans/realtime/realtime-bridges-architecture.md` §3 — "the provider abstraction — 100%
 * generic, capability-gated". The bridge engine checks a provider's `SupportedFeatures` flag
 * BEFORE calling an optional driver method; this error is the **defense-in-depth** layer that
 * fires when a feature is claimed in metadata but the concrete driver never implemented it
 * (or a caller skipped the metadata gate). Metadata says "don't call this"; the throw means the
 * code refuses to pretend a capability exists.
 */

/**
 * Thrown when a capability-gated bridge feature is invoked on a driver that does not support it.
 *
 * Two distinct failure modes both surface as this error:
 * 1. A {@link BaseRealtimeBridge} **virtual** method (e.g. `SendDTMF`, `TransferCall`) was called
 *    but the concrete driver did not override the base implementation — the base throws this.
 * 2. The driver's `RequireFeature(...)` defense-in-depth guard found the matching
 *    `IBridgeProviderFeatures` flag false/omitted — the metadata claims the feature is off, so the
 *    call must not proceed.
 *
 * Carrying both the `FeatureName` and the `ProviderName` makes the loud failure actionable: it
 * points at exactly which capability flag lied (or which driver method is missing) for which
 * platform.
 */
export class BridgeCapabilityNotSupportedError extends Error {
    /**
     * The name of the unsupported feature — by convention an `IBridgeProviderFeatures` key
     * (e.g. `'DTMF'`, `'CallTransfer'`, `'Recording'`) or the virtual method name when the
     * throw originates from an un-overridden base method.
     */
    public readonly FeatureName: string;

    /**
     * The bridge provider the call targeted (e.g. `'Zoom'`, `'Twilio'`). Sourced from the
     * provider metadata row's `Name`, or the driver's own identifier when the provider name is
     * not available at the throw site.
     */
    public readonly ProviderName: string;

    /**
     * Constructs a {@link BridgeCapabilityNotSupportedError}.
     *
     * @param featureName The unsupported feature / method name (an `IBridgeProviderFeatures` key by convention).
     * @param providerName The provider the call targeted (e.g. `'Zoom'`, `'Twilio'`).
     * @param message Optional override for the human-readable message; a sensible default is built from the two names.
     */
    constructor(featureName: string, providerName: string, message?: string) {
        super(
            message ??
                `Bridge capability '${featureName}' is not supported by provider '${providerName}'. ` +
                    `Either the provider's SupportedFeatures does not enable it, or its driver does not implement it.`,
        );
        this.name = 'BridgeCapabilityNotSupportedError';
        this.FeatureName = featureName;
        this.ProviderName = providerName;
        // Restore the prototype chain — required when extending built-ins under ES2015+ down-compilation.
        Object.setPrototypeOf(this, BridgeCapabilityNotSupportedError.prototype);
    }
}
