/**
 * @fileoverview The labeled evidence a judge oracle sees for an agent run.
 * @module @memberjunction/testing-engine
 *
 * An agent's answer is not always in its final payload. A conversational agent may answer in its
 * `Message`, and an agent that builds something (a report, a component) may leave only a manifest in
 * its payload while the substance lives in the artifacts it produced. A judge that sees only the
 * payload then scores the manifest, not the work.
 *
 * This module turns those three sources into one bounded, clearly labeled evidence block. It is
 * pure: the driver loads the sources (see `drivers/agent-run-evidence.ts`) and the judge trace
 * renders the result (see `oracles/judge-trace.ts`).
 */

/** Size bounds for judge evidence, in characters. */
export interface JudgeEvidenceLimits {
    /** The most characters any single item (message, payload, one artifact) may contribute. */
    MaxCharsPerItem: number;
    /** The most characters all items together may contribute. Items past the budget are omitted. */
    MaxTotalChars: number;
}

/** Default bounds: a full component spec fits in one item; the whole block stays well inside a judge's context. */
export const DEFAULT_JUDGE_EVIDENCE_LIMITS: Readonly<JudgeEvidenceLimits> = Object.freeze({
    MaxCharsPerItem: 40_000,
    MaxTotalChars: 120_000,
});

/** One artifact the agent run produced, as loaded from the database (and possibly expanded). */
export interface JudgeArtifactSource {
    /** The artifact's name. */
    Name: string;
    /** The artifact type's name, e.g. `Component`, `Report`. */
    TypeName?: string;
    /** The artifact version number. */
    VersionNumber?: number;
    /** The version's content, as stored or as expanded. */
    Content: string;
    /** Where the content came from when it is not the stored version, e.g. `registry Skip`. */
    ExpandedFrom?: string;
    /** Why an expansion was attempted and failed; the stored content is used instead. */
    ExpansionError?: string;
}

/** The sources a judge's evidence is built from. */
export interface JudgeEvidenceSources {
    /** The agent run's `FinalPayload`, as stored (a JSON string) or already parsed. */
    FinalPayload?: string | Record<string, unknown> | null;
    /** The agent run's final `Message`. */
    Message?: string | null;
    /** The output artifacts the run produced. */
    Artifacts?: JudgeArtifactSource[];
}

/** One labeled, bounded item of evidence. */
export interface JudgeEvidenceItem {
    /** What the item is, e.g. `Agent final message`. */
    Label: string;
    /** The item's text, truncated with a marker when it exceeded its bound. */
    Text: string;
    /** True when `Text` was truncated or omitted. */
    Truncated: boolean;
}

/** The evidence a judge oracle evaluates instead of the bare payload. */
export interface JudgeOutputEvidence {
    /** The items, in the order the judge reads them: message, payload, artifacts. */
    Items: JudgeEvidenceItem[];
    /** True when any item was truncated or omitted. */
    Truncated: boolean;
}

/** The marker appended to a truncated item. */
export function TruncationMarker(shown: number, total: number): string {
    return `\n…[truncated: showing ${shown} of ${total} characters]`;
}

/**
 * Bounds a text to `maxChars` characters, appending a marker that says how much was cut.
 *
 * @param text - The text to bound
 * @param maxChars - The most characters of `text` to keep
 * @returns The text and whether it was truncated
 */
export function TruncateForJudge(text: string, maxChars: number): { Text: string; Truncated: boolean } {
    if (text.length <= maxChars) {
        return { Text: text, Truncated: false };
    }
    const shown = Math.max(0, maxChars);
    return { Text: text.slice(0, shown) + TruncationMarker(shown, text.length), Truncated: true };
}

