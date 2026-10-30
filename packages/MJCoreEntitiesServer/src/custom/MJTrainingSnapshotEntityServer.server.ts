import { BaseEntity, type ValidationResult } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { MJTrainingSnapshotEntity } from '@memberjunction/core-entities';
import { VersionedRowGuard } from './MJPredictionUnitEntityServer.server';

export type SnapshotHashFields = Pick<MJTrainingSnapshotEntity, 'ReadComplete' | 'ContentHash' | 'MatrixSha256' | 'RowManifestSha256' | 'ProvenanceSha256' | 'FeatureSchemaHash'>;

/** `MJ: Training Snapshots`: written once by the snapshot builder, never updated. */
@RegisterClass(BaseEntity, 'MJ: Training Snapshots')
export class MJTrainingSnapshotEntityServer extends MJTrainingSnapshotEntity {
  private static readonly SHA256_HEX = /^[0-9a-f]{64}$/;

  /** A snapshot exists only for a complete read and carries five well-formed hashes. Pure. */
  public static GetTrainingSnapshotRowProblems(row: SnapshotHashFields): string[] {
    const problems: string[] = [];
    if (row.ReadComplete !== true) problems.push('ReadComplete must be true: a snapshot exists only for a complete read');
    for (const [name, value] of [
      ['ContentHash', row.ContentHash], ['MatrixSha256', row.MatrixSha256], ['RowManifestSha256', row.RowManifestSha256],
      ['ProvenanceSha256', row.ProvenanceSha256], ['FeatureSchemaHash', row.FeatureSchemaHash],
    ] as const) {
      if (!MJTrainingSnapshotEntityServer.SHA256_HEX.test(value)) problems.push(`${name} must be 64 lower-case hex characters`);
    }
    return problems;
  }

  public override Validate(): ValidationResult {
    return VersionedRowGuard.AddProblems(this, super.Validate(), 'ContentHash', 'ContentHash', () => MJTrainingSnapshotEntityServer.GetTrainingSnapshotRowProblems(this));
  }
}
