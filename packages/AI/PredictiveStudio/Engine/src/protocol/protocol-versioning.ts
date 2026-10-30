/**
 * @module protocol/protocol-versioning
 *
 * Evaluation Protocol version rows, written the way Prediction Unit versions are: version 1 is its own lineage root
 * with a client-supplied ID; every later version copies the latest version, applies the changes and takes
 * Version = latest + 1 under the same lineage root, with its ID left to the database. A saved version is never
 * updated (the server subclass refuses it). The guard-field author rule (the previous version's
 * `GuardFieldsEditableBy`) is enforced by the server entity from the `AuthoredBy` written here.
 */
import { randomUUID } from 'node:crypto';
import type { UserInfo } from '@memberjunction/core';
import type { MJEvaluationProtocolEntity } from '@memberjunction/core-entities';
import {
  EvaluationProtocol, EvaluationProtocolRules,
  type Actor, type EvaluationProtocolColumns, type EvaluationProtocolDraft, type EvaluationProtocolDraftColumns,
} from '@memberjunction/predictive-studio-core';
import type { IEntityFactory } from '../training/types';

/** The `MJ: Evaluation Protocols` column values of one version row; `ID` is null when the database assigns it. */
export type EvaluationProtocolVersionColumns = EvaluationProtocolDraftColumns & {
  readonly ID: string | null;
  readonly LineageRootID: string;
  readonly Version: number;
  readonly Description: string | null;
  readonly AuthoredBy: string;
};

/** The columns this module writes on a protocol row, and its save (the generated entity satisfies it). */
export interface EvaluationProtocolVersionRow extends Pick<MJEvaluationProtocolEntity,
  'ID' | 'LineageRootID' | 'Version' | 'Name' | 'Description' | 'Holdout' | 'InnerValidation' | 'Seed' | 'HoldoutAccessBudget' |
  'PrimaryScore' | 'SecondaryMetrics' | 'Baselines' | 'Calibration' | 'Resampling' | 'Intervals' | 'Promotion' | 'AllowedOutcomes' |
  'LeakageAudit' | 'Exclusions' | 'Slices' | 'PredictionIntervals' | 'ResidualDiagnostics' | 'RetrainTriggers' | 'SearchStrategy' |
  'Budgets' | 'MinMinorityClassRows' | 'GuardFieldsEditableBy' | 'AuthoredBy'> {
  /** Saves the row; false when the save (or its validation) failed. */
  Save(): Promise<boolean>;
  /** The last save's result; its message explains a failed save. */
  readonly LatestResult: { readonly CompleteMessage: string } | null;
}

/** Evaluation Protocol version rows (static members on one owner). */
export class EvaluationProtocolVersioning {
  /** Pure: the columns of version 1 of a new lineage, its own lineage root: `id` is both its ID and its LineageRootID. */
  public static BuildV1Columns(draft: EvaluationProtocolDraft, actor: Actor, id: string): EvaluationProtocolVersionColumns {
    return { ID: id, LineageRootID: id, Version: 1, Description: null, AuthoredBy: JSON.stringify(actor), ...EvaluationProtocolRules.EvaluationProtocolDraftColumns(draft) };
  }

  /**
   * Pure: the columns of the version after `latest` — `latest` parsed back to a draft, `changes` applied, its description
   * carried over.
   *
   * @throws Error when `latest` does not parse
   */
  public static BuildNextVersionColumns(
    latest: EvaluationProtocolColumns & { readonly Description: string | null },
    changes: Partial<EvaluationProtocolDraft>,
    actor: Actor,
  ): EvaluationProtocolVersionColumns {
    const parsed = EvaluationProtocol.ParseEvaluationProtocolRow(latest);
    if (parsed.Ok === false) throw new Error(`Evaluation Protocol ${latest.ID} does not parse: ${parsed.Errors.join('; ')}`);
    const next: EvaluationProtocolDraft = { ...EvaluationProtocolRules.DraftFromProtocolSpec(parsed.Value), ...changes };
    return {
      ID: null, LineageRootID: latest.LineageRootID, Version: latest.Version + 1, Description: latest.Description,
      AuthoredBy: JSON.stringify(actor), ...EvaluationProtocolRules.EvaluationProtocolDraftColumns(next),
    };
  }

