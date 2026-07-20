/**
 * Pure loop detection (CU-B1).
 *
 * The agent is "looping" when it keeps returning to the same observable state
 * without progress. Detection runs every step and is free — it operates on a
 * list of per-step *state signatures*, each = normalized URL + the step's
 * perceptual hash (dHash, CU-F6). The dHash makes this robust to animated
 * spinners that defeat byte-identical screenshot comparison — an app's loading
 * screen no longer masquerades as "the page changed".
 *
 * This module is pure so the detection + URL-normalization logic can be
 * unit-tested and replayed offline against recorded runs. The engine owns the
 * effectful parts (capturing signatures, escalating, terminating).
 */

/** A detected loop and the evidence for it (prompt/classifier-facing). */
export interface LoopSignal {
    /** 'repeat-state' = same signature seen ≥ threshold times; 'cycle' = a repeating A→B→A→B sequence. */
    kind: 'repeat-state' | 'cycle';
    /** How many times the repeated state occurred (repeat-state) or the cycle period (cycle). */
    count: number;
    /** Human/prompt-facing evidence sentence. */
    detail: string;
}

/**
 * Normalize a URL for loop comparison: drop the hash fragment and any
 * app-declared volatile query params, keep everything else. Two visits to the
 * "same page" then produce equal strings even if a per-visit token differs.
 * Never throws — a non-URL string is returned trimmed.
 */
export function normalizeUrlForLoop(url: string, volatileParams: readonly string[] = []): string {
    if (!url) {
        return '';
    }
    try {
        const u = new URL(url);
        u.hash = '';
        for (const p of volatileParams) {
            u.searchParams.delete(p);
        }
        // Sort remaining params so ?a=1&b=2 and ?b=2&a=1 compare equal.
        u.searchParams.sort();
        return u.toString();
    } catch {
        return url.trim();
    }
}

/**
 * Build a state signature from a step's post-action URL and perceptual hash.
 * Returns '' when there's no hash (couldn't perceive) so the caller can skip
 * loop scoring for that step rather than treat blanks as a repeated state.
 */
export function computeStateSignature(
    urlAfter: string,
    screenshotHash: string,
    volatileParams: readonly string[] = []
): string {
    if (!screenshotHash) {
        return '';
    }
    return `${normalizeUrlForLoop(urlAfter, volatileParams)}|${screenshotHash}`;
}

/**
 * Detect a loop in the signature history (most recent last). Empty signatures
 * are ignored. Returns the strongest signal or null.
 *
 * - repeat-state: the most-recent signature has occurred ≥ `stateRepeatThreshold` times.
 * - cycle: the tail is a repeating block of period 2..4 that repeats ≥ twice.
 */
export function detectLoop(signatures: readonly string[], stateRepeatThreshold: number): LoopSignal | null {
    const sigs = signatures.filter(s => s !== '');
    if (sigs.length === 0) {
        return null;
    }

    // (a) repeat-state — same observable state revisited N times.
    const last = sigs[sigs.length - 1];
    const occurrences: number[] = [];
    signatures.forEach((s, i) => { if (s === last) occurrences.push(i + 1); });
    if (occurrences.length >= stateRepeatThreshold) {
        return {
            kind: 'repeat-state',
            count: occurrences.length,
            detail: `the same page state has been reached ${occurrences.length} times (steps ${occurrences.join(', ')}) with no progress`,
        };
    }

    // (c) cycle — the tail is [block][block] for some period 2..4.
    for (let period = 2; period <= 4; period++) {
        if (sigs.length >= period * 2) {
            const tail = sigs.slice(-period);
            const prev = sigs.slice(-period * 2, -period);
            if (tail.every((s, i) => s === prev[i])) {
                return {
                    kind: 'cycle',
                    count: period,
                    detail: `navigation is cycling through the same ${period} states repeatedly with no progress`,
                };
            }
        }
    }

    return null;
}
