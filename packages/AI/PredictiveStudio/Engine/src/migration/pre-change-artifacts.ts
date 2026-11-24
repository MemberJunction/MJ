/**
 * @module migration/pre-change-artifacts
 *
 * The artifact half of §5.6 step 3 (D4-22, D4-61): a model registered before the lifecycle gate (no `Delivery`) has no
 * registered SHA-256, so its artifact is `unverified`. This module checks one such artifact and records what it found:
 *
 * | The model's `MJ: Files` row | Its bytes | Outcome |
 * |---|---|---|
 * | names a storage provider object (a #5001-era upload) | read from the provider | `verified`: the bytes' SHA-256 becomes the registered `ArtifactSha256` (they already sit in provider storage) |
 * | names a local path (no provider key) | on this host's legacy artifact directory | `verified`: the bytes are stored write-once through `ArtifactRegistry.Store`, and the model points at that file |
 * | names a local path | not on this host | `legacy-local` (final: the bytes may be on another host) |
 * | names a provider object that is gone, or no row, or the model names no file | — | `missing` (final) |
 * | either, with bytes whose hash differs from the one the caller expects | — | `hash-mismatch` |
 *
 * It is light on purpose (the artifact registry and the stored rows only): the scoring service calls
 * {@link PreChangeArtifacts.Migrate} for a model it is about to serve while Unevaluated whose artifact the registry
 * job has not reached yet, so serving never waits for the job. Every read and write runs on `ctx.Provider` as
 * `ctx.ContextUser`; the first `ArtifactSha256` of an existing row is authorised through `EvidenceWriteAuthorisations`
 * for that save only (the evidence guard refuses it otherwise).
 */
import type { MJFileEntity, MJMLModelEntity } from '@memberjunction/core-entities';
import type { StoredFile } from '@memberjunction/predictive-studio-core';

import { ArtifactRegistry } from '../registry/artifact-registry';
import { EvidenceWriteAuthorisations, type BackFilledEvidenceField } from '../registry/evidence-write-authorisations';
import { GuardContexts } from '../registry/guard-context';
import type { RegistryContext } from '../registry/registry-context';
import { StorageProviderArtifactLoader } from '../scoring/storage-provider-artifact-loader';
import type { IArtifactLoader } from '../scoring/types';
import { SnapshotHash } from '../snapshot/snapshot-hash';

/** What one check of a pre-change artifact found (nothing saved yet). */
export type PreChangeArtifactCheck =
  /** The bytes verified and in provider storage (stored now when they were local); `File` is their registered file. */
  | { readonly Kind: 'verified'; readonly File: StoredFile; readonly Stored: boolean }
  | { readonly Kind: 'legacy-local' | 'missing'; readonly Detail: string }
  | { readonly Kind: 'hash-mismatch'; readonly Expected: string; readonly Actual: string };

/** What {@link PreChangeArtifacts.Migrate} did to one model. */
export type PreChangeArtifactOutcome =
  | { readonly Kind: 'unchanged'; readonly ModelID: string; readonly ArtifactStatus: MJMLModelEntity['ArtifactStatus'] }
  | { readonly Kind: 'recorded'; readonly ModelID: string; readonly ArtifactStatus: MJMLModelEntity['ArtifactStatus']; readonly Check: PreChangeArtifactCheck };

