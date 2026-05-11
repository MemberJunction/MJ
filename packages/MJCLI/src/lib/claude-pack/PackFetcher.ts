/**
 * Fetches a Claude Code pack from `raw.githubusercontent.com`, verifies sha256
 * against the manifest, and handles the tag→main ref-fallback per plan §8.5.
 *
 * Design notes:
 *  - HTTP transport is injected via `HttpGetter` so tests can plug in a mock
 *    without `vi.mock('node:https')`. Production uses `realHttpGet` (a thin
 *    wrapper over `node:https`).
 *  - No tokens, no auth headers — `raw.githubusercontent.com` is public
 *    (plan §7.7). The fetcher never includes credentials.
 *  - No caching here. The orchestrator decides whether to re-fetch.
 *
 * @see plans/claude-install-pack.md §5.2 (manifest), §6.3, §8.5 (ref fallback)
 */

import { createHash } from 'node:crypto';
import https from 'node:https';
import type { Manifest, ManifestEntry } from './PackTypes.js';
import { buildRemoteUrlPrefix } from './PackPaths.js';

// ---------------------------------------------------------------------------
// HTTP injection point
// ---------------------------------------------------------------------------

/**
 * Response body is typed as `Uint8Array` (Buffer's superclass) so this type
 * stays portable across Node typings versions that vary in how strictly they
 * model Buffer's ArrayBuffer parameter. `Buffer.concat` and `createHash`
 * both accept `Uint8Array` directly.
 */
export interface HttpResponse {
    statusCode: number;
    body: Uint8Array;
}

/** Promise-based GET. Production = node:https; tests = mock. */
export type HttpGetter = (url: string) => Promise<HttpResponse>;

/**
 * Real production fetcher using `node:https`.
 *
 * Implementation note: builds the response body via manual Uint8Array
 * concatenation instead of `Buffer.concat()` — the latter's return type
 * (`Buffer`) doesn't cleanly assign to `Uint8Array` in the strict @types/node
 * generics that ship with v20+, even though Buffer extends Uint8Array.
 */
export const realHttpGet: HttpGetter = (url) =>
    new Promise<HttpResponse>((resolve, reject) => {
        const req = https.get(url, (res) => {
            const chunks: Uint8Array[] = [];
            res.on('data', (chunk: Uint8Array) => chunks.push(chunk));
            res.on('end', () => {
                resolve({ statusCode: res.statusCode ?? 0, body: concatBytes(chunks) });
            });
            res.on('error', reject);
        });
        req.on('error', reject);
        req.setTimeout(30_000, () => {
            req.destroy(new Error(`Timed out after 30s fetching ${url}`));
        });
    });

