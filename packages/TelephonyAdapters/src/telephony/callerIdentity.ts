/**
 * @fileoverview The extension point that turns an inbound caller's number into whatever the host knows about them.
 *
 * MemberJunction core knows nothing about people, contacts or CRMs, so it cannot say who is calling. A host that
 * does (a membership system, a CRM) registers its own {@link BaseCallerIdentityResolver} subclass under
 * {@link CALLER_IDENTITY_RESOLVER_KEY} and the telephony services use it instead of the default, which treats
 * every caller as anonymous. The agent is then told the caller's number, and whether anything about them was
 * verified, as call context.
 *
 * **A caller-ID number is not proof of identity** — it is trivially spoofed. The default resolver says so, and a
 * host resolver should only return `Verified: true` when it has verified the caller some other way (a PIN the
 * caller entered, a callback, a signed-in session).
 *
 * @module @memberjunction/telephony-adapters
 */

import { LogError, UserInfo } from '@memberjunction/core';
import { MJGlobal, RegisterClass } from '@memberjunction/global';

/** The ClassFactory key a host registers its resolver under to replace the default. */
export const CALLER_IDENTITY_RESOLVER_KEY = 'TelephonyCallerIdentity';

/** What the host knows about the party on the other end of an inbound call. */
export interface CallerIdentity {
    /** A name to address the caller by, when the host recognises the number. */
    DisplayName?: string;
    /** Whether the host VERIFIED who this is (never merely "the number matched a record"). */
    Verified: boolean;
    /** Free-text facts the agent may use (membership status, open cases) — written for the model to read. */
    ContextNotes?: string;
}

/** Resolves an inbound caller's identity. */
export interface ICallerIdentityResolver {
    /**
     * @param fromNumber The caller's number as the carrier reported it (caller ID — unverified).
     * @param dialedNumber The number the caller dialled (the agent's DID).
     * @param contextUser The user the call runs as.
     */
    ResolveCaller(fromNumber: string, dialedNumber: string, contextUser: UserInfo): Promise<CallerIdentity>;
}

/** Base class host resolvers extend and register under {@link CALLER_IDENTITY_RESOLVER_KEY}. */
export abstract class BaseCallerIdentityResolver implements ICallerIdentityResolver {
    public abstract ResolveCaller(fromNumber: string, dialedNumber: string, contextUser: UserInfo): Promise<CallerIdentity>;
}

/** The default: nothing is known about the caller and nothing is verified. */
@RegisterClass(BaseCallerIdentityResolver, CALLER_IDENTITY_RESOLVER_KEY)
export class AnonymousCallerIdentityResolver extends BaseCallerIdentityResolver {
    public async ResolveCaller(): Promise<CallerIdentity> {
        return { Verified: false };
    }
}

/** Tree-shaking anchor: importing this keeps the default resolver registered. */
export function LoadAnonymousCallerIdentityResolver(): void {
    // intentionally empty — the import itself is what registers the class
}

/**
 * Builds the resolver to use: the host's registration (highest priority wins, so a host subclass loaded after
 * this package replaces the default), else the anonymous default.
 */
export function CreateCallerIdentityResolver(): ICallerIdentityResolver {
    const registration = MJGlobal.Instance.ClassFactory.GetRegistration(BaseCallerIdentityResolver, CALLER_IDENTITY_RESOLVER_KEY);
    if (registration) {
        const instance = MJGlobal.Instance.ClassFactory.CreateInstance<BaseCallerIdentityResolver>(BaseCallerIdentityResolver, CALLER_IDENTITY_RESOLVER_KEY);
        if (instance) {
            return instance;
        }
    }
    return new AnonymousCallerIdentityResolver();
}

/**
 * Runs a resolver and never lets it fail the call: a throwing host resolver is logged and the caller is treated
 * as anonymous, so a CRM outage cannot stop the phone from being answered.
 */
export async function ResolveCallerSafely(
    resolver: ICallerIdentityResolver,
    fromNumber: string,
    dialedNumber: string,
    contextUser: UserInfo,
): Promise<CallerIdentity> {
    try {
        const identity = await resolver.ResolveCaller(fromNumber, dialedNumber, contextUser);
        // A resolver can only vouch for a caller it actually identified.
        return { ...identity, Verified: identity.Verified === true };
    } catch (e) {
        LogError(`[Telephony] caller identity resolution failed; treating the caller as anonymous: ${e instanceof Error ? e.message : String(e)}`);
        return { Verified: false };
    }
}
