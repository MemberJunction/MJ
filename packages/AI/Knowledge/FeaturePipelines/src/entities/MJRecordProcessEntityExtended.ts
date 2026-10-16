/**
 * @fileoverview `MJ: Record Processes`, shared by client and server. An Infer pipeline's
 * DataFeatureSpec is checked when the row is saved, with the rules the processor applies before it
 * runs: `ValidateSpec`, then what the pipeline type can produce
 * ({@link ValidateOutputsAgainstCapabilities}). A spec the pipeline type cannot run is refused at save,
 * not discovered record by record at run time.
 *
 * It lives here, not in `@memberjunction/core-entities`, because the rules live here and this package
 * already depends on that one. The class registers on both tiers: in the browser through the Angular
 * class manifests, and on the server as the parent of `MJRecordProcessEntityServer`. The save check
 * therefore covers every save path: the record form, the API, and metadata sync.
 * @module @memberjunction/feature-pipelines
 */

import { BaseEntity, type IEntityDataProvider, type IMetadataProvider } from '@memberjunction/core';
import { RegisterClass, SafeJSONParse, ValidationErrorInfo, ValidationErrorType, type ValidationResult } from '@memberjunction/global';
import { MJRecordProcessEntity } from '@memberjunction/core-entities';
import { ValidateSpec, type DataFeatureSpec } from '../spec/data-feature-spec.js';
import {
  BuildEntityFieldValueLookup,
  GetFeaturePipelineCapabilities,
  ValidateOutputsAgainstCapabilities,
  type FeaturePipelineFieldValueLookup,
} from '../spec/feature-pipeline-driver-capabilities.js';

/** The fields of a Record Process row that decide whether its spec is checked, and what the spec is. */
export type RecordProcessSpecFields = Pick<MJRecordProcessEntity, 'WorkType' | 'Status' | 'Configuration'>;

/**
 * Why a Record Process row's Feature Pipeline spec cannot run, as one message per problem; empty when it
 * can, or when there is nothing to check.
 *
 * Only an Infer row with a non-empty `Configuration` carries a spec. A `Disabled` row is not checked:
 * it does not run, and a pipeline whose spec broke must still be able to be turned off. Turning it back
 * on is a save, and checks it again.
 *
 * The checks are the processor's, in its order: the Configuration must parse as a spec object,
 * `ValidateSpec` must report no errors, and the spec's pipeline type must be able to produce every
 * output. `fieldValues` is the pipeline entity's value lists, for enums that take their values from a
 * field.
 * Pure and browser-safe.
 */
export function GetRecordProcessSpecProblems(
  row: RecordProcessSpecFields,
  fieldValues?: FeaturePipelineFieldValueLookup
): string[] {
  if (row.WorkType !== 'Infer' || row.Status === 'Disabled') {
    return [];
  }
  const configuration = row.Configuration?.trim();
  if (!configuration) {
    return [];
  }
  const spec = SafeJSONParse<DataFeatureSpec>(configuration);
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) {
    return ['Configuration is not a DataFeatureSpec: it must be a JSON object.'];
  }

  try {
    const problems = ValidateSpec(spec)
      .filter((issue) => issue.Severity === 'error')
      .map((issue) => issue.Message);
    if (!Array.isArray(spec.Outputs)) {
      // ValidateSpec has reported the missing Outputs; there is nothing to check against the type
      return problems;
    }
    const typeName = typeof spec.PipelineType === 'string' ? spec.PipelineType : undefined;
    problems.push(...ValidateOutputsAgainstCapabilities(spec, GetFeaturePipelineCapabilities(typeName), fieldValues));
    return Array.from(new Set(problems));
  } catch (e) {
    // A spec shaped badly enough to break the checks (an output that is not an object, say) cannot run either
    return [`Configuration is not a valid DataFeatureSpec: ${e instanceof Error ? e.message : String(e)}`];
  }
}

/**
 * `MJ: Record Processes` with the Feature Pipeline save check. `Validate()` runs on both tiers before a
 * save, so a spec the pipeline type cannot run is refused in the browser and again on the server.
 */
@RegisterClass(BaseEntity, 'MJ: Record Processes')
export class MJRecordProcessEntityExtended extends MJRecordProcessEntity {
  /** The base validation, plus {@link GetRecordProcessSpecProblems} for an Infer pipeline's spec. */
  public override Validate(): ValidationResult {
    const result = super.Validate();
    for (const problem of GetRecordProcessSpecProblems(this, pipelineEntityFieldValues(this))) {
      result.Success = false;
      result.Errors.push(new ValidationErrorInfo('Configuration', problem, this.Configuration, ValidationErrorType.Failure));
    }
    return result;
  }
}

/**
 * The value lists of the pipeline's own entity (`EntityID`), read through the record's provider.
 * A module-level function rather than a member, so the subclass stays structurally identical to
 * `MJRecordProcessEntity` and the two remain assignable to each other.
 */
function pipelineEntityFieldValues(record: MJRecordProcessEntity): FeaturePipelineFieldValueLookup | undefined {
  const provider = record.ProviderToUse;
  if (!record.EntityID || !resolvesEntities(provider)) {
    return undefined;
  }
  return BuildEntityFieldValueLookup(provider.EntityByID(record.EntityID));
}

/** Whether the record's data provider also resolves entity metadata by ID, as every MJ provider does. */
function resolvesEntities(
  provider: IEntityDataProvider | null | undefined
): provider is IEntityDataProvider & Pick<IMetadataProvider, 'EntityByID'> {
  return !!provider && 'EntityByID' in provider && typeof provider.EntityByID === 'function';
}
