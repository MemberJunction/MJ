// Deterministic delta merge for C5 DeltaRefinement.
// P2 emits { add: string | null, reason: string }.
// Merge appends `add` to the current description with light punctuation cleanup.
// This is the I2 invariant operationalised: descriptions only grow, never rewrite.

/**
 * Merge a delta into an existing description.
 *
 * @param {string} current     - existing description
 * @param {{ add: string | null, reason?: string }} delta
 * @returns {{ description: string, changed: boolean, reason: string }}
 */
export function mergeDelta(current, delta) {
    const cur = (current || '').trim();
    if (!delta || !delta.add || typeof delta.add !== 'string' || delta.add.trim() === '' || delta.add.toLowerCase() === 'null') {
        return { description: cur, changed: false, reason: delta?.reason || 'no material addition' };
    }

    let addition = delta.add.trim();
    // Enforce size cap (I1 × I2): additions are ≤ 25 words
    const words = addition.split(/\s+/);
    if (words.length > 25) {
        addition = words.slice(0, 25).join(' ');
        // If we cut mid-sentence, add a period
        if (!/[.!?]$/.test(addition)) addition += '.';
    }

    // Light punctuation cleanup: ensure previous ends with . and addition starts capitalized
    let prefix = cur;
    if (prefix && !/[.!?]$/.test(prefix)) prefix += '.';

    if (!/^[A-Z]/.test(addition)) {
        addition = addition.charAt(0).toUpperCase() + addition.slice(1);
    }
    if (!/[.!?]$/.test(addition)) addition += '.';

    const merged = prefix ? `${prefix} ${addition}` : addition;
    return { description: merged, changed: true, reason: delta.reason || 'descendant-aware addition' };
}

/**
 * Test-only: check a candidate delta doesn't contain obviously-fabricated entities.
 * Returns entities in the delta that are NOT in the known-entities set.
 *
 * @param {string} deltaText
 * @param {Set<string>} knownEntities - lowercase entity names allowed
 * @returns {string[]} suspicious tokens (empty = safe)
 */
export function detectHallucination(deltaText, knownEntities) {
    if (!deltaText) return [];
    // Extract capitalized words likely to be entity/table names
    const caps = deltaText.match(/\b[A-Z][a-zA-Z]+/g) || [];
    const lower = new Set([...knownEntities].map(e => e.toLowerCase()));
    const common = new Set(['the', 'this', 'a', 'an', 'it', 'its', 'that', 'these', 'those', 'and', 'or']);
    return caps.filter(w => {
        const l = w.toLowerCase();
        if (common.has(l)) return false;
        return !lower.has(l);
    });
}
