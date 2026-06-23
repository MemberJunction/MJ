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
    DuplicateReasoningFieldChoice
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
                provenance: input.SourceRecord.Provenance,
                dependentCount: input.SourceRecord.DependentCount
            },
            candidates: input.Candidates.map(c => ({
                recordId: c.RecordID,
                label: c.Label,
                vectorScore: c.VectorScore,
                provenance: c.Provenance,
                dependentCount: c.DependentCount
            })),
            fieldDeltas: input.FieldDeltas.map(f => ({
                fieldName: f.FieldName,
                values: f.Values.map(v => ({ recordId: v.RecordID, value: v.Value }))
            }))
        };
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
        return {
            Success: true,
            Recommendation: this.normalizeRecommendation(obj['recommendation']),
            Confidence: this.normalizeConfidence(obj['confidence']),
            Reasoning: typeof obj['reasoning'] === 'string' ? obj['reasoning'] : '',
            SurvivorRecordID: this.normalizeSurvivor(obj['survivorRecordId']),
            FieldChoices: this.normalizeFieldChoices(obj['fieldChoices'])
        };
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

    /** Clamps confidence into [0,1], defaulting to 0 when absent/invalid. */
    protected normalizeConfidence(value: unknown): number {
        const n = typeof value === 'number' ? value : Number(value);
        if (!Number.isFinite(n)) {
            return 0;
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
            Confidence: 0,
            Reasoning: '',
            SurvivorRecordID: null,
            FieldChoices: []
        };
    }
}
