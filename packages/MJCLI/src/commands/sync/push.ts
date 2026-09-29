/**
 * oclif entry for `mj sync push`. The logic lives in {@link SyncPushPlugin} in
 * `@memberjunction/metadata-sync/plugins` (plan §3, open-question #2 "shim" approach); this
 * subclass only adds the shared-cache clear that must follow a database write (#4083), before the
 * plugin's Cleanup() ends the process.
 *
 * The cache is cleared after every push that is not a dry run, including one that failed or threw:
 * a push is not all-or-nothing (record graphs commit on their own connections before a later
 * failure rolls back the rest), so a failed push can still have changed the database.
 */
import { Flags } from '@oclif/core';
import type { MJCLIResult, PluginUsage } from '@memberjunction/cli-core';
import { SyncPushPlugin } from '@memberjunction/metadata-sync/plugins';
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
      const report = await this.clearSharedCache('mj sync push (failed)');
      if (report) {
        this.Host.Log(report.Message, report.Ok ? 'info' : 'warn');
      }
      throw error;
    }
    const report = await this.clearSharedCache(result.success ? 'mj sync push' : 'mj sync push (failed)');
    return AppendSharedCacheClear(result, report, this.Host);
  }

  /** Clears the shared cache unless this was a dry run (which writes nothing). */
  private async clearSharedCache(commandName: string): Promise<SharedCacheClearReport | null> {
    const flags = this.GetFlags<SyncPushCacheFlags>();
    return flags['dry-run'] ? null : ClearSharedCacheAfterWrite(commandName, flags['skip-cache-clear']);
  }
}
