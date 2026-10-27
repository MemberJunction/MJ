import { BaseEntity, type EntitySaveOptions, type ValidationResult } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { MJEvaluationProtocolEntity } from '@memberjunction/core-entities';
import { EvaluationProtocol } from '@memberjunction/predictive-studio-core';
import { VersionedRowGuard } from './MJPredictionUnitEntityServer.server';

/**
 * `MJ: Evaluation Protocols`: immutable versions plus the protocol's own shape checks.
 */
@RegisterClass(BaseEntity, 'MJ: Evaluation Protocols')
export class MJEvaluationProtocolEntityServer extends MJEvaluationProtocolEntity {
  /** A version-1 row is its own lineage root; the server assigns it on create. */
  public override async Save(options?: EntitySaveOptions): Promise<boolean> {
    VersionedRowGuard.AdoptOwnLineageRoot(this);
    return super.Save(options);
  }

  public override Validate(): ValidationResult {
    return VersionedRowGuard.AddProblems(this, super.Validate(), 'Version', 'Version', () => EvaluationProtocol.GetEvaluationProtocolShapeProblems(this));
  }
}
