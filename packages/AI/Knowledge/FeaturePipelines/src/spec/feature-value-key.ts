/**
 * @fileoverview The Feature Value key and the pipeline pin (prompt version, primary AI model, parameters, spec): their
 * data shapes, normalisation and hashes. No database access.
 * @module @memberjunction/feature-pipelines
 */

import { ComputeContentHashAsync, NormalizeUUID, OrdinalCompare } from '@memberjunction/global';
import { RecordIDs } from '@memberjunction/record-set-processor-base';
import type { MJAIPromptEntity, MJAIPromptModelEntity, MJFeatureValueEntity } from '@memberjunction/core-entities';
import type { DataFeatureSpec } from './data-feature-spec.js';

/** Who produced a Feature Value: the generated `MJ: Feature Values.Source` union. */
export type FeatureValueSource = MJFeatureValueEntity['Source'];

/** The prompt settings that change what the model answers: inference parameters and the primary model's `ModelParameters`. */
export type FeaturePipelinePromptParameters =
    Pick<MJAIPromptEntity, 'Temperature' | 'TopP' | 'TopK' | 'MinP' | 'FrequencyPenalty' | 'PresencePenalty' | 'Seed' | 'ResponseFormat' | 'EffortLevel'>
    & Pick<MJAIPromptModelEntity, 'ModelParameters'>;

/** The fields of an `MJ: AI Prompt Models` row the pin reads. */
export type FeaturePipelinePromptModelRow = Pick<MJAIPromptModelEntity, 'ModelID' | 'Priority' | 'Status' | 'EffortLevel' | 'ModelParameters'>;

/** What makes two runs of a pipeline compute the same value: the FeatureVersionPin without the version number. */
export interface FeaturePipelinePinData {
    PromptID: string;
    PromptVersionHash: string;
    AIModelID: string | null;
    ParametersHash: string;
    SpecHash: string;
}

/** The Feature Value key (FeatureValueKey minus EffectiveAsOf): what identifies one stored value. */
export interface FeatureValueKeyInput {
    EntityID: string;
    RecordID: string;
    FeatureName: string;
    PipelineVersion: number | null;
    PromptVersionHash: string | null;
    AIModelID: string | null;
    ParametersHash: string | null;
    InputHash: string | null;
    Source: FeatureValueSource;
}

/** The pipeline pin's selection and hashes. Every method is static and takes plain data (pins are built as literals). */
export class FeaturePipelinePin {
    /** The highest-priority Active prompt model (ties broken by normalised model ID), or null when the prompt has none. */
    public static SelectPrimaryModel<T extends FeaturePipelinePromptModelRow>(models: ReadonlyArray<T>): T | null {
        const active = models.filter((m) => m.Status === 'Active');
        if (active.length === 0) {
            return null;
        }
        return [...active].sort((a, b) => b.Priority - a.Priority || OrdinalCompare(NormalizeUUID(a.ModelID), NormalizeUUID(b.ModelID)))[0];
    }

    /** SHA-256 of the prompt parameters (copied field by field, so an entity object hashes like a plain one). */
    public static async ComputeParametersHash(p: FeaturePipelinePromptParameters): Promise<string> {
        return ComputeContentHashAsync({
            Temperature: p.Temperature, TopP: p.TopP, TopK: p.TopK, MinP: p.MinP,
            FrequencyPenalty: p.FrequencyPenalty, PresencePenalty: p.PresencePenalty, Seed: p.Seed,
            ResponseFormat: p.ResponseFormat, EffortLevel: p.EffortLevel, ModelParameters: p.ModelParameters,
        });
    }

    /**
     * SHA-256 of the spec parts that change what is computed or written, the OutputMapping text, and an escalating
     * Decision pipeline's target pin hash (the target computes the escalated answers).
     * @param escalationTargetPinHash - the target's {@link ComputeHash}; null when the pipeline does not escalate
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
    /** Normalises a text key input: Unicode NFC, trimmed, internal whitespace collapsed, lower-cased. */
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
