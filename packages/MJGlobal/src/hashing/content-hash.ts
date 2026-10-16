import { Canonicalize } from './canonicalize';

/**
 * Calculates SHA-256 hash of a mapped-field record or arbitrary object asynchronously.
 * Uses Web Crypto API (`crypto.subtle`) which is available in modern browsers (secure contexts)
 * and Node.js 15+.
 *
 * Produces hex digests byte-for-byte identical to Node.js `node:crypto`'s `createHash('sha256')`
 * over the canonical JSON produced by {@link Canonicalize}.
 */
export async function ComputeContentHashAsync(fields: Record<string, unknown>): Promise<string> {
    // Check for crypto.subtle availability
    if (typeof crypto === 'undefined' || !crypto.subtle) {
        throw new Error(
            'Web Crypto API not available. This typically happens when running in an insecure context. ' +
            'Please use HTTPS or localhost for development. ' +
            'Note: crypto.subtle is available in Node.js 15+ and all modern browsers on secure contexts.'
        );
    }

    const canonical = Canonicalize(fields);
    const encoder = new TextEncoder();
    const data = encoder.encode(canonical);

    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
