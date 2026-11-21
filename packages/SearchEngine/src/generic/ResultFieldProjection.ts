import type { SearchResultItem } from './search.types';

/**
 * Field-level security for search results at read time.
 *
 * Vector metadata, external index documents and the snippets built from them were written once,
 * under whoever ran the indexing job, and are served to every reader. A reader who may not read a
 * field must not see its value in `RawMetadata`, a metadata key, the `Snippet`, or a title or record
 * name that was taken from it. The functions here project one result through the reader's denied
 * set (lowercased field names, as `EntityInfo.GetDeniedReadFields` returns them).
 *
 * The projection is deliberately conservative where it cannot be precise. A snippet is a rendering
 * of some metadata values, and which ones is not recorded, so a snippet that contains the value of
 * any denied field is blanked rather than edited. A result whose metadata cannot be read, and
 * whose text therefore cannot be checked, loses its snippet and title unless its provider already
 * read it through a projected path.
 */

/** Options for {@link ProjectSearchResultForReader}. */
export type SearchResultProjectionOptions = {
    /**
     * The result's text fields came from a read already projected for this reader (a `RunView`
     * against the entity as the reader), so they need no check without metadata to compare against.
     */
    TextAlreadyProjected?: boolean;
};

/**
 * A copy of `item` with every denied field's value removed from `RawMetadata`, and with `Snippet`,
 * `Title` and `RecordName` cleared of any text taken from a denied value. Returns `item` itself
 * when `denied` is empty. The copy keeps `EntityName` and `RecordID`, which result identity
 * (audience intersection, dedup) relies on.
 *
 * A cleared title becomes the `"<EntityName> Record"` placeholder, which the search enricher
 * replaces with the record name resolved for the reader.
 */
export function ProjectSearchResultForReader(
    item: SearchResultItem,
    denied: ReadonlySet<string>,
    options: SearchResultProjectionOptions = {}
): SearchResultItem {
    if (denied.size === 0) {
        return item;
    }
    const metadata = parseMetadata(item.RawMetadata);
    if (metadata === null) {
        return projectWithoutMetadata(item, options);
    }
    const deniedValues = removeDeniedKeys(metadata, denied);
    const projected: SearchResultItem = { ...item, RawMetadata: JSON.stringify(metadata) };
    if (deniedValues.length === 0) {
        return projected;
    }
    if (containsAny(projected.Snippet, deniedValues)) {
        projected.Snippet = '';
    }
    if (containsAny(projected.Title, deniedValues) || containsAny(projected.RecordName, deniedValues)) {
        clearTitle(projected);
    }
    return projected;
}

/**
 * The metadata a result carries, as an object, or `null` when there is none to check the result's
 * text against: absent, unparseable, or not an object. An empty string is an empty object.
 */
function parseMetadata(raw: string | undefined): Record<string, unknown> | null {
    if (raw === undefined || raw === null) {
        return null;
    }
    if (raw === '') {
        return {};
    }
    try {
        const parsed: unknown = JSON.parse(raw);
        return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
    } catch {
        return null;
    }
}

/**
 * A result with no readable metadata: its text is kept only when its provider read it through a
 * projected path; otherwise the snippet and title are cleared and any unreadable metadata dropped.
 */
function projectWithoutMetadata(item: SearchResultItem, options: SearchResultProjectionOptions): SearchResultItem {
    if (options.TextAlreadyProjected) {
        return item.RawMetadata === undefined ? item : { ...item, RawMetadata: undefined };
    }
    const projected: SearchResultItem = { ...item, RawMetadata: undefined, Snippet: '' };
    clearTitle(projected);
    return projected;
}

/** Deletes the denied keys from `metadata` in place and returns their non-empty values as text. */
function removeDeniedKeys(metadata: Record<string, unknown>, denied: ReadonlySet<string>): string[] {
    const values: string[] = [];
    for (const key of Object.keys(metadata)) {
        if (!denied.has(key.toLowerCase())) {
            continue;
        }
        const value = metadata[key];
        delete metadata[key];
        if (value !== null && value !== undefined) {
            const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
            if (text.trim().length > 0) {
                values.push(text.trim().toLowerCase());
            }
        }
    }
    return values;
}

/**
 * Whether `text` was (or may have been) taken from one of the values: it contains one, or — for a
 * snippet cut down from a long value — one contains it, ignoring a trailing ellipsis.
 */
function containsAny(text: string | undefined, lowercasedValues: string[]): boolean {
    const haystack = (text ?? '').trim().toLowerCase();
    if (haystack.length === 0) {
        return false;
    }
    const excerpt = haystack.endsWith('...') ? haystack.slice(0, -3).trimEnd() : haystack;
    return lowercasedValues.some((value) => haystack.includes(value) || (excerpt.length > 0 && value.includes(excerpt)));
}

function clearTitle(item: SearchResultItem): void {
    const placeholder = `${item.EntityName} Record`;
    item.Title = placeholder;
    item.RecordName = placeholder;
}
