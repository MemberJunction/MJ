/**
 * oclif entry for `mj codegen`. The logic lives in {@link CodeGenPlugin} in
 * `@memberjunction/codegen-lib/plugins` (plan §3; see sync/push.ts for the shim rationale); this
 * subclass only adds the shared-cache clear that must follow a database change (#4083).
 */
import { Flags } from '@oclif/core';
import type { MJCLIResult, PluginUsage } from '@memberjunction/cli-core';
import { CodeGenPlugin } from '@memberjunction/codegen-lib/plugins';
import { AppendSharedCacheClear, ClearSharedCacheAfterWrite, SKIP_CACHE_CLEAR_ENV } from '../../lib/shared-cache.js';

type CodeGenCacheFlags = { skipdb?: boolean; 'skip-cache-clear'?: boolean };

export default class CodeGen extends CodeGenPlugin {
  static flags = {
    ...CodeGenPlugin.flags,
    'skip-cache-clear': Flags.boolean({
      description: `Do not clear the shared Redis cache (REDIS_URL) after a run that touched the database. Also: ${SKIP_CACHE_CLEAR_ENV}=1`,
    }),
  };

  static Usage: PluginUsage = {
    ...CodeGenPlugin.Usage,
    flags: [
      ...(CodeGenPlugin.Usage?.flags ?? []),
      { name: '--skip-cache-clear', type: 'boolean', description: 'Do not clear the shared Redis cache after the run' },
    ],
  };

  protected override async Execute(): Promise<MJCLIResult> {
    const result = await super.Execute();
    const flags = this.GetFlags<CodeGenCacheFlags>();
    // `--skipdb` wrote nothing to the database, so there is nothing to invalidate. Everything else
    // clears — including a FAILED run: codegen applies views, stored procedures and entity metadata
    // as it goes, so a run that fails at a later stage has already changed the database, and the
    // servers that cached the old shape never find out (the same policy `mj migrate` and
    // `mj sync push` follow; plan §22).
    if (flags.skipdb) {
      return result;
    }
    const commandName = result.success ? 'mj codegen' : 'mj codegen (failed)';
    return AppendSharedCacheClear(result, await ClearSharedCacheAfterWrite(commandName, flags['skip-cache-clear']), this.Host);
  }
}
