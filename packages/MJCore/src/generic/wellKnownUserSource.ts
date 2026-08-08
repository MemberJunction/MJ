import { MJGlobal } from "@memberjunction/global";
// Type-only imports: erased at compile time, so this module has no runtime dependency on the
// rest of MJCore. That matters because entityInfo consumes it, and a runtime import back into
// interfaces/securityInfo would close an import cycle.
import type { IMetadataProvider } from "./interfaces";
import type { UserInfo } from "./securityInfo";

/**
 * Supplies the platform's **well-known users** — the built-in, non-human accounts MJ itself
 * acts as — and answers whether a given user is one of them.
 *
 * This is a plug-in point, not a service. The base implementation says "there are none": it
 * returns null and false for everything. Server-side packages register a subclass with
 * `@RegisterClassEx(WellKnownUserSource, …)` that answers properly, and consumers resolve it
 * through the MJGlobal ClassFactory — so a process with no server-side implementation loaded
 * (a browser, most obviously) transparently gets the base answers, which are correct there.
 *
 * **Why this exists as its own seam.** MJCore is shared by browsers and servers, and which
 * account the platform runs its own work as is a server concern. Keeping the identity — and
 * the account's ID — out of MJCore means a browser bundle carries no knowledge of the server's
 * service account, and the answer travels with whichever data-provider package the process
 * actually loaded rather than with a constant compiled into core.
 *
 * **Why it is NOT on `IMetadataProvider`.** A metadata provider's job is data access; platform
 * identity is policy. Keeping it separate also keeps `CurrentUser` meaning what it means today
 * — permanently null on the server — so the many `contextUser ?? provider.CurrentUser`
 * fallbacks keep failing loudly instead of silently escalating to the most privileged account.
 *
 * Today the category has one member, the system user. It has visible future members — the
 * active-Owner fallback that startup and the telephony routers hand-roll, and the
 * scoped-anonymous identity used for widget-guest elevation — and those belong here as their
 * own named methods rather than as variations smuggled into the existing ones.
 */
export class WellKnownUserSource {
    private static _instance: WellKnownUserSource | null = null;

    /**
     * The registered source for this process, resolved once through the class factory.
     *
     * Cached because {@link IsSystemUser} sits behind permission checks that run per entity and
     * per user; resolving (and allocating) on every call would be needless churn. Registrations
     * happen as module-load side effects of importing a data-provider package, which always
     * precedes any permission evaluation, so caching cannot capture a stale answer in practice.
     * Tests that register a source after first use should call {@link ResetInstance}.
     */
    public static get Instance(): WellKnownUserSource {
        if (!WellKnownUserSource._instance) {
            WellKnownUserSource._instance =
                MJGlobal.Instance.ClassFactory.CreateInstance<WellKnownUserSource>(WellKnownUserSource)
                ?? new WellKnownUserSource();
        }
        return WellKnownUserSource._instance;
    }

    /**
     * Drops the cached {@link Instance} so the next access re-resolves through the class
     * factory. Intended for tests that register a source after the cache was populated.
     */
    public static ResetInstance(): void {
        WellKnownUserSource._instance = null;
    }

    /**
     * True when `user` is the MJ system user — the server's own service account, not a person.
     *
     * Synchronous on purpose: this is consumed by permission checks that cannot await. The base
     * returns false, which is the right answer anywhere no server-side source is registered —
     * a browser has no system account, so no user it holds can be one.
     *
     * Implementations must be null/undefined-safe so callers can pass an optional user directly.
     */
    public IsSystemUser(user: UserInfo | null | undefined): boolean {
        return false;
    }

    /**
     * The MJ system user for the given provider's connection, with `UserRoles` populated, or
     * null when this process has no such identity to offer.
     *
     * Implementations MUST NOT throw — a missing user row, an unconfigured provider, or a
     * failed lookup all resolve to null so callers can degrade rather than crash. Callers MUST
     * treat null as "no elevated identity available" and fall back to their existing behavior.
     *
     * @param provider The provider whose connection the user is being resolved for. Passed
     *   explicitly (rather than read from a global) so a process holding several connections
     *   resolves the account belonging to the one actually in use.
     */
    public async GetSystemUser(provider: IMetadataProvider): Promise<UserInfo | null> {
        return null;
    }
}
