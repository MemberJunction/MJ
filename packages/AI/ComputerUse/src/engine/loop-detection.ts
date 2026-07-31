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
 * How many times one page state may recur before it counts as a loop trip, given
 * how many distinct things the goal asks for (`requestedParts` — checkpoints for a
 * tour, validation criteria otherwise).
 *
 * Revisiting a state is a STRUCTURAL consequence of a multi-part goal, not evidence
 * of being stuck. Tours are hub-and-spoke, so walking N sections returns to the hub
 * up to N times; and multi-criteria goals do it too — "clearing the filter RESTORES
 * the fuller list" asks the agent to return to an earlier state *as the pass
 * condition*. At the base threshold of 3 those goals trip the detector on their own
 * shape. Allowing one revisit per requested part plus the base tolerance makes the
 * step/time budgets the real backstop, which is what they are for.
 *
 * `requestedParts <= 0` (a single-goal run) keeps the base threshold unchanged.
 */
export function stateRepeatThresholdFor(baseThreshold: number, requestedParts: number): number {
    if (!Number.isFinite(requestedParts) || requestedParts <= 0) {
        return baseThreshold;
    }
    return baseThreshold + Math.floor(requestedParts);
}

/**
 * Detect a loop in the signature history (most recent last). Empty signatures
 * are ignored. Returns the strongest signal or null.
 *
 * - repeat-state: the most-recent signature has occurred ≥ `stateRepeatThreshold` times.
 * - cycle: the tail is a repeating block of period 2..4 that repeats ≥ twice.
 */
export function detectLoop(
    signatures: readonly string[],
    stateRepeatThreshold: number,
    cycleRepeatThreshold: number = 2
): LoopSignal | null {
    const sigs = signatures.filter(s => s !== '');
    if (sigs.length === 0) {
        return null;
    }

    // (a) repeat-state — same observable state revisited N times.
    const last = sigs[sigs.length - 1];
    const occurrences = sigs.filter(s => s === last).length;
    if (occurrences >= stateRepeatThreshold) {
        return {
            kind: 'repeat-state',
            count: occurrences,
            // Deliberately NOT reporting step numbers: the engine clears this history
            // when a checkpoint latches, so array positions stop matching real step
            // numbers after the first reset. Reporting them anyway put false step
            // numbers in the controller's prompt.
            detail: `the same page state has been reached ${occurrences} times since the last progress`,
        };
    }

    // (c) cycle — the tail is the same block of `period` states repeated
    // `cycleRepeatThreshold` times over.
    //
    // The repeat count is a threshold rather than a hardcoded 2 because ONE
    // repetition of an A→B→A→B block is the normal shape of a multi-section tour:
    // hub → section → hub → section. Tripping on that killed T038 at step 12 of a
    // 90-step budget, right after it had latched 2 of its 6 checkpoints.
    const repeats = Math.max(2, Math.floor(cycleRepeatThreshold));
    for (let period = 2; period <= 4; period++) {
        if (sigs.length < period * repeats) {
            continue;
        }
        const block = sigs.slice(-period);
        let allMatch = true;
        for (let r = 1; r < repeats && allMatch; r++) {
            const prior = sigs.slice(-period * (r + 1), -period * r);
            allMatch = block.every((s, i) => s === prior[i]);
        }
        if (allMatch) {
            return {
                kind: 'cycle',
                count: period,
                detail: `navigation is cycling through the same ${period} states repeatedly (${repeats}× over) with no progress`,
            };
        }
    }

    return null;
}
