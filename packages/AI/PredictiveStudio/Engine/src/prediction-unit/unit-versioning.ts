/**
 * @module prediction-unit/unit-versioning
 *
 * Creating unit versions. Version 1 is its own lineage root; every later version copies the latest version,
 * applies the changes, takes Version = latest + 1 and LabelVersion = previous + 1 exactly when the outcome definition
 * changed. A saved version is never updated (the server subclass refuses it).
 */
import type { UserInfo } from '@memberjunction/core';
import type { MJMLPredictionUnitEntity } from '@memberjunction/core-entities';
import { PredictionUnit, ProtocolRows, type Actor, type PredictionUnitSpec, type UnitDraft, type UnitVersionWrite } from '@memberjunction/predictive-studio-core';
import type { IEntityFactory } from '../training/types';

/** Creating unit versions: build each version's draft and row identity, write it with Core's row writer, save it. */
export class PredictionUnitVersioning {
  /**
   * Whether the outcome definition (rule, window, gap, task) changed, decided the way the server decides it: both drafts
   * are parsed as stored rows and compared with `PredictionUnit.LabelDefinitionChanged`, so key order or members the
   * parser drops never make a meaning-identical edit look like a change.
   */
  private static labelDefinitionChanged(previous: UnitDraft, next: UnitDraft, lineageRootId: string, actor: Actor): boolean {
    return PredictionUnit.LabelDefinitionChanged(
      PredictionUnitVersioning.parseDraft(previous, lineageRootId, actor),
      PredictionUnitVersioning.parseDraft(next, lineageRootId, actor),
    );
  }

  /** A draft read back through the row parser; the identity columns are fixed because the comparison never reads them. */
  private static parseDraft(d: UnitDraft, lineageRootId: string, actor: Actor): PredictionUnitSpec {
    const parsed = PredictionUnit.ParsePredictionUnitRow({
      ID: lineageRootId, LineageRootID: lineageRootId, Version: 1, LabelVersion: 1, AuthoredBy: JSON.stringify(actor),
      ...ProtocolRows.UnitDraftColumns(d),
    });
    if (parsed.Ok === false) throw new Error(`Prediction Unit "${d.Name}" does not parse: ${parsed.Errors.join('; ')}`);
    return parsed.Value;
  }

  /**
   * Pure: the draft and row identity of the next version — `changes` over the previous draft, Version = latest + 1 under
   * the same lineage root, the label version bumped exactly when the outcome definition changed, the ID left to the
   * database. Throws when the previous or the changed draft does not parse.
   */
  public static BuildNextVersion(
    lineage: { readonly lineageRootId: string; readonly latestVersion: number; readonly previousLabelVersion: number; readonly previous: UnitDraft },
    changes: Partial<UnitDraft>,
    actor: Actor,
  ): UnitVersionWrite {
    const next: UnitDraft = { ...lineage.previous, ...changes };
    const changed = PredictionUnitVersioning.labelDefinitionChanged(lineage.previous, next, lineage.lineageRootId, actor);
    return {
      Draft: next,
      Meta: { ID: null, LineageRootID: lineage.lineageRootId, Version: lineage.latestVersion + 1, LabelVersion: lineage.previousLabelVersion + (changed ? 1 : 0), AuthoredBy: actor },
    };
  }

  /** Writes a version into a new row through Core's one row writer and saves it. */
  private static async writeVersion(entity: MJMLPredictionUnitEntity, version: UnitVersionWrite, what: string): Promise<MJMLPredictionUnitEntity> {
    ProtocolRows.ApplyPredictionUnitDraftToRow(entity, version.Draft, version.Meta);
    return PredictionUnitVersioning.saveOrThrow(entity, what);
  }

  private static async saveOrThrow(entity: MJMLPredictionUnitEntity, what: string): Promise<MJMLPredictionUnitEntity> {
    if (!(await entity.Save())) throw new Error(`Saving ${what} failed: ${entity.LatestResult?.CompleteMessage || 'unknown error'}`);
    return entity;
  }

  /** Save version 1 of a new lineage: the row is its own lineage root. */
  public static async CreatePredictionUnitV1(draft: UnitDraft, actor: Actor, entityFactory: IEntityFactory, contextUser?: UserInfo): Promise<MJMLPredictionUnitEntity> {
    const id = ProtocolRows.NewVersionRowID();
    const entity = await entityFactory.getEntityObject<MJMLPredictionUnitEntity>('MJ: ML Prediction Units', contextUser);
    const v1: UnitVersionWrite = { Draft: draft, Meta: { ID: id, LineageRootID: id, Version: 1, LabelVersion: 1, AuthoredBy: actor } };
    return PredictionUnitVersioning.writeVersion(entity, v1, `Prediction Unit "${draft.Name}" v1`);
  }

  /** Read a saved version back into a draft in canonical form (the parser's output), through the same parser that validated it. */
  public static DraftFromUnitRow(row: MJMLPredictionUnitEntity): UnitDraft {
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
    latest: MJMLPredictionUnitEntity,
    changes: Partial<UnitDraft>,
    actor: Actor,
    entityFactory: IEntityFactory,
    contextUser?: UserInfo,
  ): Promise<MJMLPredictionUnitEntity> {
    const next = PredictionUnitVersioning.BuildNextVersion(
      { lineageRootId: latest.LineageRootID, latestVersion: latest.Version, previousLabelVersion: latest.LabelVersion, previous: PredictionUnitVersioning.DraftFromUnitRow(latest) },
      changes,
      actor,
    );
    const entity = await entityFactory.getEntityObject<MJMLPredictionUnitEntity>('MJ: ML Prediction Units', contextUser);
    return PredictionUnitVersioning.writeVersion(entity, next, `Prediction Unit "${next.Draft.Name}" v${next.Meta.Version}`);
  }
}
