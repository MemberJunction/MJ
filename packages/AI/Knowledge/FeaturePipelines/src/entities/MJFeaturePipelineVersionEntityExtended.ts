/**
 * @fileoverview `MJ: Feature Pipeline Versions` with the activation save check: a gated version can be Active only with
 * a stored golden-set result at or above its threshold, on every save path.
 * @module @memberjunction/feature-pipelines
 */
import { BaseEntity } from '@memberjunction/core';
import { MJFeaturePipelineVersionEntity } from '@memberjunction/core-entities';
import { RegisterClass, ValidationErrorInfo, ValidationErrorType, type ValidationResult } from '@memberjunction/global';

/** The fields the activation check reads. */
export type VersionActivationFields = Pick<MJFeaturePipelineVersionEntity, 'Version' | 'Status' | 'Gated' | 'Threshold' | 'ResultValue' | 'GoldenSetTestRunID' | 'ResultDetails'>;

/** A required golden case the version answered wrong, and the outputs it got wrong. */
export interface RequiredCaseFailure {
    /** The golden case's ID. */
    CaseID: string;
    /** The outputs the case scored wrong. */
    Outputs: string[];
}

/** The part of a version's `ResultDetails` JSON this package reads (the golden-set driver writes it typed by this). */
export interface GoldenSetResultDetails {
    Score: {
        /** The required cases answered wrong, in case order; empty when every required case is right. */
        RequiredFailures: RequiredCaseFailure[];
    };
}

@RegisterClass(BaseEntity, 'MJ: Feature Pipeline Versions')
export class MJFeaturePipelineVersionEntityExtended extends MJFeaturePipelineVersionEntity {
    /** Whether a version has a stored golden-set result at or above its threshold (the save check and the run gate). */
    public static HasPassingResult(v: VersionActivationFields): boolean {
        return !!v.GoldenSetTestRunID && typeof v.ResultValue === 'number' && typeof v.Threshold === 'number' && v.ResultValue >= v.Threshold;
    }

    /** Why a version may not be saved as Active; empty when it may. Only gated, Active rows are constrained. */
    public static GetActivationProblems(v: VersionActivationFields): string[] {
        if (v.Status !== 'Active' || !v.Gated || MJFeaturePipelineVersionEntityExtended.HasPassingResult(v)) {
            return [];
        }
        if (!v.GoldenSetTestRunID || typeof v.ResultValue !== 'number' || typeof v.Threshold !== 'number') {
            return [`Version ${v.Version} cannot be activated without a stored golden-set result.`];
        }
        return [`Version ${v.Version} cannot be activated: ${MJFeaturePipelineVersionEntityExtended.DescribeShortfall(v, v.ResultValue.toFixed(4))}.`];
    }

    /**
     * Why a stored golden-set result does not pass: the required cases answered wrong when there are any, else the
     * result against the threshold.
     * @param resultText the result value as the message shows it
     */
    public static DescribeShortfall(v: Pick<MJFeaturePipelineVersionEntity, 'Threshold' | 'ResultDetails'>, resultText: string): string {
        const failures = MJFeaturePipelineVersionEntityExtended.RequiredFailuresOf(v);
        if (failures.length > 0) {
            return `its golden set has ${MJFeaturePipelineVersionEntityExtended.FormatRequiredFailures(failures)}`;
        }
        return `its golden-set result ${resultText} is below the threshold ${v.Threshold}`;
    }

    /** The wrong required cases as one phrase, e.g. `1 required case(s) wrong: h1 (SeniorityLevel)`. */
    public static FormatRequiredFailures(failures: RequiredCaseFailure[]): string {
        return `${failures.length} required case(s) wrong: ${failures.map((f) => `${f.CaseID} (${f.Outputs.join(', ')})`).join('; ')}`;
    }

    /** The required cases a version's stored golden-set result answered wrong; empty when the details carry none. */
    public static RequiredFailuresOf(v: Pick<MJFeaturePipelineVersionEntity, 'ResultDetails'>): RequiredCaseFailure[] {
        const score = MJFeaturePipelineVersionEntityExtended.ParseDetails(v.ResultDetails)?.Score;
        const failures = score && typeof score === 'object' ? score.RequiredFailures : undefined;
        return Array.isArray(failures) ? failures.filter((f) => MJFeaturePipelineVersionEntityExtended.IsRequiredCaseFailure(f)) : [];
    }

    /** The stored details JSON as an object; null when absent or not a JSON object. */
    protected static ParseDetails(details: string | null): Partial<GoldenSetResultDetails> | null {
        if (!details) {
            return null;
        }
        try {
            // unknown: stored JSON (any writer, any era) is narrowed below before it is read as the typed shape
            const parsed: unknown = JSON.parse(details);
            return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? parsed as Partial<GoldenSetResultDetails> : null;
        } catch (e) {
            if (e instanceof SyntaxError) {
                return null;
            }
            throw e;
        }
    }

    /** Whether a stored list entry is a well-formed {@link RequiredCaseFailure}. */
    protected static IsRequiredCaseFailure(f: RequiredCaseFailure): boolean {
        return typeof f === 'object' && f !== null && typeof f.CaseID === 'string' && Array.isArray(f.Outputs)
            && f.Outputs.every((o) => typeof o === 'string');
    }

    /** The generated checks, plus the activation check reported on `Status`. */
    public override Validate(): ValidationResult {
        const result = super.Validate();
        for (const problem of MJFeaturePipelineVersionEntityExtended.GetActivationProblems(this)) {
            result.Success = false;
            result.Errors.push(new ValidationErrorInfo('Status', problem, this.Status, ValidationErrorType.Failure));
        }
        return result;
    }
}
