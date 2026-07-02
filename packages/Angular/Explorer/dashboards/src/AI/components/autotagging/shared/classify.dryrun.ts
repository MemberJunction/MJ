/**
 * @fileoverview Classify · pure dry-run disposition helper.
 *
 * Honest, in-memory PREVIEW of how a source's EXISTING extracted ContentItemTags
 * would be dispositioned under its current taxonomy mode + thresholds. This is
 * NOT a fresh LLM run — it replays the deterministic, post-resolution routing
 * portion of the server's autotagger so operators can see the effect of mode +
 * thresholds before committing a real run.
 *
 * This module is intentionally framework-free (no Angular, no DI) so it can be
 * unit-tested in isolation. The Angular dialog builds the `resolve` closure from
 * cached taxonomy metadata (Tags / TagSynonyms) and feeds rows in here.
 *
 * NOTE: the server also has a semantic/embedding match tier that is NOT
 * reproducible client-side. Borderline rows ('none' here) may resolve
 * differently in a real run; the UI labels this clearly.
 */

/** Terminal outcome the server's tiered router would reach for a single tag. */
export type Disposition = 'auto-apply' | 'route-to-inbox' | 'create-new' | 'reject';

/** A single existing ContentItemTag being previewed. */
export interface DryRunInput {
    /** Free-text tag as extracted by the LLM. */
    tag: string;
    /** Resolved formal Tag ID if the server already linked it, else null. */
    resolvedTagId: string | null;
    /** ContentItemTag.Weight (0..1). */
    weight: number;
}

/** The effective source config that governs routing. */
export interface DryRunConfig {
    mode: 'constrained' | 'auto-grow' | 'free-flow';
    /** Score at/above which an auto-apply happens (0..1). */
    matchThreshold: number;
    /** Lower band: at/above this but below matchThreshold → route to inbox. */
    suggestThreshold: number;
}

/** Which resolution tier a tag landed in. */
export type ResolveTier = 'synonym' | 'exact' | 'fuzzy' | 'none';

/** Result of resolving a free-text tag against the cached taxonomy. */
export interface ResolveResult {
    tagId: string | null;
    tagName: string | null;
    /** 1.0 for synonym/exact, ~0.8 for fuzzy, null for none. */
    score: number | null;
    tier: ResolveTier;
}

/** A previewed disposition row, ready to render. */
export interface DryRunRow {
    tag: string;
    matchedTag: string | null;
    score: number | null;
    disposition: Disposition;
    reason: string;
}

/**
 * Resolve a single input row to its disposition under the given config.
 *
 * Routing mirrors the server's tiered model (deterministic portion only):
 * 1. synonym/exact tier (or score ≥ matchThreshold) → auto-apply.
 * 2. fuzzy/near with suggestThreshold ≤ score < matchThreshold → route-to-inbox.
 * 3. no match (tier 'none') → governed by taxonomy mode:
 *    - constrained → route-to-inbox (novel tag goes to human review; we route to
 *      inbox rather than 'reject' so the operator can promote/discard it — this
 *      matches the server enqueuing a Tag Suggestion instead of silently dropping).
 *    - auto-grow / free-flow → create-new (would create the tag).
 */
function disposeRow(input: DryRunInput, cfg: DryRunConfig, r: ResolveResult): DryRunRow {
    // Tier 1 — exact/synonym match (or a numeric score that clears the match bar).
    if (r.tier === 'synonym' || r.tier === 'exact' || (r.score != null && r.score >= cfg.matchThreshold)) {
        return {
            tag: input.tag,
            matchedTag: r.tagName,
            score: r.score,
            disposition: 'auto-apply',
            reason: r.tier === 'synonym' ? 'synonym match' : 'exact/synonym match',
        };
    }

    // Tier 2 — fuzzy/near match inside the suggest band → human-in-the-loop.
    if (r.score != null && r.score >= cfg.suggestThreshold && r.score < cfg.matchThreshold) {
        return {
            tag: input.tag,
            matchedTag: r.tagName,
            score: r.score,
            disposition: 'route-to-inbox',
            reason: 'below match threshold',
        };
    }

    // Tier 3 — no usable match → governed by taxonomy mode.
    if (cfg.mode === 'constrained') {
        return {
            tag: input.tag,
            matchedTag: null,
            score: r.score,
            disposition: 'route-to-inbox',
            reason: 'constrained: novel tag → review',
        };
    }

    // auto-grow | free-flow
    return {
        tag: input.tag,
        matchedTag: null,
        score: r.score,
        disposition: 'create-new',
        reason: cfg.mode === 'auto-grow' ? 'auto-grow: would create tag' : 'free-flow: would create tag',
    };
}

/**
 * Preview the disposition of a batch of existing extracted tags under a config.
 * Pure and deterministic — given the same inputs + resolve function it always
 * returns the same rows in the same order.
 */
export function previewDispositions(
    input: DryRunInput[],
    cfg: DryRunConfig,
    resolve: (tag: string) => ResolveResult,
): DryRunRow[] {
    return input.map(row => disposeRow(row, cfg, resolve(row.tag)));
}
