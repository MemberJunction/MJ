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

/** What to fetch, and under what constraints. */
export interface FetchRequest {
    /** Where the bytes are. */
    URL: string;
    /** The Content Source this belongs to, so a layered fetcher can decide how to reach it. */
    ContentSourceID: string;
    /** The source's type-specific settings, already defaulted and validated. */
    Parameters: Readonly<Record<string, string>>;
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
    /** Fetch the bytes at a URL. */
    public async Fetch(request: FetchRequest): Promise<FetchResponse> {
        const response = await SafeFetch(request.URL, { signal: request.Signal });
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