function concatBytes(chunks: readonly Uint8Array[]): Uint8Array {
    const total = chunks.reduce((s, c) => s + c.byteLength, 0);
    const out = new Uint8Array(total);
    let offset = 0;
    for (const c of chunks) {
        out.set(c, offset);
        offset += c.byteLength;
    }
    return out;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class PackFetchError extends Error {
    constructor(message: string, public url?: string, public statusCode?: number) {
        super(message);
        this.name = 'PackFetchError';
    }
}

export class PackChecksumError extends Error {
    constructor(
        message: string,
        public path: string,
        public expected: string,
        public actual: string
    ) {
        super(message);
        this.name = 'PackChecksumError';
    }
}

// ---------------------------------------------------------------------------
// Fetch options + result
// ---------------------------------------------------------------------------

export interface FetchPackOptions {
    /** MJ major version (e.g. `5`). Required — used to locate `dist/v{N}/`. */
    Major: string;
    /**
     * Git ref to fetch from. Defaults to `'main'`. If a specific tag is given
     * and it 404s, the fetcher transparently falls back to `'main'`.
     */
    Ref?: string;
    /** Injected HTTP getter — test seam. Defaults to `realHttpGet`. */
    HttpGet?: HttpGetter;
    /** Progress callback for verbose mode. */
    OnProgress?: (message: string) => void;
}

export interface FetchedPack {
    /** Parsed MANIFEST.json. */
    Manifest: Manifest;
    /**
     * Pack file contents keyed by manifest path (e.g. `.claude/mj/core.md`).
     * Bytes verified against the manifest's sha256 before insertion.
     */
    Files: Map<string, Uint8Array>;
    /** Which ref was actually used (after fallback). */
    RefUsed: string;
    /** The full base URL the fetcher ultimately read from. */
    BaseUrl: string;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Fetch a pack: manifest first, then every file listed in it, verifying
 * sha256 along the way. Falls back from a specific tag to `main` if the
 * manifest 404s.
 */
export async function fetchPack(opts: FetchPackOptions): Promise<FetchedPack> {
    const httpGet = opts.HttpGet ?? realHttpGet;
    const requestedRef = opts.Ref ?? 'main';
    const onProgress = opts.OnProgress ?? (() => {});

    const { manifest, refUsed, baseUrl } = await fetchManifestWithFallback(
        opts.Major,
        requestedRef,
        httpGet,
        onProgress
    );

    const files = new Map<string, Uint8Array>();
    for (const entry of manifest.files) {
        const url = baseUrl + entry.path;
        onProgress(`fetching ${entry.path}`);
        const res = await httpGet(url);
        if (res.statusCode !== 200) {
            throw new PackFetchError(
                `Failed to fetch ${entry.path}: HTTP ${res.statusCode}`,
                url,
                res.statusCode
            );
        }
        verifyChecksum(entry, res.body);
        files.set(entry.path, res.body);
    }

    return { Manifest: manifest, Files: files, RefUsed: refUsed, BaseUrl: baseUrl };
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

async function fetchManifestWithFallback(
    major: string,
    requestedRef: string,
    httpGet: HttpGetter,
    onProgress: (m: string) => void
): Promise<{ manifest: Manifest; refUsed: string; baseUrl: string }> {
    const tryRef = async (ref: string) => {
        const baseUrl = buildRemoteUrlPrefix(major, ref);
        const manifestUrl = baseUrl + '.claude/mj/MANIFEST.json';
        onProgress(`fetching manifest from ref=${ref}`);
        const res = await httpGet(manifestUrl);
        return { res, baseUrl, manifestUrl };
    };

    // First attempt: requested ref
    const first = await tryRef(requestedRef);
    if (first.res.statusCode === 200) {
        return {
            manifest: parseManifest(first.res.body, first.manifestUrl),
            refUsed: requestedRef,
            baseUrl: first.baseUrl,
        };
    }

    // Fallback: try `main` if we weren't already on it AND the failure was 404.
    // Other status codes (5xx, network errors) propagate immediately —
    // fallback is for "this tag doesn't have the pack yet", not for "the
    // network is broken".
    if (first.res.statusCode === 404 && requestedRef !== 'main') {
        onProgress(`ref ${requestedRef} 404; falling back to main`);
        const second = await tryRef('main');
        if (second.res.statusCode === 200) {
            return {
                manifest: parseManifest(second.res.body, second.manifestUrl),
                refUsed: 'main',
                baseUrl: second.baseUrl,
            };
        }
        throw new PackFetchError(
            `Failed to fetch manifest from both ${requestedRef} and main (HTTP ${second.res.statusCode})`,
            second.manifestUrl,
            second.res.statusCode
        );
    }

    throw new PackFetchError(
        `Failed to fetch manifest from ${requestedRef}: HTTP ${first.res.statusCode}`,
        first.manifestUrl,
        first.res.statusCode
    );
}

function parseManifest(body: Uint8Array, url: string): Manifest {
    let raw: unknown;
    try {
        raw = JSON.parse(new TextDecoder('utf-8').decode(body));
    } catch (err) {
        throw new PackFetchError(
            `Manifest at ${url} is not valid JSON: ${(err as Error).message}`,
            url
        );
    }
    if (
        !raw ||
        typeof raw !== 'object' ||
        typeof (raw as Manifest).packVersion !== 'string' ||
        typeof (raw as Manifest).mjMajor !== 'string' ||
        !Array.isArray((raw as Manifest).files)
    ) {
        throw new PackFetchError(`Manifest at ${url} has the wrong shape`, url);
    }
    return raw as Manifest;
}

function verifyChecksum(entry: ManifestEntry, body: Uint8Array): void {
    const actual = createHash('sha256').update(body).digest('hex');
    if (actual !== entry.sha256) {
        throw new PackChecksumError(
            `Checksum mismatch for ${entry.path}: expected ${entry.sha256}, got ${actual}`,
            entry.path,
            entry.sha256,
            actual
        );
    }
    if (body.length !== entry.bytes) {
        throw new PackChecksumError(
            `Size mismatch for ${entry.path}: expected ${entry.bytes} bytes, got ${body.length}`,
            entry.path,
            String(entry.bytes),
            String(body.length)
        );
    }
}
