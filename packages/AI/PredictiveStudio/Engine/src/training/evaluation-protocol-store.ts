/**
 * @module training/evaluation-protocol-store
 *
 * Reading the Evaluation Protocol a pipeline is bound to. A training run and a retraining read the protocol row by ID
 * and parse it into the typed spec the trainer request carries; the read is a seam so the engine tests serve rows
 * without a database.
 */
import { RunView, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { EscapeSQLString } from '@memberjunction/global';
import { EvaluationProtocol, type EvaluationProtocolColumns, type EvaluationProtocolSpec } from '@memberjunction/predictive-studio-core';

/** Reads Evaluation Protocol rows by ID. */
export interface IEvaluationProtocolStore {
  /** The protocol version with this ID, or null when there is none. A failed read throws. */
  Load(protocolId: string): Promise<EvaluationProtocolColumns | null>;
}

/** Reads protocol rows through the request's provider (never the global one), as the request's user. */
export class RunViewEvaluationProtocolStore implements IEvaluationProtocolStore {
  private readonly runView: RunView;
  constructor(provider: IMetadataProvider, private readonly contextUser: UserInfo) {
    this.runView = RunView.FromMetadataProvider(provider);
  }

  /** Read-only, so the row is read as plain values (`'simple'`). */
  public async Load(protocolId: string): Promise<EvaluationProtocolColumns | null> {
    const r = await this.runView.RunView<EvaluationProtocolColumns>(
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
   * The parsed protocol with this ID, or null when the row does not exist.
   *
   * @throws Error naming the protocol and its problems when the row does not parse
   */
  public static async LoadSpec(store: IEvaluationProtocolStore, protocolId: string): Promise<EvaluationProtocolSpec | null> {
    const row = await store.Load(protocolId);
    if (!row) return null;
    const parsed = EvaluationProtocol.ParseEvaluationProtocolRow(row);
    if (parsed.Ok === false) throw new Error(`Evaluation Protocol ${protocolId} does not parse: ${parsed.Errors.join('; ')}`);
    return parsed.Value;
  }
}
