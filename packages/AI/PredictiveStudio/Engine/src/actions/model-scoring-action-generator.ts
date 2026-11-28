/**
 * @module actions/model-scoring-action-generator
 *
 * **Per-model scoring Action generator** (plan PS2-2). When a Predictive Studio
 * model is promoted to a usable status (`Published`), this service generates an
 * idempotent child Action — `Score with <Model> v<n>` — so every published model
 * becomes a first-class, discoverable Action (ActionSmith / CodeSmith pick it up
 * for free) without any per-model code or AI codegen.
 *
 * ## Composition, not inheritance (CLAUDE.md: Actions)
 * The generated row is a *child* of the canonical **Score Record Set** parent: it
 * carries the parent's `ParentID` (metadata link only) and reuses the SAME
 * `DriverClass` (`PredictiveStudioScoreRecordSetAction`). That class already reads
 * the `ModelID` / `Scope` / `WriteBack` params, so the child needs no new
 * implementation. The only thing that makes it model-specific is its `ModelID`
 * input param's `DefaultValue`, which is pre-set to the model's id — ActionEngine
 * seeds each param from its `DefaultValue` before invoke, so omitting `ModelID`
 * scores with this model.
 *
 * ## Idempotency
 * The Action is found by its `ModelID` input param — the generated child of the Score Record Set parent whose `ModelID`
 * defaults to the model's id — never by its Name: the Name carries the pipeline's name, which can change after the
 * model is published. Found-or-created that way, its Name, fields and child params are rewritten on every run so they
 * stay exactly in sync with the model and the parent's contract.
 *
 * All saves are checked and failures are logged. The lifecycle gate calls this only after a transition commits
 * (`LifecycleGate.SyncScoringAction`), so a failure here never rolls a publish back.
 */

import { RunView, LogError, LogStatus, type UserInfo, type IMetadataProvider } from '@memberjunction/core';
import { EscapeSQLString, UUIDsEqual } from '@memberjunction/global';
import type {
  MJMLModelEntity,
  MJActionEntity,
  MJActionParamEntity,
  MJActionCategoryEntity,
} from '@memberjunction/core-entities';

import { SCORE_RECORD_SET_DRIVER_CLASS } from './driver-classes';

/** Name of the find-or-create Action Category that holds per-model scoring actions. */
const MODELS_CATEGORY_NAME = 'Predictive Studio Models';

/** The canonical parent Action's Name (the metadata "Score Record Set" row). */
const PARENT_ACTION_NAME = 'Score Record Set';

/** Font Awesome icon for generated scoring actions (matches the parent). */
const SCORING_ICON_CLASS = 'fa-solid fa-gauge-high';

/** The input param whose `DefaultValue` names the model a generated Action scores with. */
const MODEL_ID_PARAM_NAME = 'ModelID';

/** Shape of a single Action Param to (re)create. Mirrors the parent's contract. */
interface ParamSpec {
  Name: string;
  Type: MJActionParamEntity['Type'];
  ValueType: MJActionParamEntity['ValueType'];
  IsRequired: boolean;
  Description: string;
  /** Pre-seeded default the ActionEngine applies before invoke (only ModelID uses it). */
  DefaultValue?: string;
}

/**
 * The optional binding and as-of inputs and the scoring run's outputs, the same names the parent Score Record Set
 * action writes (the `ScoringResult` union's fields).
 */
