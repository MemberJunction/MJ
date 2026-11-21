/**
 * @fileoverview The platform MJ Credentials a realtime voice session may mint on, resolved before
 * vendor selection runs.
 *
 * Vendor selection ({@link SelectRealtimeVendorForModel}) is synchronous and asks a key resolver per
 * `DriverClass`; MJ Credential resolution is asynchronous and keyed by vendor rows. So the async part
 * runs first: {@link ResolveRealtimePlatformCredentials} resolves each candidate vendor's credential
 * through the same tiers a prompt uses ({@link ResolvePlatformAICredential}: ModelVendor bindings,
 * then Vendor bindings, then the vendor's default credential), and the result answers synchronously
 * inside the key chain that selection and the mint share.
 *
 * Precedence in that chain, per driver class: this platform credential, then the run's `apiKeys`,
 * then the environment (`AI_VENDOR_API_KEY__<driver>`) — the order `BaseModelRunner` resolves a
 * prompt's key in. A run whose `CredentialScope` is `'RuntimeOnly'` resolves no platform credential.
 *
 * @module @memberjunction/ai-agents
 * @author MemberJunction.com
 */

import { UserInfo, LogError, LogStatus, IsVerboseLoggingEnabled } from '@memberjunction/core';
import { AIAPIKeyResolver, AICredentialScope, CredentialScopeAllows } from '@memberjunction/ai';
import { NormalizeUUID } from '@memberjunction/global';
import { AIEngine } from '@memberjunction/aiengine';
import { ResolvePlatformAICredential } from '@memberjunction/ai-prompts';
import { ListRealtimeVendorsForModel, RealtimeVendorSelection } from './realtime-vendor-resolution';

/** The credential-access subsystem name realtime sessions record. */
const REALTIME_CREDENTIAL_SUBSYSTEM = 'RealtimeSession';

/**
 * The platform credentials resolved for a set of realtime models, keyed by `MJ: AI Model Vendors`
 * row. Immutable; answers synchronously.
 */
export class RealtimePlatformCredentials {
    /** No platform credentials: every lookup falls through to the run's keys and the environment. */
    public static readonly None = new RealtimePlatformCredentials(new Map());

    /**
     * @param byModelVendor Credential values keyed by normalized `MJ: AI Model Vendors` row id.
     */
    constructor(private readonly byModelVendor: ReadonlyMap<string, string>) {}

    /** The number of model-vendor rows a platform credential resolved for. */
    public get Count(): number {
        return this.byModelVendor.size;
    }

    /**
     * The platform credential for a model's vendor with this driver class, or `undefined`. The
     * model's Active vendor rows are tried in selection order, so the answer is the credential of the
     * row that selection would pick for that driver class.
     *
     * @param modelID The `MJ: AI Models` row id.
     * @param driverClass The vendor's `DriverClass`.
     */
    public KeyFor(modelID: string, driverClass: string): string | undefined {
        if (this.byModelVendor.size === 0) {
            return undefined;
        }
        for (const vendor of ListRealtimeVendorsForModel(modelID)) {
            if (vendor.DriverClass === driverClass) {
                const key = this.byModelVendor.get(NormalizeUUID(vendor.ModelVendorID));
                if (key) return key;
            }
        }
        return undefined;
    }

    /**
     * A key resolver for one model: its platform credential first, then `fallback` (the run's keys,
     * then the environment, as the caller built them).
     *
     * @param modelID The `MJ: AI Models` row id the resolver serves.
     * @param fallback The resolver consulted when no platform credential applies.
     */
    public ResolverFor(modelID: string, fallback: AIAPIKeyResolver): AIAPIKeyResolver {
        return (driverClass) => this.KeyFor(modelID, driverClass) ?? fallback(driverClass);
    }
}

