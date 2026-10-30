/**
 * @module training/evaluation-protocol-store
 *
 * Reading the Evaluation Protocol a pipeline is bound to. A training run, a retraining and the search guard read the
 * protocol row by ID and parse it into the typed spec the trainer request carries; the read is a seam so the engine
 * tests serve rows without a database. A pipeline's protocol is exactly the version its `EvaluationProtocolID` names:
 * there is no "latest version of the lineage" lookup.
 */
import { RunView, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import type { MJEvaluationProtocolEntity } from '@memberjunction/core-entities';
import { EscapeSQLString } from '@memberjunction/global';
import { EvaluationProtocol, type EvaluationProtocolColumns, type EvaluationProtocolSpec } from '@memberjunction/predictive-studio-core';
import { TrainingRefusedError } from './training-refusal';

/** A stored protocol row: its columns and the instant the database created it. */
export type StoredEvaluationProtocol = EvaluationProtocolColumns & Pick<MJEvaluationProtocolEntity, '__mj_CreatedAt'>;

/** One protocol version, parsed, with the row facts a run is checked against. */
export interface LoadedProtocol {
  /** `MJ: Evaluation Protocols`.ID of this version's row. */
  readonly RowID: string;
  readonly Version: number;
  /** The row's `__mj_CreatedAt` (the database clock, the same clock that stamps the run row). */
  readonly CreatedAt: Date;
  readonly Protocol: EvaluationProtocolSpec;
}

/** Reads Evaluation Protocol rows by ID. */
export interface IEvaluationProtocolStore {
  /** The protocol version with this ID, or null when there is none. A failed read throws. */
  Load(protocolId: string): Promise<StoredEvaluationProtocol | null>;
}

/** Reads protocol rows through the request's provider (never the global one), as the request's user. */
export class RunViewEvaluationProtocolStore implements IEvaluationProtocolStore {
  private readonly runView: RunView;
  constructor(provider: IMetadataProvider, private readonly contextUser: UserInfo) {
    this.runView = RunView.FromMetadataProvider(provider);
  }

  /** Read-only, so the row is read as plain values (`'simple'`). */
  public async Load(protocolId: string): Promise<StoredEvaluationProtocol | null> {
    const r = await this.runView.RunView<StoredEvaluationProtocol>(
      { EntityName: 'MJ: Evaluation Protocols', ExtraFilter: `ID='${EscapeSQLString(protocolId)}'`, MaxRows: 1, ResultType: 'simple' },
      this.contextUser,
    );
    if (!r.Success) throw new Error(`Reading Evaluation Protocol ${protocolId} failed: ${r.ErrorMessage}`);
    return r.Results[0] || null;
  }
}

/** Loads and parses protocols (static members on one owner). */
export class EvaluationProtocolSpecs {
  /**
   * The protocol version with this ID, parsed, or null when the row does not exist.
   *
   * @throws TrainingRefusedError (`protocol-invalid`) naming the protocol and its problems when the row does not parse
   */
  public static async LoadProtocol(store: IEvaluationProtocolStore, protocolId: string): Promise<LoadedProtocol | null> {
    const row = await store.Load(protocolId);
    if (!row) return null;
    const parsed = EvaluationProtocol.ParseEvaluationProtocolRow(row);
    if (parsed.Ok === false) throw new TrainingRefusedError({ stage: 'pipeline', reason: { kind: 'protocol-invalid', protocolId: row.ID, errors: parsed.Errors } });
    // A plain row read through a client provider carries the instant as text; `new Date` reads either form.
    return { RowID: row.ID, Version: row.Version, CreatedAt: new Date(row.__mj_CreatedAt), Protocol: parsed.Value };
  }

  /**
   * The parsed protocol with this ID, or null when the row does not exist.
   *
   * @throws TrainingRefusedError (`protocol-invalid`) when the row does not parse
   */
  public static async LoadSpec(store: IEvaluationProtocolStore, protocolId: string): Promise<EvaluationProtocolSpec | null> {
    const loaded = await EvaluationProtocolSpecs.LoadProtocol(store, protocolId);
    return loaded ? loaded.Protocol : null;
  }
}
