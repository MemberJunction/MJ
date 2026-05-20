/**
 * Pure resolver for matching an upload's MIME type (and optional file
 * extension) to a registered Artifact Type. Has no entity dependency — takes
 * a list of plain matcher records, returns the chosen ID (or undefined when
 * nothing matches).
 *
 * Resolution algorithm (per plans/artifact-attachment-unification.md §6):
 *   1. Filter to types whose ContentType pattern matches the upload MIME.
 *   2. Bucket by specificity: exact > subtype-wildcard (e.g. `image/*`).
 *   3. Within the highest-specificity bucket, sort by Priority desc.
 *   4. Tiebreaker if priorities are equal:
 *        a. SystemSupplied = false beats SystemSupplied = true
 *        b. otherwise lowest ID wins (deterministic).
 *
 * Octet-stream uploads also consider a file-extension hint when given.
 *
 * Conflict detection: callers can pass the same list to
 * `FindArtifactTypeConflicts` to surface ambiguous registrations at engine
 * boot, where two types share the same (ContentType, Priority, SystemSupplied)
 * triple — almost always a configuration mistake.
 */

export interface ArtifactTypeMatcher {
    /** Stable identifier (UUID) — used as the final tiebreaker. */
    id: string;
    /** Display name — for logging only. */
    name: string;
    /** MIME pattern: either an exact MIME or a subtype wildcard like `text/*`. */
    contentType: string;
    /** Higher wins within a specificity tier. */
    priority: number;
    /** System-shipped defaults rank below organization customizations at equal priority. */
    systemSupplied: boolean;
    /** Optional list of file extensions (no leading dot) that map to this type. */
    fileExtensions?: string[];
}

export type ArtifactTypeConflict = {
    contentType: string;
    priority: number;
    systemSupplied: boolean;
    matcherIds: string[];
    matcherNames: string[];
};

const SUBTYPE_WILDCARD_SUFFIX = '/*';

export function ResolveArtifactTypeByMime(
    matchers: ReadonlyArray<ArtifactTypeMatcher>,
    mimeType: string | null | undefined,
    fileExtension?: string | null,
): ArtifactTypeMatcher | undefined {
    const normalizedMime = normalizeMime(mimeType);
    if (!normalizedMime) return undefined;

    const candidates = collectCandidates(matchers, normalizedMime, fileExtension);
    if (candidates.length === 0) return undefined;

    const ranked = rankCandidates(candidates);
    return ranked[0]?.matcher;
}

export function FindArtifactTypeConflicts(
    matchers: ReadonlyArray<ArtifactTypeMatcher>,
): ArtifactTypeConflict[] {
    const groups = new Map<string, ArtifactTypeMatcher[]>();
    for (const m of matchers) {
        const key = `${normalizeMime(m.contentType) ?? ''}|${m.priority}|${m.systemSupplied}`;
        const list = groups.get(key) ?? [];
        list.push(m);
        groups.set(key, list);
    }

    const conflicts: ArtifactTypeConflict[] = [];
    for (const list of groups.values()) {
        if (list.length < 2) continue;
        conflicts.push({
            contentType: list[0].contentType,
            priority: list[0].priority,
            systemSupplied: list[0].systemSupplied,
            matcherIds: list.map(m => m.id),
            matcherNames: list.map(m => m.name),
        });
    }
    return conflicts;
}

// --------------------------------------------------------------------------
// Internals
// --------------------------------------------------------------------------

interface RankedCandidate {
    matcher: ArtifactTypeMatcher;
    specificity: number;
}

function collectCandidates(
    matchers: ReadonlyArray<ArtifactTypeMatcher>,
    mime: string,
    fileExtension?: string | null,
): RankedCandidate[] {
    const out: RankedCandidate[] = [];
    const ext = normalizeExtension(fileExtension);
    const isOctetStream = mime === 'application/octet-stream';

    for (const m of matchers) {
        const pattern = normalizeMime(m.contentType);
        if (!pattern) continue;

        if (pattern === mime) {
            out.push({ matcher: m, specificity: 2 });
            continue;
        }

        if (pattern.endsWith(SUBTYPE_WILDCARD_SUFFIX)) {
            const prefix = pattern.slice(0, -SUBTYPE_WILDCARD_SUFFIX.length);
            if (mime.startsWith(prefix + '/')) {
                out.push({ matcher: m, specificity: 1 });
                continue;
            }
        }

        // octet-stream extension hint: if the upload has no useful MIME but we
        // have an extension hint, allow types that registered the extension.
        if (isOctetStream && ext && m.fileExtensions?.includes(ext)) {
            out.push({ matcher: m, specificity: 2 });
        }
    }

    return out;
}

function rankCandidates(candidates: RankedCandidate[]): RankedCandidate[] {
    // Highest specificity first, then Priority desc, then SystemSupplied false
    // wins over true, then lowest ID for determinism.
    const maxSpecificity = Math.max(...candidates.map(c => c.specificity));
    const topBucket = candidates.filter(c => c.specificity === maxSpecificity);
    return [...topBucket].sort((a, b) => {
        if (b.matcher.priority !== a.matcher.priority) {
            return b.matcher.priority - a.matcher.priority;
        }
        if (a.matcher.systemSupplied !== b.matcher.systemSupplied) {
            return a.matcher.systemSupplied ? 1 : -1;
        }
        return a.matcher.id.localeCompare(b.matcher.id);
    });
}

function normalizeMime(value: string | null | undefined): string | undefined {
    if (!value) return undefined;
    const trimmed = value.trim().toLowerCase();
    if (!trimmed) return undefined;
    // Strip any `; charset=...` parameters that browsers sometimes attach.
    const semi = trimmed.indexOf(';');
    return semi === -1 ? trimmed : trimmed.slice(0, semi).trim();
}

function normalizeExtension(value: string | null | undefined): string | undefined {
    if (!value) return undefined;
    const trimmed = value.trim().toLowerCase().replace(/^\./, '');
    return trimmed || undefined;
}
