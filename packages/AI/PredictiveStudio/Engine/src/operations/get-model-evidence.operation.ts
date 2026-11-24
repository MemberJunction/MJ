/**
 * @module operations/get-model-evidence.operation
 *
 * **Get ML Model Evidence** Remote Operation — the server body for the Manual-mode `PredictiveStudio.GetModelEvidence`
 * operation. A read-only `Sync` call: the evidence of a model built from stored rows ({@link SignOffService.BuildEvidence},
 * the evidence a sign-off records and a publish rebuilds) and its SHA-256. It writes no row.
 *
 * Per CLAUDE.md "transport-layer architecture", the operation is a THIN adapter over {@link SignOffService}.
 */

import { RegisterClass } from '@memberjunction/global';
import type { IMetadataProvider, RemoteOpServerContext, UserInfo } from '@memberjunction/core';
import { BaseRemotableOperation } from '@memberjunction/core';
import {
  PredictiveStudioGetModelEvidenceOperation,
  type PredictiveStudioGetModelEvidenceInput,
  type PredictiveStudioGetModelEvidenceOutput,
} from '@memberjunction/core-entities';

import { SignOffService } from '../governance/sign-off-service';
import { GateContexts } from '../registry/gate-seams';
import { PublishRecords } from '../registry/publish-records';

/**
 * Server implementation of `PredictiveStudio.GetModelEvidence`. Extends the CodeGen-emitted
 * {@link PredictiveStudioGetModelEvidenceOperation} base (`ExecutionMode='Sync'`, `RequiredScope='predictive:execute'`)
 * and supplies only the body.
 */
@RegisterClass(BaseRemotableOperation, 'PredictiveStudio.GetModelEvidence')
export class PredictiveStudioGetModelEvidenceServerOperation extends PredictiveStudioGetModelEvidenceOperation {
  /**
   * @inheritdoc
   * @throws Error when `modelId` is missing, or the evidence cannot be built (the framework returns `EXECUTION_ERROR`)
   */
  protected async InternalExecute(
    input: PredictiveStudioGetModelEvidenceInput,
    provider: IMetadataProvider,
    user: UserInfo,
    _context: RemoteOpServerContext,
  ): Promise<PredictiveStudioGetModelEvidenceOutput> {
    if (!input?.modelId) throw new Error('modelId is required');
    const evidence = await new SignOffService().BuildEvidence(input.modelId, GateContexts.ForRequest({ ContextUser: user, Provider: provider }));
    return { evidence, evidenceSha256: PublishRecords.EvidenceSha256(evidence) };
  }
}

/** Tree-shaking anchor — call from a server bootstrap to retain this registration. */
export function LoadPredictiveStudioGetModelEvidenceOperation(): void {
  // intentionally empty
}
