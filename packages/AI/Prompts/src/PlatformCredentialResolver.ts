/**
 * @fileoverview The platform-credential tiers of AI key resolution, shared by every caller that mints
 * a provider driver: prompt runners (through `BaseModelRunner`) and realtime voice sessions.
 *
 * The tiers, most specific first: `AICredentialBinding`s on the prompt-model, then on the
 * model-vendor, then on the vendor, then the vendor's default credential of its `CredentialTypeID`.
 * Callers decide what comes before (a per-request credential) and after (run `apiKeys`, then the
 * environment); this module answers only "which MJ Credential applies, and what is its value".
 *
 * @module @memberjunction/ai-prompts
 * @author MemberJunction.com
 */

import { UserInfo } from '@memberjunction/core';
import { NormalizeUUID, UUIDsEqual } from '@memberjunction/global';
import { MJAICredentialBindingEntity, MJCredentialEntity } from '@memberjunction/core-entities';
import { AIEngine } from '@memberjunction/aiengine';
import { CredentialEngine } from '@memberjunction/credentials';

/** The metadata rows a platform credential can be bound to. Each is optional; absent tiers are skipped. */
export interface PlatformCredentialTarget {
    /** The `MJ: AI Prompt Models` row id (the PromptModel binding tier). */
    PromptModelID?: string;
    /** The `MJ: AI Model Vendors` row ids to try, in order (the ModelVendor binding tier). */
    ModelVendorIDs?: string[];
    /** The `MJ: AI Vendors` row id (the Vendor binding tier and the type-based default). */
    VendorID?: string;
}

/** Where the resolver reports what it did. Messages never contain a credential's value. */
export interface PlatformCredentialLogger {
    /** A verbose-only progress line (which credential was used, which was skipped and why). */
    Status(message: string): void;
    /** The last binding of a tier failed to resolve; resolution continues with the next tier. */
    Failure(error: Error, metadata: { credentialId: string; credentialName: string; source: string }): void;
}

/** A request to {@link ResolvePlatformAICredential}. */
export interface PlatformCredentialRequest extends PlatformCredentialTarget {
    /** The user the credential is read as (CredentialEngine configuration and the access log). */
    ContextUser?: UserInfo;
    /** The subsystem recorded in the credential access log (e.g. `AIPromptRunner`). */
    Subsystem: string;
    /** Emit the verbose {@link PlatformCredentialLogger.Status} lines. */
    Verbose?: boolean;
    /** Where to report; omitted means silent. */
    Logger?: PlatformCredentialLogger;
}

/**
 * Resolves the most specific platform MJ Credential for the target: PromptModel bindings, then
 * ModelVendor bindings, then Vendor bindings (each in binding priority order, failing over to the
 * next binding when one cannot be resolved), then the vendor's default credential of its type.
 *
 * The value is the credential's values as JSON (`{"apiKey":"…"}` for an `API Key` credential) —
 * the same string prompt drivers have always received from this tier.
 *
 * @param request The target rows, the context user and logging options.
 * @returns The credential value, or `undefined` when no platform credential applies.
 */
export async function ResolvePlatformAICredential(request: PlatformCredentialRequest): Promise<string | undefined> {
    await CredentialEngine.Instance.Config(false, request.ContextUser);

    if (request.PromptModelID) {
        const bindings = AIEngine.Instance.GetCredentialBindingsForTarget('PromptModel', request.PromptModelID);
        const result = await tryBindingsWithFailover(bindings, 'AICredentialBinding(PromptModel)', request);
        if (result) return result;
    }

    for (const modelVendorID of request.ModelVendorIDs ?? []) {
        const bindings = AIEngine.Instance.GetCredentialBindingsForTarget('ModelVendor', modelVendorID);
        const result = await tryBindingsWithFailover(bindings, 'AICredentialBinding(ModelVendor)', request);
        if (result) return result;
    }

    if (request.VendorID) {
        const bindings = AIEngine.Instance.GetCredentialBindingsForTarget('Vendor', request.VendorID);
        const result = await tryBindingsWithFailover(bindings, 'AICredentialBinding(Vendor)', request);
        if (result) return result;
    }

    const defaultCredential = request.VendorID ? FindVendorDefaultCredential(request.VendorID) : null;
    if (defaultCredential) {
        const result = await tryResolveCredential(defaultCredential, 'type-based default', request, false);
        if (result) return result;
    }

    return undefined;
}

