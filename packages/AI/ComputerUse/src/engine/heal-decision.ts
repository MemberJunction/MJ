/**
 * Re-resolves a drifted replay target and gates the result on confidence. The
 * cheapest heal needs no LLM: an element that moved but kept its accessible role +
 * name is re-found deterministically in a fresh element list. A low-confidence
 * heal fails the step rather than guessing — a wrong cached click is worse than a
 * slow one. Ambiguous cases escalate to a focused LLM call via an engine seam.
 *
 * App-agnostic: operates only on the generic InteractiveElement + TraceTarget.
 */

import { InteractiveElement } from '../types/browser.js';
import { TraceTarget } from '../types/trace.js';

/** Confidence at/above which a heal is accepted (mabl's gate). */
export const DEFAULT_HEAL_CONFIDENCE_THRESHOLD = 0.6;

export interface HealResolution {
    /** The re-resolved selector, when a confident match exists. */
    selector?: string;
    /** The matched element, when one was found. */
    element?: InteractiveElement;
    /** Confidence 0..1 in the re-resolution. */
    confidence: number;
    /** Human-readable explanation for the run log / drift report. */
    reason: string;
}

/**
 * Deterministically re-resolve a recorded target against a fresh element list by
 * accessible role + name. Confidence tiers:
 *  - 0.9  — a UNIQUE exact role+name match (the common "element moved" drift).
 *  - 0.6  — a UNIQUE name-substring match (label lightly reworded).
 *  - 0.3  — MULTIPLE role+name matches (ambiguous; the LLM seam must disambiguate).
 *  - 0    — nothing plausible, or the recorded target had no role/name.
 */
export function reresolveTarget(target: TraceTarget, elements: InteractiveElement[]): HealResolution {
    const role = target.Role?.trim().toLowerCase();
    const name = target.Name?.trim().toLowerCase();
    if (!role && !name) {
        return { confidence: 0, reason: 'recorded target has no role/name to re-resolve' };
    }

    const exact = elements.filter(e =>
        (!role || (e.Role ?? '').trim().toLowerCase() === role) &&
        (!name || (e.Name ?? '').trim().toLowerCase() === name)
    );
    if (exact.length === 1) {
        return { selector: exact[0].Selector, element: exact[0], confidence: 0.9, reason: 'unique role+name match' };
    }
    if (exact.length > 1) {
        return { confidence: 0.3, reason: `${exact.length} elements match role+name — ambiguous` };
    }

    // No exact match — try a unique name-substring match (label drift).
    if (name) {
        const loose = elements.filter(e => (e.Name ?? '').trim().toLowerCase().includes(name));
        if (loose.length === 1) {
            return { selector: loose[0].Selector, element: loose[0], confidence: 0.6, reason: 'unique name-substring match' };
        }
    }
    return { confidence: 0, reason: 'no element matches the recorded role+name' };
}

/** Whether a re-resolution's confidence clears the acceptance gate. */
export function shouldAcceptHeal(confidence: number, threshold: number = DEFAULT_HEAL_CONFIDENCE_THRESHOLD): boolean {
    return confidence >= threshold;
}

/** A divergence caused by flow drift (not selector drift) is out of scope for
 *  selector re-resolution and must escalate to full re-derivation (LLM tier). */
export function isSelectorHealable(divergenceReason: string): boolean {
    return !divergenceReason.startsWith('postcondition');
}
