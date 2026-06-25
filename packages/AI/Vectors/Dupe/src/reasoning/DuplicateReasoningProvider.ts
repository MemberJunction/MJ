/**
 * @fileoverview The pluggable reasoning seam for intelligent duplicate detection.
 *
 * `DuplicateReasoningProvider` is an abstract base resolved via `@RegisterClass`. The
 * {@link DuplicateRecordDetector} selects an implementation per Entity Document via
 * `ReasoningMode` ('Prompt' | 'Agent') and calls {@link DuplicateReasoningProvider.Reason}
 * once per source record's matched set. Both shipped implementations
 * (`PromptReasoningProvider`, and `AgentReasoningProvider` in `@memberjunction/ai-agents`)
 * consume the same {@link DuplicateReasoningInput} and emit the same
 * {@link DuplicateReasoningOutput}; only the runtime (single-shot prompt vs. orchestrated
 * agent) differs.
 *
 * @module @memberjunction/ai-vector-dupe
 */

import { LogError } from '@memberjunction/core';
import {
    DuplicateReasoningInput,
    DuplicateReasoningOutput,
    DuplicateReasoningContext,
    DuplicateReasoningRecommendation,
    DuplicateReasoningFieldChoice,
    DuplicateReasoningCandidateVerdict
} from './DuplicateReasoningTypes';

/** Class-factory key for the default single-shot prompt provider. */
export const PROMPT_REASONING_PROVIDER_KEY = 'Prompt';
/** Class-factory key for the agent provider (registered in @memberjunction/ai-agents). */
export const AGENT_REASONING_PROVIDER_KEY = 'Agent';

/**
 * Abstract reasoning provider. Subclasses implement {@link Reason} for their runtime.
 *
 * Register a subclass with `@RegisterClass(DuplicateReasoningProvider, '<Mode>')` where
 * `<Mode>` matches the Entity Document's `ReasoningMode`. When no registration matches a
 * mode, `MJGlobal.ClassFactory.CreateInstance` falls back to the base class — so callers
 * should treat a base-class instance (whose {@link Reason} throws) as "no provider for
 * this mode" and skip reasoning gracefully.
 */
export abstract class DuplicateReasoningProvider {
    /**
     * Reason over one source record's matched set and return a single structured verdict.
     *
     * Implementations MUST NOT throw for ordinary reasoning failures — return an output
     * with `Success: false` and an `ErrorMessage` instead, so one bad set never aborts a run.
     *
     * @param input the assembled matched-set context (entity, source, candidates, deltas)
     * @param context the request-scoped provider + context user
     */
    public abstract Reason(
        input: DuplicateReasoningInput,
        context: DuplicateReasoningContext
    ): Promise<DuplicateReasoningOutput>;

    /**
     * Builds the Nunjucks/template data context for the shared "Duplicate Resolution"
     * instruction set. Both providers feed the prompt the exact same shape, so this lives
     * on the base class. Keys match the seeded template's variable names verbatim.
     */
    protected buildPromptData(input: DuplicateReasoningInput): Record<string, unknown> {
        return {
            entityName: input.EntityName,
            entityDescription: input.EntityDescription ?? '',
            sourceRecord: {
                recordId: input.SourceRecord.RecordID,
                label: input.SourceRecord.Label,
                provenance: input.SourceRecord.Provenance
            },
            candidateCount: input.Candidates.length,
            candidates: input.Candidates.map(c => ({
                recordId: c.RecordID,
                label: c.Label,
                vectorScore: c.VectorScore,
                provenance: c.Provenance
            })),
            fieldDeltaCount: input.FieldDeltas.length,
            fieldDeltas: input.FieldDeltas.map(f => ({
                fieldName: f.FieldName,
                // Normalize empties at the data layer so the prompt can render `value` directly:
                // null / '' / whitespace-only all become the '(empty)' sentinel. This keeps the
                // template null-safe regardless of how it references the value (no literal "null").
                values: f.Values.map(v => ({ recordId: v.RecordID, value: this.displayValue(v.Value) }))
            }))
        };
    }

    /** Render a field value for the prompt: the trimmed value, or '(empty)' for null/blank. */
    protected displayValue(value: string | null): string {
        if (value == null || value.trim().length === 0) {
            return '(empty)';
        }
        return value;
    }

    /**
     * Parses a provider's raw structured output (the `{recommendation, confidence, ...}`
     * object) into a normalized {@link DuplicateReasoningOutput}. Tolerant of either an
     * already-parsed object or a JSON string. Returns a failed output on any parse error.
     */
    protected parseRawOutput(raw: unknown): DuplicateReasoningOutput {
        const obj = this.coerceToObject(raw);
        if (!obj) {
            return this.failedOutput('Reasoning output was not valid JSON');
        }
        const candidateVerdicts = this.normalizeCandidateVerdicts(obj['candidateVerdicts']);
        // Overall is derived from the per-candidate verdicts (the authoritative row-level result).
        // Fall back to top-level fields only if the reasoner returned no per-candidate verdicts
        // (older/degenerate output) so we never lose a verdict entirely.
        const overall = candidateVerdicts.length > 0
            ? this.deriveOverall(candidateVerdicts)
            : {
                Recommendation: this.normalizeRecommendation(obj['recommendation']),
                Confidence: this.normalizeConfidence(obj['confidence'])
            };
        return {
            Success: true,
            Recommendation: overall.Recommendation,
            Confidence: overall.Confidence,
            Reasoning: typeof obj['reasoning'] === 'string' ? obj['reasoning'] : '',
            SurvivorRecordID: this.normalizeSurvivor(obj['survivorRecordId']),
            FieldChoices: this.normalizeFieldChoices(obj['fieldChoices']),
            CandidateVerdicts: candidateVerdicts
        };
    }

