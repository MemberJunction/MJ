/**
 * @module snapshot/snapshot-manifest
 *
 * Reading a Training Snapshot's stored files back: the one SHA-256 check every read applies (a stored file whose bytes
 * no longer hash to its column on the snapshot row is refused) and the one manifest reader, which verifies the
 * manifest file and parses every line through the snapshot row-key schema.
 */
import type { MJTrainingSnapshotEntity } from '@memberjunction/core-entities';
import type { SnapshotRowKey } from '@memberjunction/predictive-studio-core';
import { SnapshotHash } from './snapshot-hash';
import type { ISnapshotFileStore } from './snapshot-file-store';
import { SnapshotFiles } from './snapshot-serialization';

/** What a snapshot read verifies: one of the three stored files, or the content hash the row's identity yields. */
export type SnapshotIntegrityTarget = 'matrix' | 'manifest' | 'provenance' | 'content';

/**
 * A stored snapshot file whose bytes no longer match the SHA-256 on its snapshot row (`File` names the file), or a
 * snapshot whose matrix and manifest hashes and identity columns no longer yield its `ContentHash` (`File` is
 * `'content'`).
 */
export class SnapshotIntegrityError extends Error {
  constructor(public readonly File: SnapshotIntegrityTarget, public readonly Expected: string, public readonly Actual: string) {
    super(`Snapshot ${File} sha256 mismatch: stored ${Expected}, read ${Actual}`);
    this.name = 'SnapshotIntegrityError';
  }
}

/** The snapshot row columns the manifest reader reads. */
export type SnapshotManifestRef = Pick<MJTrainingSnapshotEntity, 'RowManifestFileID' | 'RowManifestSha256'>;

/** Verified reads of a snapshot's stored files (static members on one owner). */
export class SnapshotManifest {
  /**
   * The snapshot's row manifest: the file is read through the store, its bytes must hash to the row's
   * `RowManifestSha256`, and every line is checked with the snapshot row-key schema.
   *
   * @throws SnapshotIntegrityError (`manifest`) when the bytes differ from the stored SHA-256
   * @throws SnapshotFileFormatError when a line is not a snapshot row key
   */
  public static async ReadSnapshotManifest(snapshot: SnapshotManifestRef, files: ISnapshotFileStore): Promise<SnapshotRowKey[]> {
    const bytes = await files.Get(snapshot.RowManifestFileID);
    SnapshotManifest.VerifiedSha256('manifest', bytes, snapshot.RowManifestSha256);
    return SnapshotFiles.ParseManifestLines(bytes);
  }

  /**
   * The bytes' SHA-256 when it equals the one stored on the snapshot row; the one check every stored-file read applies.
   *
   * @throws SnapshotIntegrityError naming the file
   */
  public static VerifiedSha256(file: SnapshotIntegrityTarget, bytes: Uint8Array, expected: string): string {
    const actual = SnapshotHash.Sha256Hex(bytes);
    if (actual !== expected) throw new SnapshotIntegrityError(file, expected, actual);
    return actual;
  }
}
