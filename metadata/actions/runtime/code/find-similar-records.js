// Find Similar Records — md + rv + compute Runtime action.
//
// Given an entity, a text field on that entity, and a search string, scan
// up to `maxScan` records and return the top `maxResults` ranked by a
// similarity score in [0,1]. The similarity combines substring matching
// (exact/prefix/contains) and normalized Levenshtein distance so both
// "obvious typo" and "shares a long substring" cases rank well.
//
// Exercises `md.GetEntityFields` for input validation and `rv.RunView`
// for the scan. Pure compute does the ranking — no AI dependency, so this
// is cheap + deterministic and a good baseline for fuzzy lookup flows.

const _ = require('lodash');

const {
    entityName,
    searchField,
    searchText,
    threshold = 0.5,
    maxResults = 10,
    maxScan = 5000,
    extraFilter
} = input;

if (!entityName) return { success: false, error: 'entityName is required' };
if (!searchField) return { success: false, error: 'searchField is required' };
if (!searchText || typeof searchText !== 'string') {
    return { success: false, error: 'searchText is required and must be a string' };
}

// Step 1 — confirm the field exists and is text-like. If it isn't, bail
// out with a clear error rather than running a scan that will produce
// meaningless matches.
const fields = await utilities.md.GetEntityFields(entityName);
if (!Array.isArray(fields) || fields.length === 0) {
    return {
        success: false,
        error: `No fields returned for entity '${entityName}'. Check the entity exists and the runtime action has permission to access it.`
    };
}

const fieldInfo = fields.find(
    (f) => f.Name?.trim().toLowerCase() === searchField.trim().toLowerCase()
);
if (!fieldInfo) {
    return {
        success: false,
        error: `Field '${searchField}' does not exist on entity '${entityName}'. Available fields: ${fields.map((f) => f.Name).join(', ')}`
    };
}

// Loose check: allow any text-ish type. MJ types are inconsistent across
// providers (nvarchar, varchar, text, string, etc.) so we check for any
// mention of text/char/string.
const fieldType = String(fieldInfo.Type || '').toLowerCase();
const isTextual = /text|char|string/.test(fieldType);
if (!isTextual) {
    return {
        success: false,
        error: `Field '${searchField}' is of type '${fieldInfo.Type}' — similarity matching requires a text field.`
    };
}

// Step 2 — pull up to maxScan records. We only need the PK + the search
// field to do the scoring, but `Fields` is ignored when ResultType is
// 'entity_object'; our bridge forces ResultType='simple' so Fields will
// be honored by the provider.
const primaryKey = fields.find((f) => f.IsPrimaryKey)?.Name ?? 'ID';

const viewResult = await utilities.rv.RunView({
    EntityName: entityName,
    ExtraFilter: extraFilter,
    MaxRows: Number(maxScan) || 5000,
    Fields: [primaryKey, searchField]
});

if (!viewResult.Success) {
    return {
        success: false,
        error: `RunView failed: ${viewResult.ErrorMessage}`,
        entityName
    };
}

const rows = viewResult.Results || [];

// Step 3 — score each row. `similarity` combines:
//   - Substring containment (0.3 weight): 1.0 exact, 0.9 prefix, 0.8 contains
//   - Normalized Levenshtein distance (0.7 weight): 1 - (dist / max(len))
// Scores in [0,1]; values below `threshold` are filtered out.
const needle = searchText.trim().toLowerCase();
const scored = rows
    .map((row) => {
        const raw = row[searchField];
        if (raw == null) return null;
        const hay = String(raw).trim().toLowerCase();
        if (hay.length === 0) return null;

        let containmentScore = 0;
        if (hay === needle) containmentScore = 1.0;
        else if (hay.startsWith(needle)) containmentScore = 0.9;
        else if (hay.includes(needle)) containmentScore = 0.8;
        else if (needle.includes(hay)) containmentScore = 0.7;

        const lev = levenshtein(hay, needle);
        const maxLen = Math.max(hay.length, needle.length);
        const levScore = maxLen === 0 ? 1 : 1 - lev / maxLen;

        const similarity = 0.3 * containmentScore + 0.7 * levScore;
        return {
            id: row[primaryKey],
            value: row[searchField],
            similarity: Number(similarity.toFixed(4))
        };
    })
    .filter((r) => r !== null && r.similarity >= Number(threshold));

const matches = _.orderBy(scored, 'similarity', 'desc').slice(
    0,
    Number(maxResults) || 10
);

return {
    success: true,
    entityName,
    searchField,
    searchText,
    threshold: Number(threshold),
    rowsScanned: rows.length,
    totalRowCount: viewResult.TotalRowCount || rows.length,
    matchCount: matches.length,
    matches
};

// ---------------------------------------------------------------------------
// Levenshtein distance implementation
//
// Inline (no library) because the sandbox's default allowlist doesn't
// include a string-distance library and pulling one in would require the
// approver to review an additional dependency. This is ~20 lines, well-
// understood, and the sandbox's maxMemoryMB limit bounds worst-case cost
// even against adversarial inputs.
// ---------------------------------------------------------------------------
function levenshtein(a, b) {
    if (a === b) return 0;
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;

    // Two-row dynamic programming — O(min(a,b)) memory, O(a*b) time.
    // Ensure b is the shorter string so the row-length is minimal.
    if (a.length < b.length) {
        const t = a;
        a = b;
        b = t;
    }
    let prev = new Array(b.length + 1);
    let curr = new Array(b.length + 1);
    for (let j = 0; j <= b.length; j++) prev[j] = j;

    for (let i = 1; i <= a.length; i++) {
        curr[0] = i;
        for (let j = 1; j <= b.length; j++) {
            const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
            curr[j] = Math.min(
                curr[j - 1] + 1,       // insertion
                prev[j] + 1,           // deletion
                prev[j - 1] + cost     // substitution
            );
        }
        const swap = prev;
        prev = curr;
        curr = swap;
    }
    return prev[b.length];
}
