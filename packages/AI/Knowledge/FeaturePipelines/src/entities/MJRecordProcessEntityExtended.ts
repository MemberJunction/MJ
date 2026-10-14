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
 * therefore covers every save path: the record form, the API, and metadata sync. On the server, the save
 * also checks that an LLM pipeline's prompt template renders its output constraints
 * ({@link RecordProcessPromptTemplateCheck}).
 * @module @memberjunction/feature-pipelines
 */

import { BaseEntity, ProviderType, type IEntityDataProvider, type IMetadataProvider } from '@memberjunction/core';
import { EscapeSQLString, RegisterClass, SafeJSONParse, ValidationErrorInfo, ValidationErrorType, type ValidationResult } from '@memberjunction/global';
import { MJRecordProcessEntity, type MJAIPromptEntity } from '@memberjunction/core-entities';
import { LinkedTemplateText } from '@memberjunction/ai-core-plus';
import { ConstraintPromptTemplate, ValidateSpec, type DataFeatureSpec } from '../spec/data-feature-spec.js';
import {
  BuildEntityFieldValueLookup,
  GetFeaturePipelineCapabilities,
  ValidateOutputsAgainstCapabilities,
  type FeaturePipelineFieldValueLookup,
} from '../spec/feature-pipeline-driver-capabilities.js';

/** The fields of a Record Process row that decide whether its spec is checked, and what the spec is. */
export type RecordProcessSpecFields = Pick<MJRecordProcessEntity, 'WorkType' | 'Status' | 'Configuration'>;

/**
 * The spec a Record Process row's save checks read: undefined when the row carries none to check (not Infer,
 * `Disabled`, or no `Configuration`); null when its `Configuration` is not a JSON object.
 */
function checkedSpecOf(row: RecordProcessSpecFields): DataFeatureSpec | null | undefined {
  if (row.WorkType !== 'Infer' || row.Status === 'Disabled') {
    return undefined;
  }
  const configuration = row.Configuration?.trim();
  if (!configuration) {
    return undefined;
  }
  const spec = SafeJSONParse<DataFeatureSpec>(configuration);
  return spec && typeof spec === 'object' && !Array.isArray(spec) ? spec : null;
}

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
  const spec = checkedSpecOf(row);
  if (spec === undefined) {
    return [];
  }
  if (spec === null) {
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
 * `ValidateAsync()` adds the prompt-template check on the server.
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

  /**
   * The base async validation, plus, on the server, {@link RecordProcessPromptTemplateCheck}: a constrained LLM
   * pipeline whose prompt template does not render the constraint block is refused at save, as its run would be.
   * Async because the prompt and its template are read through the record's provider.
   */
  public override async ValidateAsync(): Promise<ValidationResult> {
    const result = await super.ValidateAsync();
    const problem = await RecordProcessPromptTemplateCheck.FindProblem(this);
    if (problem) {
      result.Success = false;
      result.Errors.push(new ValidationErrorInfo('PromptID', problem, this.PromptID, ValidationErrorType.Failure));
    }
    return result;
  }
}

/** The AI Prompt fields the save-time template check reads. */
type CheckedPromptRow = Pick<MJAIPromptEntity, 'ID' | 'Name' | 'TemplateID'>;

/**
 * The server-side save check that a Record Process row's prompt template renders its output constraints
 * ({@link ConstraintPromptTemplate.DescribeMissingBlock}, the same check `InferProcessor.Preflight` runs).
 *
 * The prompt, and the text its template renders, are read through the record's own provider, not the AI or template
 * engine caches. A save inside a transaction then sees rows written earlier in that transaction: `mj sync push` saves a
 * prompt's edited template and then the pipeline that depends on it in one transaction, and the engines reload only
 * after it commits. A prompt or template that cannot be read refuses the save, naming what is missing.
 *
 * Server only: a browser save is checked again by the server, where the read is on the server's connection.
 */
export class RecordProcessPromptTemplateCheck {
  /** Why the row's prompt template cannot run with its spec; null when it can or there is nothing to check. */
  public static async FindProblem(record: MJRecordProcessEntity): Promise<string | null> {
    if (LinkedTemplateText.ProviderOf(record)?.ProviderType !== ProviderType.Database || !record.PromptID) {
      return null;
    }
    const spec = checkedSpecOf(record);
    if (!spec || !ConstraintPromptTemplate.RequiresConstraintBlock(spec)) {
      return null;
    }
    const prompt = await RecordProcessPromptTemplateCheck.ReadPrompt(record, record.PromptID);
    if (typeof prompt === 'string') {
      return prompt;
    }
    const templateText = prompt.TemplateID ? await RecordProcessPromptTemplateCheck.ReadTemplateText(record, prompt.TemplateID) : undefined;
    if (templateText instanceof Error) {
      return `The template of Feature Pipeline prompt '${prompt.Name}' could not be read to check that it renders the output constraints: ${templateText.message}`;
    }
    if (templateText === undefined) {
      return (
        `Feature Pipeline prompt '${prompt.Name}' has no template content, so it cannot render its output constraints. ` +
        `Give the prompt a template that renders {{ ConstraintBlock }}, or remove the constraints from the pipeline's outputs.`
      );
    }
    return ConstraintPromptTemplate.DescribeMissingBlock(spec, prompt.Name, templateText);
  }

  /** The pipeline's prompt row, read through the record's provider; a message naming the prompt when it cannot be read. */
  protected static async ReadPrompt(record: MJRecordProcessEntity, promptID: string): Promise<CheckedPromptRow | string> {
    const result = await record.RunViewProviderToUse.RunView<CheckedPromptRow>({
      EntityName: 'MJ: AI Prompts',
      ExtraFilter: `ID='${EscapeSQLString(promptID)}'`,
      Fields: ['ID', 'Name', 'TemplateID'],
    }, record.ContextCurrentUser);
    if (!result.Success) {
      return `AI Prompt '${promptID}' could not be read to check that its template renders the output constraints: ${result.ErrorMessage}`;
    }
    return result.Results[0] || `AI Prompt '${promptID}' was not found, so its template cannot render the pipeline's output constraints.`;
  }

  /**
   * The text the prompt's template renders, through the record's provider ({@link LinkedTemplateText.ReadRenderedText});
   * undefined when the template has no content, the read's error when its content cannot be read (the save is refused
   * with it rather than thrown out of validation).
   */
  protected static async ReadTemplateText(record: MJRecordProcessEntity, templateID: string): Promise<string | undefined | Error> {
    try {
      return await LinkedTemplateText.ReadRenderedText(record, templateID);
    } catch (e) {
      // a non-Error throw carries no message worth showing; `String(e)` would print "undefined"
      return e instanceof Error ? e : new Error('the read failed without an error');
    }
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
