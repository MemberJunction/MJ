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
import { BuildRemoteUrlPrefix } from './PackPaths.js';

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
    StatusCode: number;
    Body: Uint8Array;
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
export const RealHttpGet: HttpGetter = (url) =>
    new Promise<HttpResponse>((resolve, reject) => {
        const req = https.get(url, (res) => {
            const chunks: Uint8Array[] = [];
            res.on('data', (chunk: Uint8Array) => chunks.push(chunk));
            res.on('end', () => {
                resolve({ StatusCode: res.statusCode ?? 0, Body: concatBytes(chunks) });
            });
            res.on('error', reject);
        });
        req.on('error', reject);
        req.setTimeout(30_000, () => {
            req.destroy(new Error(`Timed out after 30s fetching ${url}`));
        });
    });

/** @deprecated Use {@link RealHttpGet}. */
export const realHttpGet: HttpGetter = RealHttpGet;

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
    constructor(message: string, public url?: string, public statusCode?: number) {  // case-violation-ok-legacy-back-compat: an accessor cannot be optional, so a stub would turn this into a required member
        super(message);
        this.name = 'PackFetchError';
    }
}

export class PackChecksumError extends Error {
    constructor(
        message: string,
        public path: string,
        public expected: string,  // case-violation-ok-legacy-back-compat: object literals are assigned to this class, so an accessor stub changes what they must supply
        public actual: string  // case-violation-ok-legacy-back-compat: object literals are assigned to this class, so an accessor stub changes what they must supply
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
    /**
     * When true, fetch only the manifest and skip the per-file downloads.
     * Used by `mj update:claude --check` to compare versions without paying
     * for content the caller won't write. The returned `Files` map is empty.
     */
    ManifestOnly?: boolean;
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
export async function FetchPack(opts: FetchPackOptions): Promise<FetchedPack> {
    const httpGet = opts.HttpGet ?? RealHttpGet;
    const requestedRef = opts.Ref ?? 'main';
    const onProgress = opts.OnProgress ?? (() => {});

    const { manifest, refUsed, baseUrl } = await fetchManifestWithFallback(
        opts.Major,
        requestedRef,
        httpGet,
        onProgress
    );

    const files = new Map<string, Uint8Array>();
    if (opts.ManifestOnly) {
        return { Manifest: manifest, Files: files, RefUsed: refUsed, BaseUrl: baseUrl };
    }

    for (const entry of manifest.files) {
        const url = baseUrl + entry.path;
        onProgress(`fetching ${entry.path}`);
        const res = await httpGet(url);
        if (res.StatusCode !== 200) {
            throw new PackFetchError(
                `Failed to fetch ${entry.path}: HTTP ${res.StatusCode}`,
                url,
                res.StatusCode
            );
        }
        verifyChecksum(entry, res.Body);
        files.set(entry.path, res.Body);
    }

    return { Manifest: manifest, Files: files, RefUsed: refUsed, BaseUrl: baseUrl };
}

/** @deprecated Use {@link FetchPack}. */
export async function fetchPack(opts: FetchPackOptions): Promise<FetchedPack> {
    return FetchPack(opts);
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
        const baseUrl = BuildRemoteUrlPrefix(major, ref);
        const manifestUrl = baseUrl + '.claude/mj/MANIFEST.json';
        onProgress(`fetching manifest from ref=${ref}`);
        const res = await httpGet(manifestUrl);
        return { res, baseUrl, manifestUrl };
    };

    // First attempt: requested ref
    const first = await tryRef(requestedRef);
    if (first.res.StatusCode === 200) {
        return {
            manifest: parseManifest(first.res.Body, first.manifestUrl),
            refUsed: requestedRef,
            baseUrl: first.baseUrl,
        };
    }

    // Fallback: try `main` if we weren't already on it AND the failure was 404.
    // Other status codes (5xx, network errors) propagate immediately —
    // fallback is for "this tag doesn't have the pack yet", not for "the
    // network is broken".
    if (first.res.StatusCode === 404 && requestedRef !== 'main') {
        onProgress(`ref ${requestedRef} 404; falling back to main`);
        const second = await tryRef('main');
        if (second.res.StatusCode === 200) {
            return {
                manifest: parseManifest(second.res.Body, second.manifestUrl),
                refUsed: 'main',
                baseUrl: second.baseUrl,
            };
        }
        throw new PackFetchError(
            `Failed to fetch manifest from both ${requestedRef} and main (HTTP ${second.res.StatusCode})`,
            second.manifestUrl,
            second.res.StatusCode
        );
    }

    throw new PackFetchError(
        `Failed to fetch manifest from ${requestedRef}: HTTP ${first.res.StatusCode}`,
        first.manifestUrl,
        first.res.StatusCode
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
