/**
 * @fileoverview Access — how the pipeline is allowed to reach a source at all.
 *
 * Reaching a source is a separate problem from reading it. A SharePoint library needs a token, a
 * members-only site needs a session cookie, a partner API needs a signed query, and in every case
 * the credential has to be fetched, exchanged, cached while it is valid and renewed when it is not.
 * Folding that into each extractor would mean every extractor re-implementing it, and folding it
 * into the fetcher would mean the fetcher knowing about credentials.
 *
 * So Access produces a **session artifact** — headers, query parameters, a pre-signed URL — and
 * hands it to {@link ContentFetcher}, which stays exactly what it was: the thing that moves bytes.
 *
 * Two rules this contract exists to enforce:
 *
 * - **Secrets come from `MJ: Credentials` and nowhere else.** A driver is handed resolved secret
 *   material; it never reads a key out of a Content Source's Configuration, a Record Process's
 *   Options or the environment. What Configuration holds is the *reference* — which credential to
 *   use for which role — never the secret.
 * - **A role is part of the identity.** The same source read as two different principals is two
 *   different sessions, so artifacts are cached per source AND per role. Caching on the source
 *   alone would hand one role's session to another.
 *
 * @module @memberjunction/content-pipeline-base
 */

import { MJGlobal } from '@memberjunction/global';
import { IMetadataProvider, UserInfo } from '@memberjunction/core';

/** What a driver is told in order to open a session. */
export interface AccessRequest {
    /** The Content Source being reached. */
    ContentSourceID: string;
    /** The source's URL column. */
    URL: string;
    /**
     * The role this session is being opened as.
     *
     * A source read as an administrator and the same source read as an anonymous visitor are
     * different sessions and see different content, which is why this is part of the cache key.
     */
    Role: string;
    /**
     * The secret material for this role, already resolved from `MJ: Credentials`.
     *
     * Shaped as the credential stored it — an api key, a client id and secret, a refresh token.
     * Empty for a source that genuinely needs none.
     */
    Secret: Readonly<Record<string, unknown>>;
    /** The source's type-specific settings, already defaulted and validated. */
    Parameters: Readonly<Record<string, string>>;
    /** The acting user. */
    ContextUser: UserInfo;
    /** The provider to read through. */
    Provider: IMetadataProvider;
    /** Fires when the run is asked to stop. */
    Signal: AbortSignal;
}

/**
 * An open session, in the only form the fetcher needs to care about.
 *
 * Deliberately data rather than a live client object: it has to survive being cached, shared across
 * every record in a run, and handed to a fetcher that knows nothing about how it was obtained.
 */
export interface AccessArtifact {
    /** Headers to send — `Authorization`, `Cookie`, whatever the source expects. */
    Headers?: Readonly<Record<string, string>>;
    /** Query parameters to append, for sources that authenticate in the URL. */
    QueryParameters?: Readonly<Record<string, string>>;
    /**
     * When this stops being valid.
     *
     * The resolver renews on expiry rather than on failure, so a long run does not discover its
     * token died by getting a 401 on record four hundred.
     */
    ExpiresAt?: Date;
    /** Anything the driver's own fetcher needs that the generic shape cannot express. */
    Extensions?: Readonly<Record<string, unknown>>;
}

/** What a connectivity test concluded. */
export interface AccessProbeResult {
    /** Whether a session could be opened. */
    Success: boolean;
    /** What went wrong, in terms an operator can act on. */
    Message?: string;
    /** The driver that was tried. */
    DriverKey?: string;
    /** When the session it opened expires, if it opened one. */
    ExpiresAt?: Date;
}

/**
 * A registered way of opening a session against a kind of source.
 *
 * @example
 * ```ts
 * @RegisterClass(BaseAccessDriver, 'OAuthClientCredentials')
 * export class OAuthAccessDriver extends BaseAccessDriver {
 *     public readonly Key = 'OAuthClientCredentials';
 *     public async Connect(request: AccessRequest): Promise<AccessArtifact> {
 *         const token = await exchange(request.Secret, request.Parameters.TokenURL);
 *         return { Headers: { Authorization: `Bearer ${token.access_token}` }, ExpiresAt: token.expires };
 *     }
 * }
 * ```
 */
export abstract class BaseAccessDriver {
    /** The registration key. Must match the key passed to `@RegisterClass`. */
    public abstract readonly Key: string;

    /**
     * Open a session and describe it.
     *
     * Called once per source and role per run, not once per record — so an expensive exchange is
     * paid for once however many thousand records follow.
     */
    public abstract Connect(request: AccessRequest): Promise<AccessArtifact>;

    /**
     * Check that a session can be opened, without running anything.
     *
     * The default performs the real connect and reports what happened, which is the honest test: a
     * driver that would fail at run time fails here for the same reason. A driver with a cheaper
     * liveness check may override.
     */
    public async Probe(request: AccessRequest): Promise<AccessProbeResult> {
        try {
            const artifact = await this.Connect(request);
            return { Success: true, DriverKey: this.Key, ExpiresAt: artifact.ExpiresAt };
        } catch (error) {
            return {
                Success: false,
                DriverKey: this.Key,
                Message: error instanceof Error ? error.message : String(error),
            };
        }
    }

    /** Resolve a registered driver by key, returning null rather than a hollow base instance. */
    public static Resolve(key: string): BaseAccessDriver | null {
        if (!key || key.trim().length === 0) {
            return null;
        }
        const result = MJGlobal.Instance.ClassFactory.TryCreateInstance<BaseAccessDriver>(
            BaseAccessDriver,
            key.trim(),
        );
        return result.Resolved ? result.Instance : null;
    }
}

/**
 * The role a source is read as when nothing says otherwise.
 *
 * Named rather than empty so the cache key is always meaningful and a log line always says which
 * principal a session belonged to.
 */
export const DEFAULT_ACCESS_ROLE = 'Default';
