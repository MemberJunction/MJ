/**
 * @fileoverview The Feature Value key (FeatureValueKey minus EffectiveAsOf) and the pipeline pin (prompt
 * version, primary AI model, parameters, spec): their data shapes, and the normalisation and hashes that identify a
 * value, as static methods on {@link FeatureValueKey} and {@link FeaturePipelinePin}. No database access.
 * @module @memberjunction/feature-pipelines
 */

import { ComputeContentHashAsync, NormalizeUUID, OrdinalCompare } from '@memberjunction/global';
import { RecordIDs } from '@memberjunction/record-set-processor-base';
import type { MJAIPromptEntity, MJAIPromptModelEntity, MJFeatureValueEntity } from '@memberjunction/core-entities';
import type { DataFeatureSpec } from './data-feature-spec.js';

/** Who produced a Feature Value: the generated `MJ: Feature Values.Source` union. */
export type FeatureValueSource = MJFeatureValueEntity['Source'];

/**
 * The prompt settings that change what the model answers: the prompt's inference parameters, and the primary prompt
 * model's `ModelParameters` (its `EffortLevel`, when set, replaces the prompt's).
 */
export type FeaturePipelinePromptParameters =
    Pick<MJAIPromptEntity, 'Temperature' | 'TopP' | 'TopK' | 'MinP' | 'FrequencyPenalty' | 'PresencePenalty' | 'Seed' | 'ResponseFormat' | 'EffortLevel'>
    & Pick<MJAIPromptModelEntity, 'ModelParameters'>;

/** The fields of an `MJ: AI Prompt Models` row the pin reads. */
export type FeaturePipelinePromptModelRow = Pick<MJAIPromptModelEntity, 'ModelID' | 'Priority' | 'Status' | 'EffortLevel' | 'ModelParameters'>;

/** What makes two runs of a pipeline compute the same value: the FeatureVersionPin without the version number. */
export interface FeaturePipelinePinData {
    /** The `MJ: AI Prompts` ID the pipeline runs. */
    PromptID: string;
    /** The prompt version hash: template text, outputs, constraint block, pipeline type and escalation settings. */
    PromptVersionHash: string;
    /** The primary `MJ: AI Models` ID (highest-priority Active prompt model); null when the prompt has none. */
    AIModelID: string | null;
    /** SHA-256 of the prompt's inference parameters ({@link FeaturePipelinePin.ComputeParametersHash}). */
    ParametersHash: string;
    /** SHA-256 of the spec parts that change what is computed or written ({@link FeaturePipelinePin.ComputeSpecHash}). */
    SpecHash: string;
}

/** The Feature Value key (FeatureValueKey minus EffectiveAsOf): what identifies one stored value. */
export interface FeatureValueKeyInput {
    /** The `MJ: Entities` ID of the record's entity. */
    EntityID: string;
    /** The record's primary key: a UUID (normalised by case when hashed) or another key string, kept as given. */
    RecordID: string;
    /** The output (feature) name; hashed case-insensitively. */
    FeatureName: string;
    /** The `MJ: Feature Pipeline Versions.Version` that computed the value; null when unversioned. */
    PipelineVersion: number | null;
    /** The pin's prompt version hash; null for a value no prompt computed (a human value). */
    PromptVersionHash: string | null;
    /** The pin's primary AI model; null when the prompt has no Active model, or for a human value. */
    AIModelID: string | null;
    /** The pin's parameters hash; null for a human value. */
    ParametersHash: string | null;
    /** SHA-256 of the record's normalised inputs (the pipeline's cache key hash); null when there is none. */
    InputHash: string | null;
    /** Who produced the value. */
    Source: FeatureValueSource;
}

/** The pipeline pin's selection and hashes. Every method is static and takes plain data (pins are built as literals). */
export class FeaturePipelinePin {
    /**
     * The highest-priority Active prompt model, or null when the prompt has none. Ties are broken by the model ID,
     * compared normalised (lower-cased) and ordinally, so the choice depends neither on ID case nor on the runtime locale.
     */
    public static SelectPrimaryModel<T extends FeaturePipelinePromptModelRow>(models: ReadonlyArray<T>): T | null {
        const active = models.filter((m) => m.Status === 'Active');
        if (active.length === 0) {
            return null;
        }
        return [...active].sort((a, b) => b.Priority - a.Priority || OrdinalCompare(NormalizeUUID(a.ModelID), NormalizeUUID(b.ModelID)))[0];
    }

