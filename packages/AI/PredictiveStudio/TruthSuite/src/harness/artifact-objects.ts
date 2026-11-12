/**
 * Direct access to a model's stored artifact object, for the registry gates (G3.1 removes one, G3.2 swaps one) — the
 * out-of-band damage a reboot or an operator does to storage, which no product path may do. The model's file row
 * (`MJ: Files.ProviderKey`) is read through the harness's provider; the object is the file at that key under
 * `STORAGE_LOCAL_ROOT`, the local file-system storage root MJAPI writes model artifacts to in the gate environment.
 */
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { RunView } from '@memberjunction/core';
import type { MJFileEntity, MJMLModelEntity } from '@memberjunction/core-entities';
import { EscapeSQLString } from '@memberjunction/global';
import { IsSafeStorageObjectKey, NormalizeStorageObjectKey } from '@memberjunction/storage';
import type { TruthHarness } from './types';

/** The storage location of one model's artifact object. */
interface StoredObject {
  /** The file row's `ProviderKey`. */
  readonly ProviderKey: string;
  /** The object's absolute path under `STORAGE_LOCAL_ROOT`. */
  readonly Path: string;
}

/** Remove or overwrite a model's stored artifact object (gate fixtures only). */
export class ArtifactObjects {
  /**
   * Delete the model's stored artifact object, leaving its `MJ: Files` row in place (what a lost disk does).
   *
   * @returns the removed object's `ProviderKey`
   * @throws when `STORAGE_LOCAL_ROOT` is unset, the model has no artifact file, its key is unsafe or the object is absent
   */
  public static async RemoveStoredObject(h: TruthHarness, modelId: string): Promise<string> {
    const stored = await ArtifactObjects.locate(h, modelId);
    ArtifactObjects.assertPresent(stored, modelId);
    rmSync(stored.Path);
    return stored.ProviderKey;
  }

  /**
   * Overwrite `toModelId`'s stored artifact object with `fromModelId`'s bytes, leaving both file rows and both models'
   * registered hashes in place (a swapped artifact).
   *
   * @throws when `STORAGE_LOCAL_ROOT` is unset, either model has no artifact file, a key is unsafe, either object is
   *   absent, or both models name the same object
   */
  public static async CopyStoredObject(h: TruthHarness, fromModelId: string, toModelId: string): Promise<void> {
    const [from, to] = await Promise.all([ArtifactObjects.locate(h, fromModelId), ArtifactObjects.locate(h, toModelId)]);
    ArtifactObjects.assertPresent(from, fromModelId);
    ArtifactObjects.assertPresent(to, toModelId);
    if (from.Path === to.Path) throw new Error(`ML Models ${fromModelId} and ${toModelId} name the same stored object ${from.ProviderKey}`);
    writeFileSync(to.Path, readFileSync(from.Path));
  }

  /** The model's artifact file row and the object's path under the storage root. */
  private static async locate(h: TruthHarness, modelId: string): Promise<StoredObject> {
    const root = ArtifactObjects.storageRoot();
    const fileId = await ArtifactObjects.artifactFileId(h, modelId);
    const key = await ArtifactObjects.providerKey(h, fileId);
    return { ProviderKey: key, Path: ArtifactObjects.ObjectPath(root, fileId, key) };
  }

  /**
   * The absolute path of a storage key under the local storage root, as the local file-system driver resolves it: the
   * key must pass `IsSafeStorageObjectKey` and must not be absolute, is normalized with `NormalizeStorageObjectKey`, and
   * must resolve beneath the root.
   *
   * @param root the resolved storage root
   * @param fileId the `MJ: Files` row the key belongs to (named in errors)
   * @param key the row's `ProviderKey`
   * @throws when the key is unsafe or resolves outside the root
   */
  public static ObjectPath(root: string, fileId: string, key: string): string {
    if (!IsSafeStorageObjectKey(key) || path.isAbsolute(key)) throw new Error(`MJ: Files ${fileId} has an unsafe storage key "${key}"`);
    const full = path.resolve(root, NormalizeStorageObjectKey(key));
    if (!full.startsWith(root + path.sep)) throw new Error(`MJ: Files ${fileId}'s key "${key}" resolves outside STORAGE_LOCAL_ROOT (${root})`);
    return full;
  }

  /** `STORAGE_LOCAL_ROOT`, resolved; throws when it is unset (the object cannot be found without it). */
  private static storageRoot(): string {
    const root = process.env.STORAGE_LOCAL_ROOT?.trim();
    if (!root) throw new Error('STORAGE_LOCAL_ROOT is unset: the registry gates need the local storage root MJAPI writes model artifacts to');
    return path.resolve(root);
  }

  /** The model's `ArtifactFileID`; throws when the model is not found or was never trained. */
  private static async artifactFileId(h: TruthHarness, modelId: string): Promise<string> {
    const r = await RunView.FromMetadataProvider(h.Provider).RunView<Pick<MJMLModelEntity, 'ArtifactFileID'>>({
      EntityName: 'MJ: ML Models', ExtraFilter: `ID='${EscapeSQLString(modelId)}'`, Fields: ['ArtifactFileID'], ResultType: 'simple', BypassCache: true,
    }, h.User);
    if (!r.Success) throw new Error(`reading ML Model ${modelId} failed: ${r.ErrorMessage}`);
    const row = r.Results[0];
    if (!row) throw new Error(`ML Model ${modelId} not found`);
    if (!row.ArtifactFileID) throw new Error(`ML Model ${modelId} has no artifact file`);
    return row.ArtifactFileID;
  }

  /** The file row's `ProviderKey`; throws when the row is gone or has no key (a legacy local file). */
  private static async providerKey(h: TruthHarness, fileId: string): Promise<string> {
    const r = await RunView.FromMetadataProvider(h.Provider).RunView<Pick<MJFileEntity, 'ProviderKey'>>({
      EntityName: 'MJ: Files', ExtraFilter: `ID='${EscapeSQLString(fileId)}'`, Fields: ['ProviderKey'], ResultType: 'simple', BypassCache: true,
    }, h.User);
    if (!r.Success) throw new Error(`reading MJ: Files ${fileId} failed: ${r.ErrorMessage}`);
    const row = r.Results[0];
    if (!row) throw new Error(`MJ: Files ${fileId} not found`);
    if (!row.ProviderKey) throw new Error(`MJ: Files ${fileId} has no ProviderKey (a legacy local artifact, not a storage-provider object)`);
    return row.ProviderKey;
  }

  /** Throws when the object is not on disk: the gate's damage would otherwise be a no-op. */
  private static assertPresent(stored: StoredObject, modelId: string): void {
    if (!existsSync(stored.Path)) throw new Error(`ML Model ${modelId}'s stored object ${stored.ProviderKey} is not at ${stored.Path}`);
  }
}
