/**
 * @module prediction-unit/unit-versioning
 *
 * Creating unit versions. Version 1 is its own lineage root; every later version copies the latest version,
 * applies the changes, takes Version = latest + 1 and LabelVersion = previous + 1 exactly when the outcome definition
 * changed. A saved version is never updated (the server subclass refuses it).
 */
import { randomUUID } from 'node:crypto';
import type { UserInfo } from '@memberjunction/core';
import type { MJPredictionUnitEntity } from '@memberjunction/core-entities';
import { PredictionUnit, type Actor, type CensoringRule, type ChangeHistoryPolicy, type DecisionSpec, type IncumbentHeuristic, type LabelRule, type PredictionUnitSpec, type TaskType, type TemporalSpec, type UnitRows } from '@memberjunction/predictive-studio-core';
import type { IEntityFactory } from '../training/types';

/** The authored content of a unit version: everything but its identity, version numbers and author. */
export interface PredictionUnitDraft {
  readonly Name: string;
  readonly Description: string | null;
  readonly UnitRows: UnitRows;
  readonly LabelRule: LabelRule;
  readonly LabelWindowDays: number;
  readonly LabelGapDays: number;
  readonly TaskType: TaskType;
  readonly Censoring: CensoringRule;
  readonly ChangeHistoryPolicy: ChangeHistoryPolicy;
  readonly GroupKey: string | null;
  readonly TemporalSpec: TemporalSpec | null;
  readonly DecisionSpec: DecisionSpec;
  readonly IncumbentHeuristic: IncumbentHeuristic;
}

/** The `MJ: Prediction Units` column values of one version row, JSON columns serialized. */
export interface UnitVersionColumns {
  readonly ID: string | null;
  readonly LineageRootID: string;
  readonly Version: number;
  readonly LabelVersion: number;
  readonly Name: string;
  readonly Description: string | null;
  readonly UnitRows: string;
  readonly LabelRule: string;
  readonly LabelWindowDays: number;
  readonly LabelGapDays: number;
  readonly TaskType: string;
  readonly Censoring: string;
  readonly ChangeHistoryPolicy: string;
  readonly GroupKey: string | null;
  readonly TemporalSpec: string | null;
  readonly DecisionSpec: string;
  readonly IncumbentHeuristic: string;
  readonly AuthoredBy: string;
}

/**
 * Creating unit versions: build, assign and save version rows (static members on one owner class, never free
 * functions).
 */
export class PredictionUnitVersioning {
  /**
   * Whether the outcome definition (rule, window, gap, task) changed, decided the way the server decides it: both drafts
   * are parsed as stored rows and compared with `PredictionUnit.LabelDefinitionChanged`, so key order or members the
   * parser drops never make a meaning-identical edit look like a change.
   */
  private static labelDefinitionChanged(previous: PredictionUnitDraft, next: PredictionUnitDraft, lineageRootId: string, actor: Actor): boolean {
    return PredictionUnit.LabelDefinitionChanged(
      PredictionUnitVersioning.parseDraft(previous, lineageRootId, actor),
      PredictionUnitVersioning.parseDraft(next, lineageRootId, actor),
    );
  }

  /** A draft read back through the row parser; the identity columns are fixed because the comparison never reads them. */
  private static parseDraft(d: PredictionUnitDraft, lineageRootId: string, actor: Actor): PredictionUnitSpec {
    const parsed = PredictionUnit.ParsePredictionUnitRow({
      ID: lineageRootId, LineageRootID: lineageRootId, Version: 1, LabelVersion: 1, AuthoredBy: JSON.stringify(actor),
      ...PredictionUnitVersioning.columnsOf(d),
    });
    if (parsed.Ok === false) throw new Error(`Prediction Unit "${d.Name}" does not parse: ${parsed.Errors.join('; ')}`);
    return parsed.Value;
  }

  private static columnsOf(d: PredictionUnitDraft): Omit<UnitVersionColumns, 'ID' | 'LineageRootID' | 'Version' | 'LabelVersion' | 'AuthoredBy'> {
    return {
      Name: d.Name, Description: d.Description, UnitRows: JSON.stringify(d.UnitRows), LabelRule: JSON.stringify(d.LabelRule),
      LabelWindowDays: d.LabelWindowDays, LabelGapDays: d.LabelGapDays, TaskType: JSON.stringify(d.TaskType),
      Censoring: JSON.stringify(d.Censoring), ChangeHistoryPolicy: JSON.stringify(d.ChangeHistoryPolicy), GroupKey: d.GroupKey,
      TemporalSpec: d.TemporalSpec ? JSON.stringify(d.TemporalSpec) : null, DecisionSpec: JSON.stringify(d.DecisionSpec),
      IncumbentHeuristic: JSON.stringify(d.IncumbentHeuristic),
    };
  }