/**
 * Whether a platform MJ Credential is configured for the target, from cached metadata alone (no
 * credential is read). The pre-flight twin of {@link ResolvePlatformAICredential}.
 *
 * @param target The target rows.
 * @returns `true` when any binding tier has a binding or the vendor has a usable default credential.
 */
export function HasPlatformAICredential(target: PlatformCredentialTarget): boolean {
    if (target.PromptModelID && AIEngine.Instance.HasCredentialBindings('PromptModel', target.PromptModelID)) {
        return true;
    }
    if ((target.ModelVendorIDs ?? []).some(id => AIEngine.Instance.HasCredentialBindings('ModelVendor', id))) {
        return true;
    }
    if (target.VendorID && AIEngine.Instance.HasCredentialBindings('Vendor', target.VendorID)) {
        return true;
    }
    return !!target.VendorID && FindVendorDefaultCredential(target.VendorID) !== null;
}

/**
 * The vendor's type-based default credential: an active, unexpired credential marked `IsDefault`
 * whose type is the vendor's `CredentialTypeID`. `null` when the vendor declares no type or none matches.
 *
 * @param vendorID The `MJ: AI Vendors` row id.
 */
export function FindVendorDefaultCredential(vendorID: string): MJCredentialEntity | null {
    const vendor = AIEngine.Instance.VendorsByID.get(NormalizeUUID(vendorID));
    if (!vendor?.CredentialTypeID) {
        return null;
    }
    return CredentialEngine.Instance.Credentials.find(c =>
        UUIDsEqual(c.CredentialTypeID, vendor.CredentialTypeID) &&
        c.IsDefault === true &&
        c.IsActive === true &&
        CredentialEngine.Instance.GetExpirationStatus(c).usable
    ) ?? null;
}

/** Tries each binding in priority order until one resolves. */
async function tryBindingsWithFailover(
    bindings: MJAICredentialBindingEntity[],
    source: string,
    request: PlatformCredentialRequest
): Promise<string | null> {
    for (let i = 0; i < bindings.length; i++) {
        const binding = bindings[i];
        const credential = CredentialEngine.Instance.getCredentialById(binding.CredentialID);
        if (!credential) {
            status(request, `   ⚠️ Credential ${binding.CredentialID} not found (priority ${binding.Priority}), trying next...`);
            continue;
        }
        const result = await tryResolveCredential(credential, `${source} priority ${binding.Priority}`, request, i < bindings.length - 1);
        if (result) return result;
    }
    return null;
}

/** Resolves one credential; `null` (never a throw) when it is inactive, expired or unreadable. */
async function tryResolveCredential(
    credential: MJCredentialEntity,
    source: string,
    request: PlatformCredentialRequest,
    hasMoreBindings: boolean
): Promise<string | null> {
    try {
        if (!isCredentialUsable(credential, request)) {
            return null;
        }
        const resolved = await CredentialEngine.Instance.getCredential(credential.Name, {
            credentialId: credential.ID,
            contextUser: request.ContextUser,
            subsystem: request.Subsystem
        });
        status(request, `   🔐 Using credential from ${source}: "${credential.Name}"`);
        return JSON.stringify(resolved.values);
    } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        if (hasMoreBindings) {
            status(request, `   ⚠️ Failed to resolve credential "${credential.Name}" from ${source}: ${err.message}, trying next...`);
        } else {
            request.Logger?.Failure(err, { credentialId: credential.ID, credentialName: credential.Name, source });
        }
        return null;
    }
}

/**
 * Whether a credential is active and unexpired. Expiry is evaluated by the engine, so this path honors
 * the same policy (grace period included) that `getCredential()` applies.
 */
function isCredentialUsable(credential: MJCredentialEntity, request: PlatformCredentialRequest): boolean {
    if (!credential.IsActive) {
        status(request, `   ⚠️ Credential "${credential.Name}" is inactive, trying next...`);
        return false;
    }
    const expiration = CredentialEngine.Instance.GetExpirationStatus(credential);
    if (!expiration.usable) {
        status(request, `   ⚠️ Credential "${credential.Name}" expired on ${expiration.expiresAt?.toISOString()}, trying next...`);
        return false;
    }
    if (expiration.status === 'expiring-soon') {
        status(request, `   ⏳ Credential "${credential.Name}" expires in ${expiration.daysUntilExpiration} day(s)`);
    }
    return true;
}

/** A verbose-only status line, when the request asked for them. */
function status(request: PlatformCredentialRequest, message: string): void {
    if (request.Verbose) {
        request.Logger?.Status(message);
    }
}
