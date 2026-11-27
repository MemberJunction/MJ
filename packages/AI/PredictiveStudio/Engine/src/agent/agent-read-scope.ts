/**
 * @module agent/agent-read-scope
 *
 * `AgentReadScope` — the one way an agent-callable path reads a draft Prediction Unit's rows (PR 5, A3; G4.2). It
 * returns the unit's rows minus the locked holdout `ProtocolDefaults.DefaultHoldoutFor` gives that unit: the holdout
 * the Pipeline Builder binds, since the holdout policy is a guard field no payload can change. The holdout rows are
 * carved exactly as training carves them (`HoldoutCarvers.CarverForProtocol`) and dropped before anything is
 * returned, so no holdout row — and no holdout label — reaches an Action's output, the agent's context or its payload.
 * No snapshot exists before approval; the scope reads the rows themselves.
 */
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import {
  PredictionUnit, ProtocolRows,
  type HoldoutSplit, type PredictionUnitSpec, type TrainingRefusal, type UnitDraft,
} from '@memberjunction/predictive-studio-core';

import { ProtocolDefaults, type ProtocolDefaultsReadDeps } from '../protocol/protocol-defaults';
import { PredictionUnitRowReader, type UnitRow } from '../prediction-unit/unit-row-reader';
import { HoldoutCarvers } from '../snapshot/holdout-carver';
import { RunViewDataAccess } from '../feature-assembly/data-access';
import { ProviderAssemblyMetadata } from '../feature-assembly/assembly-metadata';

/** What an agent-callable read of a draft unit's rows returns: development rows only, or why there are none. */
export type AgentRowSet =
  | {
      readonly Status: 'read';
      /** The unit's development rows (never a locked-holdout row). */
      readonly Rows: readonly UnitRow[];
      /** Holdout rows the agent read: always 0 (the field every agent-callable Action reports). */
      readonly HoldoutRowsRead: 0;
      /** Holdout rows the scope left out. */
      readonly HoldoutRowsExcluded: number;
      /** The holdout the scope carved: the one the builder binds. */
      readonly Holdout: HoldoutSplit;
    }
  | {
      readonly Status: 'refused';
      /** Why the unit's rows could not be read; nothing was returned. */
      readonly Reason: string;
      /** No row was returned, so none from the holdout. */
      readonly HoldoutRowsRead: 0;
    };

/** The development rows of a draft unit. */
export class AgentReadScope {
  /** The ID a draft unit's spec carries: it has no row before approval. */
  public static readonly DRAFT_UNIT_ID = 'draft';

  /** The draft unit's development rows, read through the passed provider as `contextUser`. */
  public static async DevelopmentRows(unit: UnitDraft, provider: IMetadataProvider, contextUser: UserInfo): Promise<AgentRowSet> {
    return AgentReadScope.DevelopmentRowsWith(unit, { DataAccess: new RunViewDataAccess(contextUser, provider), Metadata: new ProviderAssemblyMetadata(provider), Now: new Date() });
  }

  /**
   * {@link DevelopmentRows} over explicit read deps: the default holdout for the unit, then the unit's rows, carved as
   * training carves them, with every row the carve does not make a development row dropped.
   */
  public static async DevelopmentRowsWith(unit: UnitDraft, deps: ProtocolDefaultsReadDeps): Promise<AgentRowSet> {
    const spec = AgentReadScope.DraftSpec(unit);
    try {
      const holdout = await ProtocolDefaults.DefaultHoldoutFor(spec, deps);
      const read = await new PredictionUnitRowReader().Read(spec, { ...deps, Read: { mode: 'complete' } });
      if (read.Status !== 'read') return AgentReadScope.refused(AgentReadScope.describeRefusal(read.Refusal));
      return AgentReadScope.developmentOf(read.Rows, holdout, spec);
    } catch (e) {
      return AgentReadScope.refused(e instanceof Error ? e.message : String(e));
    }
  }

  /** The spec a draft unit reads as: the draft's columns under the draft ID, version 1, authored by the agent's draft. */
  public static DraftSpec(unit: UnitDraft): PredictionUnitSpec {
    const id = AgentReadScope.DRAFT_UNIT_ID;
    const parsed = PredictionUnit.ParsePredictionUnitRow({
      ...ProtocolRows.UnitDraftColumns(unit), ID: id, LineageRootID: id, Version: 1, LabelVersion: 1,
      AuthoredBy: JSON.stringify({ kind: 'system', component: 'agent-draft' }),
    });
    if (parsed.Ok === false) throw new Error(`The draft Prediction Unit does not parse: ${parsed.Errors.join('; ')}`);
    return parsed.Value;
  }

  /** The carve's development rows, and how many holdout rows it left out. */
  private static developmentOf(rows: readonly UnitRow[], holdout: HoldoutSplit, spec: PredictionUnitSpec): AgentRowSet {
    const carve = HoldoutCarvers.CarverForProtocol({ holdout, seed: ProtocolDefaults.DEFAULT_SEED }, spec).AssignRoles(rows, new Map(rows.map((r) => [r.RowID, r])));
    const development = rows.filter((r) => carve.Roles.get(r.RowID) === 'development');
    const held = rows.filter((r) => carve.Roles.get(r.RowID) === 'locked-holdout').length;
    return { Status: 'read', Rows: development, HoldoutRowsRead: 0, HoldoutRowsExcluded: held, Holdout: holdout };
  }

  /** A refused read: no rows. */
  private static refused(reason: string): AgentRowSet {
    return { Status: 'refused', Reason: reason, HoldoutRowsRead: 0 };
  }

  /** A row-read refusal in words. */
  private static describeRefusal(refusal: TrainingRefusal): string {
    return `the unit's rows cannot be read (${refusal.stage}): ${JSON.stringify(refusal.reason)}`;
  }
}