/** The payload as readable JSON, or undefined when it is absent or an empty object. */
function payloadText(payload: JudgeEvidenceSources['FinalPayload']): string | undefined {
    if (payload == null) {
        return undefined;
    }
    if (typeof payload === 'string') {
        const trimmed = payload.trim();
        if (!trimmed || trimmed === '{}' || trimmed === 'null') {
            return undefined;
        }
        try {
            return JSON.stringify(JSON.parse(trimmed), null, 2);
        } catch {
            return trimmed;
        }
    }
    return Object.keys(payload).length > 0 ? JSON.stringify(payload, null, 2) : undefined;
}

/** The label for one artifact item. */
function artifactLabel(artifact: JudgeArtifactSource, index: number): string {
    const parts = [artifact.TypeName, artifact.VersionNumber != null ? `v${artifact.VersionNumber}` : undefined].filter(Boolean);
    let label = `Artifact ${index + 1}: "${artifact.Name}"`;
    if (parts.length) {
        label += ` (${parts.join(', ')})`;
    }
    if (artifact.ExpandedFrom) {
        label += ` — full content resolved from ${artifact.ExpandedFrom}`;
    } else if (artifact.ExpansionError) {
        label += ` — stored content (expansion failed: ${artifact.ExpansionError})`;
    }
    return label;
}

/**
 * Builds the labeled evidence a judge evaluates for one agent run.
 *
 * Returns `undefined` when the evidence would add nothing to the payload the judge already sees:
 * no artifacts, and at most one of payload and message. That keeps agents whose payload (or
 * message) is the whole answer judged exactly as before.
 *
 * @param sources - The run's payload, message and output artifacts
 * @param limits - Size bounds; defaults to {@link DEFAULT_JUDGE_EVIDENCE_LIMITS}
 * @returns The evidence, or undefined when the bare output already says everything
 */
export function BuildJudgeOutputEvidence(sources: JudgeEvidenceSources, limits?: Partial<JudgeEvidenceLimits>): JudgeOutputEvidence | undefined {
    const bounds: JudgeEvidenceLimits = {
        MaxCharsPerItem: limits?.MaxCharsPerItem ?? DEFAULT_JUDGE_EVIDENCE_LIMITS.MaxCharsPerItem,
        MaxTotalChars: limits?.MaxTotalChars ?? DEFAULT_JUDGE_EVIDENCE_LIMITS.MaxTotalChars,
    };
    const message = sources.Message?.trim() || undefined;
    const payload = payloadText(sources.FinalPayload);
    const artifacts = sources.Artifacts ?? [];

    if (artifacts.length === 0 && !(message && payload)) {
        return undefined;
    }

    const raw: { Label: string; Text: string }[] = [];
    if (message) {
        raw.push({ Label: 'Agent final message', Text: message });
    }
    if (payload) {
        raw.push({ Label: 'Agent final payload (JSON)', Text: payload });
    }
    artifacts.forEach((artifact, index) => raw.push({ Label: artifactLabel(artifact, index), Text: artifact.Content }));

    let remaining = bounds.MaxTotalChars;
    const items: JudgeEvidenceItem[] = raw.map(item => {
        if (remaining <= 0) {
            return { Label: item.Label, Text: `[omitted: evidence budget of ${bounds.MaxTotalChars} characters exhausted]`, Truncated: true };
        }
        const bounded = TruncateForJudge(item.Text, Math.min(bounds.MaxCharsPerItem, remaining));
        remaining -= Math.min(item.Text.length, bounds.MaxCharsPerItem, remaining);
        return { Label: item.Label, Text: bounded.Text, Truncated: bounded.Truncated };
    });

    return { Items: items, Truncated: items.some(item => item.Truncated) };
}

/**
 * Renders evidence as delimited, labeled sections for a judge prompt.
 *
 * @param evidence - The evidence to render
 * @returns One section per item, each headed `=== <label> ===`
 */
export function RenderJudgeEvidence(evidence: JudgeOutputEvidence): string {
    return evidence.Items.map(item => `=== ${item.Label} ===\n${item.Text}`).join('\n\n');
}
