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
    tag: string;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
    /** Resolved formal Tag ID if the server already linked it, else null. */
    resolvedTagId: string | null;  // case-violation-ok-legacy-back-compat: renaming it broke a use the checker could not see from the declaration — the compile proved it
    /** ContentItemTag.Weight (0..1). */
    weight: number;  // case-violation-ok-legacy-back-compat: renaming it broke a use the checker could not see from the declaration — the compile proved it
}

/** The effective source config that governs routing. */
export interface DryRunConfig {
    Mode: 'constrained' | 'auto-grow' | 'free-flow';
    /** Score at/above which an auto-apply happens (0..1). */
    MatchThreshold: number;
    /** Lower band: at/above this but below matchThreshold → route to inbox. */
    SuggestThreshold: number;
}

/** Which resolution tier a tag landed in. */
export type ResolveTier = 'synonym' | 'exact' | 'fuzzy' | 'none';

/** Result of resolving a free-text tag against the cached taxonomy. */
export interface ResolveResult {
    TagId: string | null;
    TagName: string | null;
    /** 1.0 for synonym/exact, ~0.8 for fuzzy, null for none. */
    Score: number | null;
    Tier: ResolveTier;
}

/** A previewed disposition row, ready to render. */
export interface DryRunRow {
    Tag: string;
    MatchedTag: string | null;
    Score: number | null;
    Disposition: Disposition;
    Reason: string;
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
    if (r.Tier === 'synonym' || r.Tier === 'exact' || (r.Score != null && r.Score >= cfg.MatchThreshold)) {
        return {
            Tag: input.tag,
            MatchedTag: r.TagName,
            Score: r.Score,
            Disposition: 'auto-apply',
            Reason: r.Tier === 'synonym' ? 'synonym match' : 'exact/synonym match',
        };
    }

    // Tier 2 — fuzzy/near match inside the suggest band → human-in-the-loop.
    if (r.Score != null && r.Score >= cfg.SuggestThreshold && r.Score < cfg.MatchThreshold) {
        return {
            Tag: input.tag,
            MatchedTag: r.TagName,
            Score: r.Score,
            Disposition: 'route-to-inbox',
            Reason: 'below match threshold',
        };
    }

    // Tier 3 — no usable match → governed by taxonomy mode.
    if (cfg.Mode === 'constrained') {
        return {
            Tag: input.tag,
            MatchedTag: null,
            Score: r.Score,
            Disposition: 'route-to-inbox',
            Reason: 'constrained: novel tag → review',
        };
    }

    // auto-grow | free-flow
    return {
        Tag: input.tag,
        MatchedTag: null,
        Score: r.Score,
        Disposition: 'create-new',
        Reason: cfg.Mode === 'auto-grow' ? 'auto-grow: would create tag' : 'free-flow: would create tag',
    };
}

/**
 * Preview the disposition of a batch of existing extracted tags under a config.
 * Pure and deterministic — given the same inputs + resolve function it always
 * returns the same rows in the same order.
 */
export function PreviewDispositions(
    input: DryRunInput[],
    cfg: DryRunConfig,
    resolve: (tag: string) => ResolveResult,
): DryRunRow[] {
    return input.map(row => disposeRow(row, cfg, resolve(row.tag)));
}

/** @deprecated Use {@link PreviewDispositions}. */
export function previewDispositions(
    input: DryRunInput[],
    cfg: DryRunConfig,
    resolve: (tag: string) => ResolveResult,
): DryRunRow[] {
    return PreviewDispositions(input, cfg, resolve);
}