/**
 * Resolves the platform credential of every Active vendor of the given realtime models. Vendor-level
 * results are shared across models, so one Vendor binding is read once however many models it serves.
 * Never throws: a failure is logged and the vendor (or, if the credential engine itself fails, every
 * vendor) falls back to the run's keys and the environment.
 *
 * @param modelIDs The `MJ: AI Models` row ids a session may resolve to.
 * @param contextUser The user the credentials are read as.
 * @param scope The run's credential scope; `'RuntimeOnly'` resolves nothing.
 * @returns The resolved credentials ({@link RealtimePlatformCredentials.None} when there are none).
 */
export async function ResolveRealtimePlatformCredentials(
    modelIDs: string[],
    contextUser: UserInfo | undefined,
    scope: AICredentialScope | undefined
): Promise<RealtimePlatformCredentials> {
    if (!CredentialScopeAllows(scope, 'PlatformCredential')) {
        return RealtimePlatformCredentials.None;
    }
    const byModelVendor = new Map<string, string>();
    const shared = new Map<string, Promise<string | undefined>>();
    for (const modelID of modelIDs) {
        for (const vendor of ListRealtimeVendorsForModel(modelID)) {
            const key = await resolveVendorCredential(vendor, contextUser, shared);
            if (key) {
                byModelVendor.set(NormalizeUUID(vendor.ModelVendorID), key);
            }
        }
    }
    return byModelVendor.size > 0 ? new RealtimePlatformCredentials(byModelVendor) : RealtimePlatformCredentials.None;
}

/**
 * One vendor row's platform credential. Skips the credential engine entirely when the metadata shows
 * nothing to resolve (no binding on the row or the vendor, and no vendor credential type). A row with
 * its own ModelVendor binding is resolved on its own; otherwise the result is shared per vendor.
 */
async function resolveVendorCredential(
    vendor: RealtimeVendorSelection,
    contextUser: UserInfo | undefined,
    shared: Map<string, Promise<string | undefined>>
): Promise<string | undefined> {
    try {
        const hasRowBinding = AIEngine.Instance.HasCredentialBindings('ModelVendor', vendor.ModelVendorID);
        if (!hasRowBinding && !vendorMayHaveCredential(vendor.VendorID)) {
            return undefined;
        }
        const shareKey = hasRowBinding ? `ModelVendor:${NormalizeUUID(vendor.ModelVendorID)}` : `Vendor:${NormalizeUUID(vendor.VendorID)}`;
        let pending = shared.get(shareKey);
        if (!pending) {
            pending = ResolvePlatformAICredential({
                ModelVendorIDs: [vendor.ModelVendorID],
                VendorID: vendor.VendorID || undefined,
                ContextUser: contextUser,
                Subsystem: REALTIME_CREDENTIAL_SUBSYSTEM,
                Verbose: IsVerboseLoggingEnabled(),
                Logger: realtimeCredentialLogger,
            });
            shared.set(shareKey, pending);
        }
        return await pending;
    } catch (error) {
        LogError(
            `[Realtime] Could not resolve the MJ Credential for vendor DriverClass '${vendor.DriverClass}': ` +
                `${error instanceof Error ? error.message : String(error)}. Falling back to run keys and the environment.`,
        );
        return undefined;
    }
}

/** Whether the vendor has a Vendor binding or declares a credential type (whose default may apply). */
function vendorMayHaveCredential(vendorID: string): boolean {
    if (!vendorID) {
        return false;
    }
    return AIEngine.Instance.HasCredentialBindings('Vendor', vendorID) ||
        !!AIEngine.Instance.VendorsByID.get(NormalizeUUID(vendorID))?.CredentialTypeID;
}

/** Routes the shared resolver's reports to the server log. */
const realtimeCredentialLogger = {
    Status: (message: string): void => LogStatus(`[Realtime]${message}`),
    Failure: (error: Error, metadata: { credentialName: string; source: string }): void =>
        LogError(`[Realtime] MJ Credential "${metadata.credentialName}" from ${metadata.source} could not be resolved: ${error.message}`),
};
