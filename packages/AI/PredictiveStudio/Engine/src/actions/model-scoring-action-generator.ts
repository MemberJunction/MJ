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
 * Mirrors {@link IntegrationActionGenerator}: the Action is found-or-created by its
 * deterministic Name, and its child params are deleted + recreated on every run so
 * they stay exactly in sync with the parent's contract.
 *
 * All saves are checked and failures are logged (never thrown up to the promote —
 * action generation is an enhancement, not part of the promotion contract).
 */

import { RunView, LogError, LogStatus, type UserInfo, type IMetadataProvider } from '@memberjunction/core';
import type {
  MJMLModelEntity,
  MJActionEntity,
  MJActionParamEntity,
  MJActionCategoryEntity,
} from '@memberjunction/core-entities';

import { SCORE_RECORD_SET_DRIVER_CLASS } from './score-record-set.action';

/** Name of the find-or-create Action Category that holds per-model scoring actions. */
const MODELS_CATEGORY_NAME = 'Predictive Studio Models';

/** The canonical parent Action's Name (the metadata "Score Record Set" row). */
const PARENT_ACTION_NAME = 'Score Record Set';

/** Font Awesome icon for generated scoring actions (matches the parent). */
const SCORING_ICON_CLASS = 'fa-solid fa-gauge-high';

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
 * Generates (and disables) the per-model "Score with <Model> v<n>" child Action.
 * Stateless + idempotent — safe to call on every promotion.
 */
export class ModelScoringActionGenerator {
  /**
   * Find-or-create the per-model scoring Action for `model` and reconcile its
   * params. Idempotent on the deterministic Action Name. Logs and returns on any
   * failure (the parent action is missing, a save fails) rather than throwing —
   * callers must never let scoring-action generation break the promotion path.
   */
  public async generateForModel(
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
   * Disable the generated scoring Action for `model` (e.g. when the model is
   * Archived) by flipping its Status to `Disabled`. A no-op when no generated
   * action exists. Never throws.
   */
  public async disableForModel(
    model: MJMLModelEntity,
    contextUser: UserInfo,
    provider: IMetadataProvider,
  ): Promise<void> {
    const name = this.scoringActionName(model);
    const existing = await this.findActionByName(name, provider, contextUser);
    if (!existing) {
      return;
    }
    if (existing.Status === 'Disabled') {
      return; // already disabled — nothing to do
    }
    existing.Status = 'Disabled';
    if (!(await existing.Save())) {
      LogError(
        `ModelScoringActionGenerator: failed to disable action '${name}': ` +
          `${existing.LatestResult?.CompleteMessage ?? 'unknown error'}`,
      );
      return;
    }
    LogStatus(`ModelScoringActionGenerator: disabled scoring action '${name}' for archived model '${model.ID}'.`);
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
        ExtraFilter: `Name='${this.escape(MODELS_CATEGORY_NAME)}'`,
        MaxRows: 1,
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
          `${cat.LatestResult?.CompleteMessage ?? 'unknown error'}`,
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
          `Name='${this.escape(PARENT_ACTION_NAME)}' AND ` +
          `DriverClass='${this.escape(SCORE_RECORD_SET_DRIVER_CLASS)}' AND ParentID IS NULL`,
        MaxRows: 1,
        ResultType: 'entity_object',
      },
      contextUser,
    );
    return result.Success && result.Results.length > 0 ? result.Results[0] : null;
  }

  // ----- action upsert (idempotent) -----------------------------------------

  /**
   * Find-or-create the per-model scoring Action by its deterministic Name and
   * apply its fields. The child reuses the parent's DriverClass (composition) and
   * links via ParentID. Returns the saved row, or null on save failure (logged).
   */
  protected async upsertScoringAction(
    model: MJMLModelEntity,
    parent: MJActionEntity,
    categoryID: string | null,
    provider: IMetadataProvider,
    contextUser: UserInfo,
  ): Promise<MJActionEntity | null> {
    const name = this.scoringActionName(model);
    const existing = await this.findActionByName(name, provider, contextUser);
    const action = existing ?? (await provider.GetEntityObject<MJActionEntity>('MJ: Actions', contextUser));
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
          `${action.LatestResult?.CompleteMessage ?? 'unknown error'}`,
      );
      return null;
    }
    return action;
  }

  /** Load an Action by exact Name (idempotency lookup), or null. */
  protected async findActionByName(
    name: string,
    provider: IMetadataProvider,
    contextUser: UserInfo,
  ): Promise<MJActionEntity | null> {
    const rv = RunView.FromMetadataProvider(provider);
    const result = await rv.RunView<MJActionEntity>(
      {
        EntityName: 'MJ: Actions',
        ExtraFilter: `Name='${this.escape(name)}'`,
        MaxRows: 1,
        ResultType: 'entity_object',
      },
      contextUser,
    );
    return result.Success && result.Results.length > 0 ? result.Results[0] : null;
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
      if (spec.DefaultValue != null) {
        param.DefaultValue = spec.DefaultValue;
      }
      if (!(await param.Save())) {
        LogError(
          `ModelScoringActionGenerator: failed to save param '${spec.Name}' for action ${actionID}: ` +
            `${param.LatestResult?.CompleteMessage ?? 'unknown error'}`,
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
        ExtraFilter: `ActionID='${this.escape(actionID)}'`,
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
            `${row.LatestResult?.CompleteMessage ?? 'unknown error'}`,
        );
      }
    }
  }

  /**
   * The canonical scoring param set, mirroring the parent **Score Record Set**
   * action: `ModelID` (pre-seeded for this model), `Scope`, `WriteBack`, plus the
   * five output params. Kept DRY via a small spec list.
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
      {
        Name: 'WriteBack',
        Type: 'Input',
        ValueType: 'Simple Object',
        IsRequired: false,
        Description:
          'Optional. true to write scores back with the model\'s default mapping, or an object ' +
          '{ OutputMapping: ... } to write to a specific column/child record. When omitted, predictions ' +
          'are returned ephemerally.',
      },
      {
        Name: 'ScoredCount',
        Type: 'Output',
        ValueType: 'Scalar',
        IsRequired: false,
        Description: 'Number of records successfully scored.',
      },
      {
        Name: 'FailedCount',
        Type: 'Output',
        ValueType: 'Scalar',
        IsRequired: false,
        Description: 'Number of records that failed to score.',
      },
      {
        Name: 'SkippedCount',
        Type: 'Output',
        ValueType: 'Scalar',
        IsRequired: false,
        Description: 'Number of records the processor skipped (e.g. ineligible / filtered out).',
      },
      {
        Name: 'WroteBack',
        Type: 'Output',
        ValueType: 'Scalar',
        IsRequired: false,
        Description: 'True when scores were written back to the target (predictions are then NOT returned ephemerally).',
      },
      {
        Name: 'Predictions',
        Type: 'Output',
        ValueType: 'Scalar',
        IsRequired: false,
        Description:
          'JSON array of ephemeral predictions ({recordId, score, class}), present only when WriteBack was not requested.',
      },
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
    return model.Version ?? 1;
  }

  /** Single-quote-escape a value for safe SQL filter interpolation. */
  private escape(value: string): string {
    return value.replace(/'/g, "''");
  }
}
