/**
 * @fileoverview Fetching an item's bytes over HTTP, for a source whose driver has no `Fetch`.
 *
 * @module @memberjunction/content-pipeline
 */

import { HttpGet, HttpHead } from '@memberjunction/network-utils';
import { AccessArtifact } from '@memberjunction/content-pipeline-base';

/** What to fetch. */
export interface FetchRequest {
    URL: string;
    /** The source's URL; its origin is where the session goes by default. */
    SourceURL?: string;
    /** The run's session for the source, if it has one. */
    Access?: AccessArtifact | null;
    /** The `User-Agent` to send (`Configuration.Website.UserAgent`). Extract always sets one (`ResolveWebFetchSettings` defaults it). */
    UserAgent?: string;
    /**
     * The most bytes to read (`Configuration.Website.MaxResponseBytes`). A body past it fails the fetch while it is
     * read, as a lasting error (the item will not get smaller). Unset: no limit.
     */
    MaxBytes?: number;
    Signal: AbortSignal;
}

/** The bytes, and what the transport said about them. */
export interface FetchResponse {
    Content: Uint8Array;
    /** The server's content-type claim. A weak signal, not a declaration. */
    ContentType?: string;
    /** The final URL after redirects. */
    ResolvedURL?: string;
}

/**
 * GET a URL through the SSRF guard (a source URL is attacker-influenced data). The session goes
 * only to the origins it is for, and is dropped on a cross-origin redirect.
 */
export async function FetchContent(request: FetchRequest): Promise<FetchResponse> {
    const access = SessionApplies(request) ? request.Access : null;
    const response = await HttpGet<ArrayBuffer>(request.URL, {
        ResponseType: 'arraybuffer',
        ...requestOptions(request, access),
        MaxResponseBytes: request.MaxBytes,
    });
    return {
        Content: new Uint8Array(response.Data),
        ContentType: response.Headers['content-type'],
        ResolvedURL: response.Url || request.URL,
    };
}

/**
 * What a HEAD says an address serves, without downloading it: its content type, or undefined when the server does
 * not answer HEAD (some refuse it) or does not say. Used to keep a PDF away from a page renderer.
 */
export async function ProbeContentType(request: FetchRequest): Promise<string | undefined> {
    const access = SessionApplies(request) ? request.Access : null;
    try {
        const response = await HttpHead(request.URL, { ...requestOptions(request, access), ThrowOnError: false });
        return response.Ok ? response.Headers['content-type'] : undefined;
    } catch {
        return undefined;
    }
}

/** The SSRF guard, the signal, the User-Agent and the session (when it belongs on this URL). */
function requestOptions(request: FetchRequest, access: AccessArtifact | null | undefined) {
    return {
        ValidateUrl: true,
        StripHeadersOnCrossOriginRedirect: true,
        Signal: request.Signal,
        UserAgent: request.UserAgent,
        Headers: access?.Headers ? { ...access.Headers } : undefined,
        Query: access?.QueryParameters ? { ...access.QueryParameters } : undefined,
    };
}

/**
 * Whether the session belongs on this URL: only the origins the session lists, else the source's
 * own. An RSS feed links to the whole web; its API key must not go with every link.
 */
export function SessionApplies(request: FetchRequest): boolean {
    if (!request.Access) {
        return false;
    }
    const allowed = request.Access.Origins?.length ? request.Access.Origins : request.SourceURL ? [request.SourceURL] : [];
    const target = originOf(request.URL);
    return target !== null && allowed.some((origin) => originOf(origin) === target);
}

function originOf(url: string): string | null {
    try {
        return new URL(url).origin;
    } catch {
        return null;
    }
}