  /** Pure: the columns of the next version. Throws when the previous or the changed draft does not parse. */
  public static BuildNextVersionColumns(
    lineage: { readonly lineageRootId: string; readonly latestVersion: number; readonly previousLabelVersion: number; readonly previous: PredictionUnitDraft },
    changes: Partial<PredictionUnitDraft>,
    actor: Actor,
  ): UnitVersionColumns {
    const next: PredictionUnitDraft = { ...lineage.previous, ...changes };
    return {
      ID: null,
      LineageRootID: lineage.lineageRootId,
      Version: lineage.latestVersion + 1,
      LabelVersion: lineage.previousLabelVersion + (PredictionUnitVersioning.labelDefinitionChanged(lineage.previous, next, lineage.lineageRootId, actor) ? 1 : 0),
      AuthoredBy: JSON.stringify(actor),
      ...PredictionUnitVersioning.columnsOf(next),
    };
  }

  private static assign(entity: MJPredictionUnitEntity, c: UnitVersionColumns): void {
    if (c.ID) entity.ID = c.ID;
    entity.LineageRootID = c.LineageRootID;
    entity.Version = c.Version;
    entity.LabelVersion = c.LabelVersion;
    entity.Name = c.Name;
    entity.Description = c.Description;
    entity.UnitRows = c.UnitRows;
    entity.LabelRule = c.LabelRule;
    entity.LabelWindowDays = c.LabelWindowDays;
    entity.LabelGapDays = c.LabelGapDays;
    entity.TaskType = c.TaskType;
    entity.Censoring = c.Censoring;
    entity.ChangeHistoryPolicy = c.ChangeHistoryPolicy;
    entity.GroupKey = c.GroupKey;
    entity.TemporalSpec = c.TemporalSpec;
    entity.DecisionSpec = c.DecisionSpec;
    entity.IncumbentHeuristic = c.IncumbentHeuristic;
    entity.AuthoredBy = c.AuthoredBy;
  }

  private static async saveOrThrow(entity: MJPredictionUnitEntity, what: string): Promise<MJPredictionUnitEntity> {
    if (!(await entity.Save())) throw new Error(`Saving ${what} failed: ${entity.LatestResult?.CompleteMessage || 'unknown error'}`);
    return entity;
  }

  /** Save version 1 of a new lineage: the row is its own lineage root. */
  public static async CreatePredictionUnitV1(draft: PredictionUnitDraft, actor: Actor, entityFactory: IEntityFactory, contextUser?: UserInfo): Promise<MJPredictionUnitEntity> {
    const id = randomUUID().toUpperCase();
    const entity = await entityFactory.getEntityObject<MJPredictionUnitEntity>('MJ: Prediction Units', contextUser);
    PredictionUnitVersioning.assign(entity, { ID: id, LineageRootID: id, Version: 1, LabelVersion: 1, AuthoredBy: JSON.stringify(actor), ...PredictionUnitVersioning.columnsOf(draft) });
    return PredictionUnitVersioning.saveOrThrow(entity, `Prediction Unit "${draft.Name}" v1`);
  }

  /** Read a saved version back into a draft in canonical form (the parser's output), through the same parser that validated it. */
  public static DraftFromUnitRow(row: MJPredictionUnitEntity): PredictionUnitDraft {
    const parsed = PredictionUnit.ParsePredictionUnitRow(row);
    if (parsed.Ok === false) throw new Error(`Prediction Unit ${row.ID} does not parse: ${parsed.Errors.join('; ')}`);
    const s = parsed.Value;
    return {
      Name: s.name, Description: row.Description, UnitRows: s.rows, LabelRule: s.label.rule, LabelWindowDays: s.label.windowDays,
      LabelGapDays: s.label.gapDays, TaskType: s.label.outcome, Censoring: s.censoring, ChangeHistoryPolicy: s.history,
      GroupKey: s.groupKey, TemporalSpec: s.temporal, DecisionSpec: s.decision, IncumbentHeuristic: s.incumbent,
    };
  }

  /** Save the version after `latest` in its lineage, with `changes` applied over the latest version's content. */
  public static async CreateNextPredictionUnitVersion(
    latest: MJPredictionUnitEntity,
    changes: Partial<PredictionUnitDraft>,
    actor: Actor,
    entityFactory: IEntityFactory,
    contextUser?: UserInfo,
  ): Promise<MJPredictionUnitEntity> {
    const columns = PredictionUnitVersioning.BuildNextVersionColumns(
      { lineageRootId: latest.LineageRootID, latestVersion: latest.Version, previousLabelVersion: latest.LabelVersion, previous: PredictionUnitVersioning.DraftFromUnitRow(latest) },
      changes,
      actor,
    );
    const entity = await entityFactory.getEntityObject<MJPredictionUnitEntity>('MJ: Prediction Units', contextUser);
    PredictionUnitVersioning.assign(entity, columns);
    return PredictionUnitVersioning.saveOrThrow(entity, `Prediction Unit "${columns.Name}" v${columns.Version}`);
  }
}