const SCORING_RUN_PARAM_SPECS: readonly ParamSpec[] = [
  { Name: 'BindingID', Type: 'Input', ValueType: 'Scalar', IsRequired: false, Description: 'Optional. The scoring binding to score through: its Feature Values (and column copy) are written. This model must be the one the binding pipeline serves (its Published model), else the call is refused INVALID_INPUT. Without it, the predictions are returned and nothing is written.' },
  { Name: 'AsOfDate', Type: 'Input', ValueType: 'Scalar', IsRequired: false, Description: 'Optional. The date the scope is scored as of (ISO); the run date when omitted.' },
  { Name: 'ScoringRunID', Type: 'Output', ValueType: 'Scalar', IsRequired: false, Description: 'The MJ: ML Scoring Runs row of the call (also on a refused or failed run).' },
  { Name: 'Status', Type: 'Output', ValueType: 'Scalar', IsRequired: false, Description: 'The scoring run\'s status: completed, refused or failed.' },
  { Name: 'Total', Type: 'Output', ValueType: 'Scalar', IsRequired: false, Description: 'Records in the scope.' },
  { Name: 'Written', Type: 'Output', ValueType: 'Scalar', IsRequired: false, Description: 'Feature Values written (0 without a binding).' },
  { Name: 'Failed', Type: 'Output', ValueType: 'Scalar', IsRequired: false, Description: 'Records that failed (a failed run).' },
  { Name: 'Predictions', Type: 'Output', ValueType: 'Scalar', IsRequired: false, Description: 'JSON array of predictions ({recordId, score, class, adverseProbability, inTraining}), present when nothing was written.' },
];

/**
 * Generates (and disables) the per-model "Score with <Model> v<n>" child Action.
 * Stateless + idempotent — safe to call on every promotion.
 */
export class ModelScoringActionGenerator {
  /**
   * Find-or-create the per-model scoring Action for `model` (found by its `ModelID` param) and reconcile its name and
   * params. Logs and returns on a failure it can name (the parent action is missing, a save fails); a failed read
   * throws, and the lifecycle gate logs it after the transition it followed has committed.
   */
  public async GenerateForModel(
    model: MJMLModelEntity,
    contextUser: UserInfo,
    provider: IMetadataProvider,
  ): Promise<void> {
    const parent = await this.findScoreRecordSetParentAction(provider, contextUser);
    if (!parent) {
      LogError(
        `ModelScoringActionGenerator: parent action '${PARENT_ACTION_NAME}' (DriverClass ` +
          `'${SCORE_RECORD_SET_DRIVER_CLASS}') not found — cannot generate a scoring action for model ` +
          `'${model.ID}'. Skipping.`,
      );
      return;
    }

    const categoryID = await this.ensureModelsActionCategory(provider, contextUser);
    const action = await this.upsertScoringAction(model, parent, categoryID, provider, contextUser);
    if (!action) {
      return; // upsert already logged the failure
    }

    await this.recreateParams(action.ID, model, provider, contextUser);
    LogStatus(`ModelScoringActionGenerator: ensured scoring action '${action.Name}' for model '${model.ID}'.`);
  }

  /**
   * Disable the generated scoring Action for `model` (when it leaves `Published`) by flipping its Status to `Disabled`.
   * The Action is found by its `ModelID` param, so a pipeline renamed since the publish still finds it.
   *
   * @returns true when the model has no enabled generated Action afterwards (none exists, it was already disabled, or
   *   this call disabled it); false when the save was refused (logged with the save's message, the Action left enabled)
   * @throws Error when a read fails ({@link FindActionForModel})
   */
  public async DisableForModel(
    model: MJMLModelEntity,
    contextUser: UserInfo,
    provider: IMetadataProvider,
  ): Promise<boolean> {
    const existing = await this.FindActionForModel(model.ID, provider, contextUser);
    if (!existing || existing.Status === 'Disabled') {
      return true;
    }
    existing.Status = 'Disabled';
    if (!(await existing.Save())) {
      LogError(
        `ModelScoringActionGenerator: failed to disable action '${existing.Name}': ` +
          `${existing.LatestResult?.CompleteMessage || 'unknown error'}`,
      );
      return false;
    }
    LogStatus(`ModelScoringActionGenerator: disabled scoring action '${existing.Name}' for archived model '${model.ID}'.`);
    return true;
  }

