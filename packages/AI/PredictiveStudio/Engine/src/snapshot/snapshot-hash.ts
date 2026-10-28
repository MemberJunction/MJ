/**
 * @module snapshot/snapshot-hash
 *
 * The byte hash of the Training Snapshot files and content hash. Canonical JSON is MJ's existing `Canonicalize` from
 * `@memberjunction/global` (keys sorted at every depth, no whitespace), the canonicalizer Feature Pipelines' content
 * hash uses, so this module adds only SHA-256.
 */
import { createHash } from 'node:crypto';

/** SHA-256 hashing of snapshot bytes and canonical-JSON strings, as a static member on one owner class. */
export class SnapshotHash {
  /** SHA-256 of bytes or a UTF-8 string, lower-case hex: every Training Snapshot file and content hash. */
  public static Sha256Hex(data: Uint8Array | string): string {
    return createHash('sha256').update(data).digest('hex');
  }
}
