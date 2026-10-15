/**
 * @fileoverview {@link ContentFetcher} — getting the bytes.
 *
 * Base MJ holds content data and assumes its caller is entitled to reach the source. Authentication
 * handshakes, credential storage and role-based control belong to the layer above, so this is a
 * deliberately plain contract with an unauthenticated default.
 *
 * **This is the seam for authenticated retrieval.** A deployment that reaches sources needing a
 * token, a cookie or a signed URL registers its own fetcher at the same key; nothing in MJ has to
 * learn what a credential is.
 *
 * @module @memberjunction/content-pipeline
 */

import { MJGlobal, RegisterClass } from '@memberjunction/global';
import { SafeFetch } from '@memberjunction/network-utils';
import { AccessArtifact } from '@memberjunction/content-pipeline-base';

/** What to fetch, and under what constraints. */
export interface FetchRequest {
    /** Where the bytes are. */
    URL: string;
    /** The Content Source this belongs to, so a layered fetcher can decide how to reach it. */
    ContentSourceID: string;
    /**
     * The source's own URL. Its origin is where a session is presented by default — see
     * `AccessArtifact.Origins`.
     */
    SourceURL?: string;
    /** The source's type-specific settings, already defaulted and validated. */
    Parameters: Readonly<Record<string, string>>;
    /**
     * The open session, when this source needs one.
     *
     * Produced by the Access driver and handed down rather than obtained here: the fetcher moves
     * bytes and knows nothing about credentials, which is what lets one fetcher serve a public site
     * and an authenticated API without caring which it is.
     */
    Access?: AccessArtifact;
    /** Fires when the run is asked to stop. */
    Signal: AbortSignal;
}

/** The bytes, and whatever the transport said about them. */
export interface FetchResponse {
    /** The fetched bytes. */
    Content: Uint8Array;
    /** The transport's own content-type claim, when it made one. A weak signal, not a declaration. */
    ContentType?: string;
    /** The final URL after any redirects. */
    ResolvedURL?: string;
}

/**
 * Fetches bytes for the Extract stage.
 *
 * The default implementation is an ordinary unauthenticated HTTP GET — enough for public sources,
 * and honest about being nothing more.
 *
 * It goes through {@link SafeFetch} rather than `fetch`. A Content Source URL is attacker-influenced
 * data: anyone who can create or edit a source can point it at `169.254.169.254` or at something
 * behind the firewall and have the server fetch it for them. SafeFetch resolves the host and refuses
 * private, loopback and link-local addresses, re-checking on every redirect hop.
 */
@RegisterClass(ContentFetcher, 'ContentFetcher')
export class ContentFetcher {
    /**
     * Whether the session belongs on this request.
     *
     * Only for the origins the session is for: the ones the access driver listed, or the source's
     * own. An item URL is whatever the source pointed at — every article an RSS feed links to — and
     * sending the source's API key with all of them hands it to every site on the list.
     */
    protected SessionApplies(request: FetchRequest): boolean {
        if (!request.Access) {
            return false;
        }
        const target = OriginOf(request.URL);
        const allowed = request.Access.Origins?.length
            ? request.Access.Origins
            : request.SourceURL
              ? [request.SourceURL]
              : [];
        return target !== null && allowed.some((origin) => OriginOf(origin) === target);
    }

    /** The URL to fetch, with any session query parameters applied. */
    protected applyAccess(request: FetchRequest): string {
        const parameters = request.Access?.QueryParameters;
        if (!parameters || Object.keys(parameters).length === 0 || !this.SessionApplies(request)) {
            return request.URL;
        }
        const url = new URL(request.URL);
        for (const [name, value] of Object.entries(parameters)) {
            url.searchParams.set(name, value);
        }
        return url.toString();
    }

    /** Fetch the bytes at a URL. */
    public async Fetch(request: FetchRequest): Promise<FetchResponse> {
        const headers = this.SessionApplies(request) ? request.Access?.Headers : undefined;
        const response = await SafeFetch(this.applyAccess(request), {
            signal: request.Signal,
            ...(headers ? { headers: { ...headers } } : {}),
            // A redirect to another host must not carry the session with it.
            StripHeadersOnCrossOriginRedirect: true,
        });
        if (!response.ok) {
            throw new Error(`Fetching '${request.URL}' failed: HTTP ${response.status} ${response.statusText}`);
        }
        return {
            Content: new Uint8Array(await response.arrayBuffer()),
            ContentType: response.headers.get('content-type') ?? undefined,
            ResolvedURL: response.url || request.URL,
        };
    }

    /**
     * Resolve the registered fetcher, so a deployment's own is used when one is registered and the
     * plain HTTP one otherwise.
     */
    public static Resolve(): ContentFetcher {
        const result = MJGlobal.Instance.ClassFactory.TryCreateInstance<ContentFetcher>(
            ContentFetcher,
            'ContentFetcher',
        );
        return result.Resolved && result.Instance ? result.Instance : new ContentFetcher();
    }
}

/** A URL's origin, or null when it is not a URL. */
function OriginOf(url: string): string | null {
    try {
        return new URL(url).origin;
    } catch {
        return null;
    }
}