  /**
   * The generated scoring Action of `modelId`: the child Action whose `ModelID` input param defaults to the model's id
   * and which runs the scoring driver; null when there is none.
   *
   * @throws Error when a read fails (a failed read is not "no Action": generating would then create a duplicate)
   */
  public async FindActionForModel(modelId: string, provider: IMetadataProvider, contextUser: UserInfo): Promise<MJActionEntity | null> {
    const rv = RunView.FromMetadataProvider(provider);
    const params = await rv.RunView<Pick<MJActionParamEntity, 'ActionID' | 'DefaultValue'>>(
      {
        EntityName: 'MJ: Action Params',
        ExtraFilter: `Name='${MODEL_ID_PARAM_NAME}' AND Type='Input' AND DefaultValue='${EscapeSQLString(modelId)}'`,
        Fields: ['ActionID', 'DefaultValue'],
        ResultType: 'simple',
      },
      contextUser,
    );
    if (!params.Success) throw new Error(`ModelScoringActionGenerator: reading the ModelID params of model '${modelId}' failed: ${params.ErrorMessage || 'unknown error'}`);
    for (const param of params.Results.filter((p) => UUIDsEqual(p.DefaultValue, modelId))) {
      const action = await this.findGeneratedAction(param.ActionID, provider, contextUser);
      if (action !== null) return action;
    }
    return null;
  }

  /** The Action `actionId` when it is a generated scoring child (the scoring driver, under a parent); else null. */
  private async findGeneratedAction(actionId: string, provider: IMetadataProvider, contextUser: UserInfo): Promise<MJActionEntity | null> {
    const result = await RunView.FromMetadataProvider(provider).RunView<MJActionEntity>(
      {
        EntityName: 'MJ: Actions',
        ExtraFilter: `ID='${EscapeSQLString(actionId)}' AND DriverClass='${EscapeSQLString(SCORE_RECORD_SET_DRIVER_CLASS)}' AND ParentID IS NOT NULL`,
        MaxRows: 1,
        SkipTotalRowCount: true,
        ResultType: 'entity_object',
      },
      contextUser,
    );
    if (!result.Success) throw new Error(`ModelScoringActionGenerator: reading Action '${actionId}' failed: ${result.ErrorMessage || 'unknown error'}`);
    return result.Results[0] || null;
  }

  // ----- category ------------------------------------------------------------

  /**
   * Find-or-create the `MJ: Action Categories` row that groups all per-model
   * scoring actions. Idempotent (find by Name first). Returns its ID, or null if
   * the category couldn't be created (logged).
   */
  protected async ensureModelsActionCategory(
    provider: IMetadataProvider,
    contextUser: UserInfo,
  ): Promise<string | null> {
    const rv = RunView.FromMetadataProvider(provider);
    const existing = await rv.RunView<MJActionCategoryEntity>(
      {
        EntityName: 'MJ: Action Categories',
        ExtraFilter: `Name='${EscapeSQLString(MODELS_CATEGORY_NAME)}'`,
        MaxRows: 1,
        SkipTotalRowCount: true,
        ResultType: 'entity_object',
      },
      contextUser,
    );
    if (existing.Success && existing.Results.length > 0) {
      return existing.Results[0].ID;
    }

    const cat = await provider.GetEntityObject<MJActionCategoryEntity>('MJ: Action Categories', contextUser);
    cat.NewRecord();
    cat.Name = MODELS_CATEGORY_NAME;
    cat.Description =
      'Per-model scoring actions auto-generated when a Predictive Studio model is published.';
    cat.Status = 'Active';
    if (!(await cat.Save())) {
      LogError(
        `ModelScoringActionGenerator: failed to create category '${MODELS_CATEGORY_NAME}': ` +
          `${cat.LatestResult?.CompleteMessage || 'unknown error'}`,
      );
      return null;
    }
    return cat.ID;
  }

  // ----- parent lookup -------------------------------------------------------

  /**
   * Load the canonical parent **Score Record Set** Action — the top-level row
   * (ParentID null) whose DriverClass is the scoring driver. Returns null (caller
   * logs + bails) when it's missing.
   */
  protected async findScoreRecordSetParentAction(
    provider: IMetadataProvider,
    contextUser: UserInfo,
  ): Promise<MJActionEntity | null> {
    const rv = RunView.FromMetadataProvider(provider);
    const result = await rv.RunView<MJActionEntity>(
      {
        EntityName: 'MJ: Actions',
        ExtraFilter:
          `Name='${EscapeSQLString(PARENT_ACTION_NAME)}' AND ` +
          `DriverClass='${EscapeSQLString(SCORE_RECORD_SET_DRIVER_CLASS)}' AND ParentID IS NULL`,
        MaxRows: 1,
        SkipTotalRowCount: true,
        ResultType: 'entity_object',
      },
      contextUser,
    );
    return result.Success && result.Results.length > 0 ? result.Results[0] : null;
  }

