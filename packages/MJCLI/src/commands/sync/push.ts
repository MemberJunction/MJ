/**
 * oclif entry for `mj sync push`. The logic lives in {@link SyncPushPlugin} in
 * `@memberjunction/metadata-sync/plugins`; this subclass only adds the shared-cache clear that must
 * follow a database write, before the plugin's Cleanup() ends the process. Running servers never
 * hear about rows written here, so without the clear they keep serving the old ones.
 *
 * The clear runs only when the push may have changed the database:
 * - A successful push clears unless it reports that it wrote nothing: it was cancelled before
 *   writing, or it created, updated and deleted no rows. Clearing after a no-op push would drop
 *   every server's cache on every deploy for nothing.
 * - A failed push clears only when it left something behind. An atomic push (the default) rolls its
 *   writes back, and `PushAbortedError` says so: `rolledBack`, plus the rows a non-atomic push
 *   committed anyway.
 * - When the outcome cannot be read, the clear still runs: a needless reload is cheaper than a fleet
 *   serving rows that are no longer in the database.
 */
import { Flags } from '@oclif/core';
import type { MJCLIResult, PluginUsage } from '@memberjunction/cli-core';
import { SyncPushPlugin } from '@memberjunction/metadata-sync/plugins';
import { PushAbortedError } from '@memberjunction/metadata-sync';
import { AppendSharedCacheClear, ClearSharedCacheAfterWrite, SKIP_CACHE_CLEAR_ENV } from '../../lib/shared-cache.js';
import type { SharedCacheClearReport } from '../../lib/shared-cache.js';

type SyncPushCacheFlags = { 'dry-run'?: boolean; 'skip-cache-clear'?: boolean };

export default class SyncPush extends SyncPushPlugin {
  static flags = {
    ...SyncPushPlugin.flags,
    'skip-cache-clear': Flags.boolean({
      description: `Do not clear the shared Redis cache (REDIS_URL) after pushing. Also: ${SKIP_CACHE_CLEAR_ENV}=1`,
    }),
  };

  static Usage: PluginUsage = {
    ...SyncPushPlugin.Usage,
    flags: [
      ...(SyncPushPlugin.Usage?.flags ?? []),
      { name: '--skip-cache-clear', type: 'boolean', description: 'Do not clear the shared Redis cache after pushing' },
    ],
  };

  protected override async Execute(): Promise<MJCLIResult> {
    let result: MJCLIResult;
    try {
      result = await super.Execute();
    } catch (error) {
      // Runs after the plugin's rollback, so servers reload whatever the push did commit.
      if (this.failedPushLeftWrites(undefined, error)) {
        const report = await this.clearSharedCache('mj sync push (failed)');
        if (report) {
          this.Host.Log(report.Message, report.Ok ? 'info' : 'warn');
        }
      }
      throw error;
    }
    if (!result.success && !this.failedPushLeftWrites(result, undefined)) {
      return result; // rolled back cleanly: nothing in the database changed, so nothing is stale
    }
    if (result.success && this.successfulPushWroteNothing(result)) {
      return result; // cancelled, or a no-op: nothing in the database changed
    }
    const report = await this.clearSharedCache(result.success ? 'mj sync push' : 'mj sync push (failed)');
    return AppendSharedCacheClear(result, report, this.Host);
  }

  /**
   * Whether a failed push left rows in the database. False only when the outcome positively says
   * the push rolled back and committed nothing; anything unreadable counts as "it may have".
   */
  private failedPushLeftWrites(result: MJCLIResult | undefined, error: unknown): boolean {
    if (error instanceof PushAbortedError) {
      return !error.rolledBack || error.committedWrites.length > 0;
    }
    if (error) {
      return true; // an error the push did not describe
    }
    const data = result?.data as { rolledBack?: boolean; committedOutsideTransaction?: number } | undefined;
    if (typeof data?.rolledBack !== 'boolean') {
      return true;
    }
    return !data.rolledBack || (data.committedOutsideTransaction ?? 0) > 0;
  }

  /**
   * Whether a successful push positively reports that it wrote nothing: it was cancelled before
   * writing, or it created, updated and deleted no rows. A result without those counts counts as
   * "it may have written".
   */
  private successfulPushWroteNothing(result: MJCLIResult): boolean {
    const data = result.data as { cancelled?: boolean; created?: number; updated?: number; deleted?: number } | undefined;
    if (data?.cancelled === true) {
      return true;
    }
    if (typeof data?.created !== 'number' || typeof data.updated !== 'number' || typeof data.deleted !== 'number') {
      return false;
    }
    return data.created + data.updated + data.deleted === 0;
  }

  /** Clears the shared cache unless this was a dry run (which writes nothing). */
  private async clearSharedCache(commandName: string): Promise<SharedCacheClearReport | null> {
    const flags = this.GetFlags<SyncPushCacheFlags>();
    return flags['dry-run'] ? null : ClearSharedCacheAfterWrite(commandName, flags['skip-cache-clear']);
  }
}