    /**
     * Normalize the per-candidate verdicts array, dropping malformed entries. Each must carry a
     * non-empty record id; recommendation/confidence are clamped, reasoning defaults to ''.
     */
    protected normalizeCandidateVerdicts(value: unknown): DuplicateReasoningCandidateVerdict[] {
        if (!Array.isArray(value)) {
            return [];
        }
        const out: DuplicateReasoningCandidateVerdict[] = [];
        for (const entry of value) {
            if (entry && typeof entry === 'object') {
                const rec = entry as Record<string, unknown>;
                const recordId = rec['recordId'];
                if (typeof recordId === 'string' && recordId.trim().length > 0) {
                    out.push({
                        RecordID: recordId.trim(),
                        Recommendation: this.normalizeRecommendation(rec['recommendation']),
                        Confidence: this.normalizeConfidence(rec['confidence']),
                        Reasoning: typeof rec['reasoning'] === 'string' ? rec['reasoning'] : ''
                    });
                }
            }
        }
        return out;
    }

    /**
     * Derive the set-level verdict from the per-candidate verdicts: Merge if any candidate is a
     * Merge, else Uncertain if any is Uncertain, else NotDuplicate. Overall confidence is the max
     * confidence among the candidates matching the winning recommendation (null if none reported).
     */
    protected deriveOverall(verdicts: DuplicateReasoningCandidateVerdict[]): { Recommendation: DuplicateReasoningRecommendation; Confidence: number | null } {
        const recommendation: DuplicateReasoningRecommendation =
            verdicts.some(v => v.Recommendation === 'Merge') ? 'Merge'
            : verdicts.some(v => v.Recommendation === 'Uncertain') ? 'Uncertain'
            : 'NotDuplicate';
        const confidences = verdicts
            .filter(v => v.Recommendation === recommendation && v.Confidence != null)
            .map(v => v.Confidence as number);
        const confidence = confidences.length > 0 ? Math.max(...confidences) : null;
        return { Recommendation: recommendation, Confidence: confidence };
    }

    /** Coerces a JSON string or object into a plain record, else null. */
    protected coerceToObject(raw: unknown): Record<string, unknown> | null {
        if (raw && typeof raw === 'object') {
            return raw as Record<string, unknown>;
        }
        if (typeof raw === 'string') {
            try {
                const parsed: unknown = JSON.parse(raw);
                return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
            } catch {
                return null;
            }
        }
        return null;
    }

    /** Clamps the recommendation to the allowed union, defaulting to 'Uncertain'. */
    protected normalizeRecommendation(value: unknown): DuplicateReasoningRecommendation {
        if (value === 'Merge' || value === 'NotDuplicate' || value === 'Uncertain') {
            return value;
        }
        return 'Uncertain';
    }

    /**
     * Clamps confidence into [0,1], returning `null` when absent/invalid. `null` (not 0) so a
     * missing confidence isn't mistaken for "confidently NOT a duplicate" downstream.
     */
    protected normalizeConfidence(value: unknown): number | null {
        if (value == null || value === '') {
            return null;
        }
        const n = typeof value === 'number' ? value : Number(value);
        if (!Number.isFinite(n)) {
            return null;
        }
        return Math.min(1, Math.max(0, n));
    }

    /** Returns the survivor id string, or null when absent/empty. */
    protected normalizeSurvivor(value: unknown): string | null {
        if (typeof value === 'string' && value.trim().length > 0) {
            return value.trim();
        }
        return null;
    }

    /** Normalizes the fieldChoices array, dropping malformed entries. */
    protected normalizeFieldChoices(value: unknown): DuplicateReasoningFieldChoice[] {
        if (!Array.isArray(value)) {
            return [];
        }
        const out: DuplicateReasoningFieldChoice[] = [];
        for (const entry of value) {
            if (entry && typeof entry === 'object') {
                const rec = entry as Record<string, unknown>;
                const fieldName = rec['fieldName'];
                const sourceRecordId = rec['sourceRecordId'];
                if (typeof fieldName === 'string' && typeof sourceRecordId === 'string') {
                    out.push({ FieldName: fieldName, SourceRecordID: sourceRecordId });
                }
            }
        }
        return out;
    }

    /** Builds a failed reasoning output (logged, never thrown). */
    protected failedOutput(message: string): DuplicateReasoningOutput {
        LogError(`DuplicateReasoningProvider: ${message}`);
        return {
            Success: false,
            ErrorMessage: message,
            Recommendation: 'Uncertain',
            Confidence: null,
            Reasoning: '',
            SurvivorRecordID: null,
            FieldChoices: [],
            CandidateVerdicts: []
        };
    }
}