  // ----- action upsert (idempotent) -----------------------------------------

  /**
   * Find-or-create the per-model scoring Action (found by its `ModelID` param) and apply its fields, its Name included.
   * The child reuses the parent's DriverClass (composition) and links via ParentID. Returns the saved row, or null on
   * save failure (logged).
   */
  protected async upsertScoringAction(
    model: MJMLModelEntity,
    parent: MJActionEntity,
    categoryID: string | null,
    provider: IMetadataProvider,
    contextUser: UserInfo,
  ): Promise<MJActionEntity | null> {
    const existing = await this.FindActionForModel(model.ID, provider, contextUser);
    const name = await this.uniqueScoringActionName(model, parent.ID, categoryID, existing, provider, contextUser);
    const action = existing || (await provider.GetEntityObject<MJActionEntity>('MJ: Actions', contextUser));
    if (!existing) {
      action.NewRecord();
    }

    action.Name = name;
    action.Description = this.scoringActionDescription(model);
    action.Type = 'Custom';
    action.DriverClass = SCORE_RECORD_SET_DRIVER_CLASS;
    action.ParentID = parent.ID;
    if (categoryID) {
      action.CategoryID = categoryID;
    }
    action.Status = 'Active';
    action.IconClass = SCORING_ICON_CLASS;

    if (!(await action.Save())) {
      LogError(
        `ModelScoringActionGenerator: failed to save scoring action '${name}': ` +
          `${action.LatestResult?.CompleteMessage || 'unknown error'}`,
      );
      return null;
    }
    return action;
  }

  // ----- param recreation ----------------------------------------------------

  /**
   * Delete the action's existing params and recreate the canonical scoring
   * param set (matching the parent's contract). The `ModelID` input is pre-set to
   * this model's id via `DefaultValue` so omitting it scores with this model.
   */
  protected async recreateParams(
    actionID: string,
    model: MJMLModelEntity,
    provider: IMetadataProvider,
    contextUser: UserInfo,
  ): Promise<void> {
    await this.deleteExistingParams(actionID, provider, contextUser);

    for (const spec of this.buildParamSpecs(model)) {
      const param = await provider.GetEntityObject<MJActionParamEntity>('MJ: Action Params', contextUser);
      param.NewRecord();
      param.ActionID = actionID;
      param.Name = spec.Name;
      param.Type = spec.Type;
      param.ValueType = spec.ValueType;
      param.IsArray = false;
      param.IsRequired = spec.IsRequired;
      param.Description = spec.Description;
      if (spec.DefaultValue !== undefined) {
        param.DefaultValue = spec.DefaultValue;
      }
      if (!(await param.Save())) {
        LogError(
          `ModelScoringActionGenerator: failed to save param '${spec.Name}' for action ${actionID}: ` +
            `${param.LatestResult?.CompleteMessage || 'unknown error'}`,
        );
      }
    }
  }

  /** Load + delete all `MJ: Action Params` rows for the given action. */
  protected async deleteExistingParams(
    actionID: string,
    provider: IMetadataProvider,
    contextUser: UserInfo,
  ): Promise<void> {
    const rv = RunView.FromMetadataProvider(provider);
    const result = await rv.RunView<MJActionParamEntity>(
      {
        EntityName: 'MJ: Action Params',
        ExtraFilter: `ActionID='${EscapeSQLString(actionID)}'`,
        ResultType: 'entity_object',
      },
      contextUser,
    );
    if (!result.Success) {
      return;
    }
    for (const row of result.Results) {
      if (!(await row.Delete())) {
        LogError(
          `ModelScoringActionGenerator: failed to delete param ${row.ID} for action ${actionID}: ` +
            `${row.LatestResult?.CompleteMessage || 'unknown error'}`,
        );
      }
    }
  }

