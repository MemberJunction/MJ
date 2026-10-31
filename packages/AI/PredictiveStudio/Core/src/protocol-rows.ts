/**
 * @module protocol-rows
 *
 * Writes a protocol draft or a unit draft into the columns of a new version row. Every version is its own row:
 * version 1 is its own lineage root, a later version carries version 1's ID in `LineageRootID` and leaves its own ID
 * to the database. The row targets are the Core column shapes plus `Description`, so the generated
 * `MJEvaluationProtocolEntity` / `MJPredictionUnitEntity` satisfy them without a cast. Browser-safe: the Explorer
 * widgets, the server-side writers and the migration share it.
 */
import type { EvaluationProtocolColumns } from './evaluation-protocol';
import { EvaluationProtocolRules, type EvaluationProtocolDraft, type ProtocolRowMeta } from './evaluation-protocol-rules';
import type {
  CensoringRule, ChangeHistoryPolicy, DecisionSpec, IncumbentHeuristic, LabelRule, PredictionUnitColumns, TemporalSpec, UnitRows,
} from './prediction-unit';
import type { TaskType } from './task-type';
import { UtcDay } from './utc-day';

/** A row an Evaluation Protocol version is written into: the protocol columns plus the free-text description. */
export type EvaluationProtocolRowTarget = EvaluationProtocolColumns & { Description: string | null };

/** A row a Prediction Unit version is written into: the unit columns plus the free-text description. */
export type PredictionUnitRowTarget = PredictionUnitColumns & { Description: string | null };

/**
 * Row identity of a protocol version written into an existing row object. It is `ProtocolRowMeta` except that a
 * later version leaves `ID` to the database, and it carries the description the version row is saved with.
 */
export interface ProtocolRowWriteMeta extends Omit<ProtocolRowMeta, 'ID'> {
  /** Version 1: the ID to write (also its `LineageRootID`). Later versions: null, so the row's own ID is left alone. */
  readonly ID: string | null;
  /** The row's description (a new version carries the previous version's). */
  readonly Description: string | null;
}

/** Row identity of a unit version: the protocol's write identity plus the label version the row carries. */
export type UnitRowMeta = Omit<ProtocolRowWriteMeta, 'Description'> & {
  /** 1 for version 1; the previous label version, plus one when the outcome definition changed. */
  readonly LabelVersion: number;
};

/** The authored content of a unit version: every column but its identity, version numbers and author. */
export interface UnitDraft {
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

/** The `MJ: Prediction Units` columns a unit draft determines, JSON columns serialized. */
export type UnitDraftColumns = Omit<PredictionUnitColumns, 'ID' | 'LineageRootID' | 'Version' | 'LabelVersion' | 'AuthoredBy'> & {
  readonly Description: string | null;
};

/** Writing protocol and unit drafts into new version rows. */
export class ProtocolRows {
  /**
   * An ID for version 1 of a new lineage, written to both `ID` and `LineageRootID`. An in-process writer keeps it.
   * Over GraphQL the client never sends a primary key on create: the server mints the row's ID and adopts it as the
   * lineage root, so a browser caller reads both back from the saved row.
   */
  public static NewVersionRowID(): string {
    return globalThis.crypto.randomUUID().toUpperCase();
  }

  /**
   * True for a `yyyy-mm-dd` string that names a calendar day — the form every date in a version row is stored in
   * (holdout cutoff and end, a fixed censoring date). `2024-02-30` and `2024-1-1` are refused.
   */
  public static IsIsoDay(text: string): boolean {
    const day = UtcDay.ToUtcDay(text);
    return day !== null && UtcDay.UtcDayIso(day) === text;
  }

  /** Writes a protocol draft into a row through the protocol's one serializer; only the row-identity rules are added here. */
  public static ApplyProtocolDraftToRow(row: EvaluationProtocolRowTarget, d: EvaluationProtocolDraft, meta: ProtocolRowWriteMeta): void {
    const { ID, ...columns } = EvaluationProtocolRules.EvaluationProtocolColumnsFromDraft(d, {
      ID: meta.ID || '', LineageRootID: meta.LineageRootID, Version: meta.Version, AuthoredBy: meta.AuthoredBy,
    });
    Object.assign(row, columns);
    if (meta.ID !== null) row.ID = ID;
    row.Description = meta.Description;
  }

  /** The columns a unit draft determines (the inverse of `PredictionUnit.ParsePredictionUnitRow` for those columns). */
  public static UnitDraftColumns(d: UnitDraft): UnitDraftColumns {
    return {
      Name: d.Name, Description: d.Description, UnitRows: JSON.stringify(d.UnitRows), LabelRule: JSON.stringify(d.LabelRule),
      LabelWindowDays: d.LabelWindowDays, LabelGapDays: d.LabelGapDays, TaskType: JSON.stringify(d.TaskType),
      Censoring: JSON.stringify(d.Censoring), ChangeHistoryPolicy: JSON.stringify(d.ChangeHistoryPolicy), GroupKey: d.GroupKey,
      TemporalSpec: d.TemporalSpec === null ? null : JSON.stringify(d.TemporalSpec), DecisionSpec: JSON.stringify(d.DecisionSpec),
      IncumbentHeuristic: JSON.stringify(d.IncumbentHeuristic),
    };
  }

  /** Writes a unit draft and its row identity into a row; a later version's row ID is left alone. */
  public static ApplyPredictionUnitDraftToRow(row: PredictionUnitRowTarget, d: UnitDraft, meta: UnitRowMeta): void {
    Object.assign(row, ProtocolRows.UnitDraftColumns(d));
    if (meta.ID !== null) row.ID = meta.ID;
    row.LineageRootID = meta.LineageRootID;
    row.Version = meta.Version;
    row.LabelVersion = meta.LabelVersion;
    row.AuthoredBy = JSON.stringify(meta.AuthoredBy);
  }
}
