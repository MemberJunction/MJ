/**
 * @fileoverview `MJ: Feature Pipeline Versions` with the activation save check: a gated version can be Active only with
 * a stored golden-set result at or above its threshold. Runs on both tiers before a save, so no save path (the version
 * registry, the record form, the API, metadata sync) can activate a version the golden set has not passed.
 * @module @memberjunction/feature-pipelines
 */
import { BaseEntity } from '@memberjunction/core';
import { MJFeaturePipelineVersionEntity } from '@memberjunction/core-entities';
import { RegisterClass, ValidationErrorInfo, ValidationErrorType, type ValidationResult } from '@memberjunction/global';

/** The fields the activation check reads. */
export type VersionActivationFields = Pick<MJFeaturePipelineVersionEntity, 'Version' | 'Status' | 'Gated' | 'Threshold' | 'ResultValue' | 'GoldenSetTestRunID'>;

@RegisterClass(BaseEntity, 'MJ: Feature Pipeline Versions')
export class MJFeaturePipelineVersionEntityExtended extends MJFeaturePipelineVersionEntity {
    /**
     * Whether a version has a stored golden-set result at or above its threshold. The one predicate behind the save
     * check, the run gate (`FeaturePipelineVersionService.ResolveForRun`) and `RecordGoldenSetResult`.
     */
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
        return [`Version ${v.Version} cannot be activated: its golden-set result ${v.ResultValue.toFixed(4)} is below the threshold ${v.Threshold}.`];
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
