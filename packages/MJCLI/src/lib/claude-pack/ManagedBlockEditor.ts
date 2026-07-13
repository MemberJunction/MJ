/**
 * Parse + rewrite the MJ-managed block in a user's `CLAUDE.md`.
 *
 * The block is delimited by HTML comment markers:
 *   <!-- MJ-MANAGED:CLAUDE-PACK START key=value key=value -->
 *   ... managed content ...
 *   <!-- MJ-MANAGED:CLAUDE-PACK END -->
 *
 * Everything before and after the block is the user's free section and must
 * never be touched.
 *
 * @see plans/claude-install-pack.md §3.3, §6.4 (CLAUDE.md row), §10.4
 */

import type { ManagedBlock } from './PackTypes.js';

// ---------------------------------------------------------------------------
// Marker constants
// ---------------------------------------------------------------------------

/** Match a START marker line and capture the attribute string. */
const START_RE = /<!--\s*MJ-MANAGED:CLAUDE-PACK\s+START\s*([^>]*?)\s*-->/;
/** Match an END marker line. */
const END_RE = /<!--\s*MJ-MANAGED:CLAUDE-PACK\s+END\s*-->/;

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class ManagedBlockError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ManagedBlockError';
    }
}

// ---------------------------------------------------------------------------
// Parse
// ---------------------------------------------------------------------------

/**
 * Find the managed block in a CLAUDE.md file. Returns `null` when no markers
 * are present (caller should handle the "file exists but unmanaged" case).
 * Throws `ManagedBlockError` when markers are malformed (e.g. END before
 * START, only one marker present, multiple START markers).
 */
export function parseManagedBlock(content: string): ManagedBlock | null {
    const startMatch = START_RE.exec(content);
    const endMatch = END_RE.exec(content);

    if (!startMatch && !endMatch) return null;
    if (!startMatch) {
        throw new ManagedBlockError('CLAUDE.md has MJ-MANAGED END marker without a matching START.');
    }
    if (!endMatch) {
        throw new ManagedBlockError('CLAUDE.md has MJ-MANAGED START marker without a matching END.');
    }
    if (endMatch.index < startMatch.index) {
        throw new ManagedBlockError(
            'CLAUDE.md has MJ-MANAGED END marker before its START marker.'
        );
    }

    // Detect a second START marker — that's a corrupted file we won't auto-fix.
    const secondStart = START_RE.exec(content.slice(startMatch.index + startMatch[0].length));
    if (secondStart) {
        throw new ManagedBlockError(
            'CLAUDE.md has multiple MJ-MANAGED START markers; expected exactly one.'
        );
    }

    const before = content.slice(0, startMatch.index);
    const bodyStart = startMatch.index + startMatch[0].length;
    const bodyEnd = endMatch.index;
    const body = content.slice(bodyStart, bodyEnd);
    const after = content.slice(endMatch.index + endMatch[0].length);
    const attrs = parseAttrs(startMatch[1]);

    return { before, body, after, attrs };
}

/**
 * Parse `key=value key2=value2` attribute strings from a START marker.
 *
 * Supports unquoted values without spaces (which is what build-pack.mjs emits).
 * Returns an empty record for an empty attribute string.
 */
function parseAttrs(raw: string): Record<string, string> {
    const out: Record<string, string> = {};
    const trimmed = raw.trim();
    if (!trimmed) return out;
    for (const pair of trimmed.split(/\s+/)) {
        const eq = pair.indexOf('=');
        if (eq <= 0) continue; // skip malformed pairs silently
        const key = pair.slice(0, eq);
        const value = pair.slice(eq + 1);
        out[key] = value;
    }
    return out;
}

// ---------------------------------------------------------------------------
// Rewrite
// ---------------------------------------------------------------------------

/**
 * Replace the managed block in `content` with `newBody`, updating attributes
 * on the START marker.
 *
 * Throws `ManagedBlockError` if no managed block is present — callers should
 * use `wrapWithManagedBlock` for the first-install case.
 */
export function rewriteManagedBlock(
    content: string,
    newBody: string,
    newAttrs: Record<string, string>
): string {
    const block = parseManagedBlock(content);
    if (!block) {
        throw new ManagedBlockError('Cannot rewrite — no managed block found in content.');
    }
    return block.before + formatStartMarker(newAttrs) + newBody + formatEndMarker() + block.after;
}

/**
 * Wrap arbitrary `content` with a managed block, placing the block at the
 * top and the original content below (as the user's free section).
 *
 * If `content` is empty, the result is just the rendered managed block.
 */
export function wrapWithManagedBlock(
    content: string,
    body: string,
    attrs: Record<string, string>
): string {
    const startMarker = formatStartMarker(attrs);
    const endMarker = formatEndMarker();
    const trailing = content.length > 0 ? '\n\n' + content : '\n';
    return startMarker + body + endMarker + trailing;
}

function formatStartMarker(attrs: Record<string, string>): string {
    const attrString = Object.entries(attrs)
        .map(([k, v]) => `${k}=${v}`)
        .join(' ');
    return attrString
        ? `<!-- MJ-MANAGED:CLAUDE-PACK START ${attrString} -->`
        : `<!-- MJ-MANAGED:CLAUDE-PACK START -->`;
}

function formatEndMarker(): string {
    return `<!-- MJ-MANAGED:CLAUDE-PACK END -->`;
}