  /**
   * The canonical scoring param set, mirroring the parent **Score Record Set** action: `ModelID` (pre-seeded for this
   * model), `Scope`, the optional `BindingID` and `AsOfDate`, plus the scoring run's output params. Kept DRY via a small
   * spec list.
   */
  protected buildParamSpecs(model: MJMLModelEntity): ParamSpec[] {
    return [
      {
        Name: 'ModelID',
        Type: 'Input',
        ValueType: 'Scalar',
        IsRequired: false,
        DefaultValue: model.ID,
        Description: 'Pre-set to the model this action scores with; override only for advanced reuse.',
      },
      {
        Name: 'Scope',
        Type: 'Input',
        ValueType: 'Simple Object',
        IsRequired: true,
        Description:
          'JSON describing the records to score. Populate exactly one of: records (id/pk array), ' +
          'viewId, listId, filter ({entityName, extraFilter, maxRows}), single ({entityName, primaryKey}).',
      },
      ...SCORING_RUN_PARAM_SPECS,
    ];
  }

  // ----- naming + helpers ----------------------------------------------------

  /**
   * Deterministic Action Name: `Score with <label> v<version>`. The model has no
   * `Name` column; its human label is the producing pipeline's name (the
   * denormalized `Pipeline` view field), falling back to the model id.
   */
  protected scoringActionName(model: MJMLModelEntity): string {
    return `Score with ${this.modelLabel(model)} v${this.modelVersion(model)}`;
  }

  /**
   * The Name the model's Action takes: {@link scoringActionName}, unless another Action under the same parent (and
   * category) already holds it — then that name with the model's ID appended, which no other model's Action can hold.
   * The plain name can be taken by an Action this model does not own: a deleted model's Action, which
   * `spDeleteEntityWithCoreDependencies` leaves behind while a later model of the pipeline takes the freed version
   * (M4b.6 cell (c)), or a renamed pipeline's. Without this the save fails on `UQ_Action_Name_CategoryID_ParentID` and the
   * published model gets no scoring Action. Read past the RunView cache (the other Action may have been written out of
   * band).
   *
   * @throws Error when the read fails (a failed read is not "the name is free": the save would then fail)
   */
  protected async uniqueScoringActionName(
    model: MJMLModelEntity,
    parentId: string,
    categoryID: string | null,
    existing: MJActionEntity | null,
    provider: IMetadataProvider,
    contextUser: UserInfo,
  ): Promise<string> {
    const name = this.scoringActionName(model);
    const scope = categoryID ? ` AND CategoryID='${EscapeSQLString(categoryID)}'` : '';
    const holders = await RunView.FromMetadataProvider(provider).RunView<Pick<MJActionEntity, 'ID'>>(
      {
        EntityName: 'MJ: Actions',
        ExtraFilter: `Name='${EscapeSQLString(name)}' AND ParentID='${EscapeSQLString(parentId)}'${scope}`,
        Fields: ['ID'],
        ResultType: 'simple',
        BypassCache: true,
      },
      contextUser,
    );
    if (!holders.Success) throw new Error(`ModelScoringActionGenerator: reading the Actions named '${name}' failed: ${holders.ErrorMessage || 'unknown error'}`);
    const takenByAnother = holders.Results.some((a) => existing === null || !UUIDsEqual(a.ID, existing.ID));
    return takenByAnother ? `${name} (${model.ID})` : name;
  }

  /** Human-readable description naming the model label + version. */
  protected scoringActionDescription(model: MJMLModelEntity): string {
    return (
      `Scores a set of records with the published model "${this.modelLabel(model)}" (v${this.modelVersion(model)}). ` +
      `Auto-generated on publish; reuses the Score Record Set driver with ModelID pre-set to this model. ` +
      `Supply a Scope (records / view / list / filter / single) and optionally WriteBack.`
    );
  }

  /** The model's human label — its pipeline name, or the model id when unset. */
  protected modelLabel(model: MJMLModelEntity): string {
    const pipeline = model.Pipeline?.trim();
    return pipeline && pipeline.length > 0 ? pipeline : model.ID;
  }

  /** The model's version, defaulting to 1 when unset. */
  protected modelVersion(model: MJMLModelEntity): number {
    return model.Version || 1;
  }
}