  /**
   * Assigns the columns to a new row and saves it. A null `ID` is left unassigned so the database supplies it.
   *
   * @throws Error naming `what` and the save message when the save fails
   */
  public static async WriteVersionRow(row: EvaluationProtocolVersionRow, c: EvaluationProtocolVersionColumns, what: string): Promise<void> {
    EvaluationProtocolVersioning.assign(row, c);
    if (!(await row.Save())) throw new Error(`Saving ${what} failed: ${row.LatestResult?.CompleteMessage || 'unknown error'}`);
  }

  /** Version 1 of a new protocol lineage: its own lineage root, with a client-minted upper-case ID. */
  public static async CreateEvaluationProtocolV1(draft: EvaluationProtocolDraft, actor: Actor, entityFactory: IEntityFactory, contextUser?: UserInfo): Promise<MJEvaluationProtocolEntity> {
    const row = await entityFactory.getEntityObject<MJEvaluationProtocolEntity>('MJ: Evaluation Protocols', contextUser);
    await EvaluationProtocolVersioning.WriteVersionRow(row, EvaluationProtocolVersioning.BuildV1Columns(draft, actor, randomUUID().toUpperCase()), `Evaluation Protocol "${draft.name}" v1`);
    return row;
  }

  /** The next version under `latest`'s lineage, with `changes` applied over the latest version's content. */
  public static async CreateNextEvaluationProtocolVersion(
    latest: MJEvaluationProtocolEntity,
    changes: Partial<EvaluationProtocolDraft>,
    actor: Actor,
    entityFactory: IEntityFactory,
    contextUser?: UserInfo,
  ): Promise<MJEvaluationProtocolEntity> {
    const columns = EvaluationProtocolVersioning.BuildNextVersionColumns(latest, changes, actor);
    const row = await entityFactory.getEntityObject<MJEvaluationProtocolEntity>('MJ: Evaluation Protocols', contextUser);
    await EvaluationProtocolVersioning.WriteVersionRow(row, columns, `Evaluation Protocol "${columns.Name}" v${columns.Version}`);
    return row;
  }

  private static assign(row: EvaluationProtocolVersionRow, c: EvaluationProtocolVersionColumns): void {
    if (c.ID) row.ID = c.ID;
    row.LineageRootID = c.LineageRootID; row.Version = c.Version; row.Name = c.Name; row.Description = c.Description;
    row.Holdout = c.Holdout; row.InnerValidation = c.InnerValidation; row.Seed = c.Seed; row.HoldoutAccessBudget = c.HoldoutAccessBudget;
    row.PrimaryScore = c.PrimaryScore; row.SecondaryMetrics = c.SecondaryMetrics; row.Baselines = c.Baselines; row.Calibration = c.Calibration;
    row.Resampling = c.Resampling; row.Intervals = c.Intervals; row.Promotion = c.Promotion; row.AllowedOutcomes = c.AllowedOutcomes;
    row.LeakageAudit = c.LeakageAudit; row.Exclusions = c.Exclusions; row.Slices = c.Slices; row.PredictionIntervals = c.PredictionIntervals;
    row.ResidualDiagnostics = c.ResidualDiagnostics; row.RetrainTriggers = c.RetrainTriggers; row.SearchStrategy = c.SearchStrategy;
    row.Budgets = c.Budgets; row.MinMinorityClassRows = c.MinMinorityClassRows; row.GuardFieldsEditableBy = c.GuardFieldsEditableBy;
    row.AuthoredBy = c.AuthoredBy;
  }
}
