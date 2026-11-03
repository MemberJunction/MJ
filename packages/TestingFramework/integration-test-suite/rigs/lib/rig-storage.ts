/**
 * rig-storage.ts — the File Storage Provider a training rig stores its artifacts through.
 *
 * Training stores its artifacts through the active File Storage Provider. A rig makes one available exactly as the gate
 * harness does, by calling the harness's own helper (`HarnessFileStorage`): when none is active it switches the first
 * by priority on — only on a private truth-suite database (`MJ_PS_PR<n>_<agent>` or CI's `test`), and refuses on any
 * other database with no active provider — and the rig puts it back to its earlier `IsActive` afterwards.
 */
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { HarnessFileStorage, type FileStorageActivation } from '@memberjunction/predictive-studio-truth-suite';

/** Making a File Storage Provider available for a rig's run, and putting it back afterwards. */
export class RigStorage {
  /** Makes sure a provider is active; returns the activation to undo, or null when one already was. */
  public static async Activate(provider: IMetadataProvider, user: UserInfo): Promise<FileStorageActivation | null> {
    const activation = await HarnessFileStorage.EnsureActive(provider, user);
    console.log(JSON.stringify({ storage: activation === null ? 'a File Storage Provider was already active' : `switched provider ${activation.ProviderID} on for the run` }));
    return activation;
  }

  /** Puts back the provider {@link Activate} switched on (nothing when it returned null). */
  public static async Restore(provider: IMetadataProvider, user: UserInfo, activation: FileStorageActivation | null): Promise<void> {
    if (activation === null) return;
    await HarnessFileStorage.Restore(provider, user, activation);
    console.log(JSON.stringify({ storage: `put provider ${activation.ProviderID} back to IsActive=${activation.PriorIsActive}` }));
  }
}