    /**
     * SHA-256 of the prompt parameters. `null` and `0` hash differently. The fields are copied one by one, so an entity
     * object (whose fields are accessors, not own properties) hashes the same as a plain object with the same values.
     */
    public static async ComputeParametersHash(p: FeaturePipelinePromptParameters): Promise<string> {
        return ComputeContentHashAsync({
            Temperature: p.Temperature, TopP: p.TopP, TopK: p.TopK, MinP: p.MinP,
            FrequencyPenalty: p.FrequencyPenalty, PresencePenalty: p.PresencePenalty, Seed: p.Seed,
            ResponseFormat: p.ResponseFormat, EffortLevel: p.EffortLevel, ModelParameters: p.ModelParameters,
        });
    }

    /**
     * SHA-256 of the spec parts that change what is computed or written, plus the OutputMapping text, plus, for a
     * Decision pipeline that escalates, its escalation target's pin hash: the target computes the escalated records'
     * answers, so a change to the target's prompt, model, parameters or spec is a new version of the Decision pipeline.
     * (The spec hash is in neither the Dedup Cache key nor the Feature Value key, so this changes neither.)
     * @param escalationTargetPinHash - the escalation target's {@link ComputeHash}; null for a pipeline that does not
     * escalate, or whose target cannot be resolved (every record that would escalate then fails).
     */
    public static async ComputeSpecHash(spec: DataFeatureSpec, outputMapping: string | null, escalationTargetPinHash: string | null): Promise<string> {
        // `??` keeps a spec part that is present but falsy (an empty Outputs list, a 0) distinct from an absent one
        return ComputeContentHashAsync({
            Context: spec.Context ?? null,
            Outputs: spec.Outputs ?? [],
            PipelineType: spec.PipelineType?.trim().toLowerCase() || null,
            Escalation: spec.Escalation ?? null,
            PromptID: spec.PromptID ? NormalizeUUID(spec.PromptID) : null,
            ProcessorExtensionKey: spec.ProcessorExtensionKey || null,
            OutputMapping: outputMapping || null,
            // only when present, so the spec hash of every pipeline that does not escalate stays what it was
            ...(escalationTargetPinHash ? { EscalationTargetPinHash: escalationTargetPinHash } : {}),
        });
    }

    /** SHA-256 identifying a pipeline version: the pin's prompt, prompt version, primary model, parameters and spec. */
    public static async ComputeHash(pin: FeaturePipelinePinData): Promise<string> {
        return ComputeContentHashAsync({
            PromptID: NormalizeUUID(pin.PromptID),
            PromptVersionHash: pin.PromptVersionHash,
            AIModelID: pin.AIModelID ? NormalizeUUID(pin.AIModelID) : null,
            ParametersHash: pin.ParametersHash,
            SpecHash: pin.SpecHash,
        });
    }
}

/** The Feature Value key's normalisation and hash. Every method is static and takes plain data. */
export class FeatureValueKey {
    /**
     * Normalises a text key input so the same value written differently maps to one key: Unicode NFC, trimmed, internal
     * whitespace collapsed to one space, lower-cased. Callers branch on the value's type; only text is normalised.
     */
    public static NormalizeValue(value: string): string {
        return value.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();
    }

    /** SHA-256 of a Feature Value key; stored as `ValueKeyHash`, unique per pipeline. */
    public static async ComputeHash(key: FeatureValueKeyInput): Promise<string> {
        return ComputeContentHashAsync({
            EntityID: NormalizeUUID(key.EntityID),
            RecordID: RecordIDs.Key(key.RecordID),
            FeatureName: key.FeatureName.toLowerCase(),
            PipelineVersion: key.PipelineVersion,
            PromptVersionHash: key.PromptVersionHash,
            AIModelID: key.AIModelID ? NormalizeUUID(key.AIModelID) : null,
            ParametersHash: key.ParametersHash,
            InputHash: key.InputHash,
            Source: key.Source,
        });
    }
}