/** Checks and records the artifacts of models registered before the lifecycle gate. */
export class PreChangeArtifacts {
  /**
   * Checks the model's artifact as the module's table says, storing local bytes write-once through the artifact
   * registry (so a `verified` result always names a provider-storage file). Saves nothing on the model.
   *
   * @param expectedSha256 the hash the bytes must have (the trainer's returned artifact, for a model with a stored gate
   *   record); null to accept the model's registered `ArtifactSha256` when it has one, else any bytes
   * @throws Error when storage cannot be read (a later run may succeed), or the store fails
   */
  public static async Check(model: MJMLModelEntity, ctx: RegistryContext, loader: IArtifactLoader, expectedSha256: string | null): Promise<PreChangeArtifactCheck> {
    const fileId = model.ArtifactFileID;
    if (!fileId) return { Kind: 'missing', Detail: `ML Model ${model.ID} names no artifact file` };
    const file = await GuardContexts.ReadById<Pick<MJFileEntity, 'ID' | 'ProviderID' | 'ProviderKey'>>('MJ: Files', fileId, ['ID', 'ProviderID', 'ProviderKey'], ctx);
    if (file === null) return { Kind: 'missing', Detail: `the artifact file ${fileId} of ML Model ${model.ID} has no MJ: Files row` };
    const read = await loader.load(fileId, ctx.ContextUser, ctx.Provider);
    if (read.Kind === 'absent') {
      return file.ProviderKey
        ? { Kind: 'missing', Detail: `the stored object of artifact file ${fileId} is gone` }
        : { Kind: 'legacy-local', Detail: `artifact file ${fileId} names a local path whose bytes are not on this host` };
    }
    const actual = SnapshotHash.Sha256Hex(read.Bytes);
    const expected = (expectedSha256 || model.ArtifactSha256 || '').trim().toLowerCase();
    if (expected.length > 0 && expected !== actual) return { Kind: 'hash-mismatch', Expected: expected, Actual: actual };
    if (file.ProviderKey) {
      return {
        Kind: 'verified', Stored: false,
        File: { fileId: file.ID, storageProviderId: file.ProviderID, providerKey: file.ProviderKey, sha256: actual, sizeBytes: read.Bytes.byteLength, writeOnce: true },
      };
    }
    const stored = await ArtifactRegistry.ForContext(ctx, loader).Store(read.Bytes, `pre-change-model-${model.ID}.bin`, ctx);
    if (stored.sha256 !== actual) return { Kind: 'hash-mismatch', Expected: actual, Actual: stored.sha256 };
    return { Kind: 'verified', Stored: true, File: stored };
  }

  /**
   * One pre-change model's artifact, checked and recorded: a model whose `ArtifactStatus` is not `unverified` is left
   * as it is (`unchanged`; every other state is final for a pre-change row, or the gate's); otherwise
   * {@link Check}, then `ArtifactStatus` (and, when verified, `ArtifactFileID` and `ArtifactSha256`) saved with
   * `ArtifactCheckedAt`. The save changes no lifecycle `Status`.
   *
   * @throws Error when storage cannot be read, the store fails, or the save fails (with the entity's message)
   */
  public static async Migrate(model: MJMLModelEntity, ctx: RegistryContext, loader: IArtifactLoader = new StorageProviderArtifactLoader()): Promise<PreChangeArtifactOutcome> {
    if (model.ArtifactStatus !== 'unverified') return { Kind: 'unchanged', ModelID: model.ID, ArtifactStatus: model.ArtifactStatus };
    const check = await PreChangeArtifacts.Check(model, ctx, loader, null);
    await PreChangeArtifacts.Record(model, check);
    return { Kind: 'recorded', ModelID: model.ID, ArtifactStatus: model.ArtifactStatus, Check: check };
  }

  /**
   * Saves what a check found on the model: a verified file's ID and hash (the hash's first write authorised for this
   * save) and `verified`, or the final state; `ArtifactCheckedAt` now.
   *
   * @throws Error when the save fails
   */
  public static async Record(model: MJMLModelEntity, check: PreChangeArtifactCheck): Promise<void> {
    const firstWrites: BackFilledEvidenceField[] = [];
    if (check.Kind === 'verified') {
      if (!model.ArtifactSha256) firstWrites.push('ArtifactSha256');
      model.ArtifactFileID = check.File.fileId;
      model.ArtifactSha256 = check.File.sha256;
    }
    model.ArtifactStatus = PreChangeArtifacts.StatusOf(check);
    model.ArtifactCheckedAt = new Date();
    await PreChangeArtifacts.SaveAuthorised(model, firstWrites);
  }

  /** The `ArtifactStatus` a check records. Pure. */
  public static StatusOf(check: PreChangeArtifactCheck): MJMLModelEntity['ArtifactStatus'] {
    return check.Kind;
  }

  /** Words for a check that did not verify, for a refusal or a log line. Pure. */
  public static Describe(check: Exclude<PreChangeArtifactCheck, { readonly Kind: 'verified' }>): string {
    return check.Kind === 'hash-mismatch' ? `the stored bytes hash to ${check.Actual}, not ${check.Expected}` : check.Detail;
  }

  /**
   * Saves the model with the first writes of `fields` authorised for this save only; an authorisation the save did
   * not take is dropped.
   *
   * @throws Error naming the save's message when the save fails
   */
  public static async SaveAuthorised(model: MJMLModelEntity, fields: readonly BackFilledEvidenceField[]): Promise<void> {
    if (fields.length > 0) EvidenceWriteAuthorisations.Instance.Authorise(model, fields);
    try {
      if (!(await model.Save())) throw new Error(`Saving the pre-change registry entry of ML Model ${model.ID} failed: ${model.LatestResult?.CompleteMessage || 'unknown error'}`);
    } finally {
      EvidenceWriteAuthorisations.Instance.Revoke(model);
    }
  }
}
