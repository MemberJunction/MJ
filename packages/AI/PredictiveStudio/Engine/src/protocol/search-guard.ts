/**
 * @module protocol/search-guard
 *
 * No protocol, no search: a unit pipeline's training search resolves the protocol version its `EvaluationProtocolID`
 * names before any run row or candidate exists, refuses more candidates than that protocol's budget allows (nothing is
 * silently dropped), checks the protocol against the unit, and checks that the protocol row existed before the run row
 * (both instants from the database clock).
 */
import type { MJMLTrainingPipelineEntity } from '@memberjunction/core-entities';
import { EvaluationProtocolRules, type PipelineRefusal, type PredictionUnitSpec } from '@memberjunction/predictive-studio-core';
import { EvaluationProtocolSpecs, type IEvaluationProtocolStore, type LoadedProtocol } from '../training/evaluation-protocol-store';

/** The bound protocol version a search may run under, or the refusal that stops it before a run row is written. */
export type ProtocolRequirement =
  | { readonly Ok: true; readonly Loaded: LoadedProtocol }
  | { readonly Ok: false; readonly Refusal: PipelineRefusal };

/** The search guard's checks (static members on one owner). */
export class ProtocolSearchGuard {
  /**
   * The protocol version the pipeline is bound to, when it exists and its budget admits `candidates`; otherwise the
   * refusal (`protocol-required` for no binding or a missing row, `too-many-candidates` over the budget).
   *
   * @param store where protocol rows are read
   * @param pipeline the pipeline being searched
   * @param candidates how many candidates the search would train
   * @throws TrainingRefusedError (`protocol-invalid`) when the bound row does not parse
   */
  public static async RequireProtocolForSearch(
    store: IEvaluationProtocolStore,
    pipeline: Pick<MJMLTrainingPipelineEntity, 'ID' | 'EvaluationProtocolID'>,
    candidates: number,
  ): Promise<ProtocolRequirement> {
    const loaded = pipeline.EvaluationProtocolID ? await EvaluationProtocolSpecs.LoadProtocol(store, pipeline.EvaluationProtocolID) : null;
    if (loaded === null) return { Ok: false, Refusal: { kind: 'protocol-required', pipelineId: pipeline.ID } };
    const max = loaded.Protocol.budgets.maxCandidates;
    if (candidates > max) return { Ok: false, Refusal: { kind: 'too-many-candidates', pipelineId: pipeline.ID, candidates, maxCandidates: max } };
    return { Ok: true, Loaded: loaded };
  }

  /** Whether the protocol row was created before (or at) the run row: a run is judged only under a protocol that preceded it. */
  public static ProtocolPrecedesRun(protocolCreatedAt: Date, runCreatedAt: Date): boolean {
    return protocolCreatedAt.getTime() <= runCreatedAt.getTime();
  }

  /** The unit-dependent protocol rules as one storable refusal, or null when the protocol fits the unit. */
  public static CheckProtocolForUnit(loaded: LoadedProtocol, unit: PredictionUnitSpec): PipelineRefusal | null {
    const refusals = EvaluationProtocolRules.ValidateProtocolForUnit(loaded.Protocol, unit);
    if (refusals.length === 0) return null;
    return { kind: 'protocol-unit-mismatch', protocolId: loaded.RowID, problems: refusals.map((r) => EvaluationProtocolRules.DescribeProtocolRefusal(r)) };
  }
}
