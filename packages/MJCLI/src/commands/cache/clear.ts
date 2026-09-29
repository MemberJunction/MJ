import { Command, Flags } from '@oclif/core';
import { ClearSharedCacheCategories, SHARED_CACHE_WRITE_CATEGORIES } from '@memberjunction/redis-provider';
import { DescribeRedisUrl, ResolveSharedCacheTarget } from '../../lib/shared-cache.js';

/**
 * `mj cache clear` — clear the shared Redis cache and notify every running server.
 *
 * `mj sync push`, `mj codegen` and `mj migrate` do this automatically when REDIS_URL is set. This
 * command is for everything else that changes the database without going through a server: direct
 * SQL, another application, a restore. Each cleared category publishes `category_cleared`, so every
 * subscribed server drops what its engines hold and reloads from the database.
 */
export default class CacheClear extends Command {
  static description = 'Clear the shared Redis cache (REDIS_URL) so every running server reloads from the database';

  static examples = [
    { command: '<%= config.bin %> <%= command.id %>', description: 'Clear RunView, dataset and metadata caches' },
    { command: '<%= config.bin %> <%= command.id %> --dry-run', description: 'Show the target and key counts; delete nothing' },
    { command: '<%= config.bin %> <%= command.id %> --category RunViewCache', description: 'Clear one category' },
  ];

  static flags = {
    'dry-run': Flags.boolean({ description: 'Report the target and how many keys each category holds, without deleting or notifying' }),
    category: Flags.string({
      description: `Category to clear (repeatable). Default: ${SHARED_CACHE_WRITE_CATEGORIES.join(', ')}`,
      multiple: true,
    }),
    url: Flags.string({ description: 'Redis URL. Default: REDIS_URL' }),
    prefix: Flags.string({ description: 'Key prefix. Default: REDIS_KEY_PREFIX, else "mj"' }),
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(CacheClear);
    const target = this.resolveTarget(flags.url, flags.prefix);
    const chosen = flags.category?.length ? flags.category : undefined;
    // An unknown category is a typo, and a typo used to be a silent no-op that still printed
    // "servers will reload" (plan §16.3 #15). Names are matched case-insensitively.
    const unknown = (chosen ?? []).filter(c => !SHARED_CACHE_WRITE_CATEGORIES.some(known => known.toLowerCase() === c.trim().toLowerCase())
        && c.trim().toLowerCase() !== 'default');
    if (unknown.length > 0) {
      this.error(`Unknown cache categor${unknown.length === 1 ? 'y' : 'ies'}: ${unknown.join(', ')}. Known: ${[...SHARED_CACHE_WRITE_CATEGORIES, 'default'].join(', ')}`, { exit: 1 });
    }
    const categories = chosen ?? SHARED_CACHE_WRITE_CATEGORIES;
    const verb = flags['dry-run'] ? 'Would clear' : 'Cleared';

    let results;
    try {
      // With no --category, the metadata snapshot goes too, so servers re-check their metadata.
      results = await ClearSharedCacheCategories({ Connection: target.connection, Categories: categories, IncludeMetadataSnapshot: chosen === undefined, DryRun: flags['dry-run'] });
    } catch (e) {
      this.error(`Could not reach the shared cache at ${target.description}: ${e instanceof Error ? e.message : String(e)}`, { exit: 1 });
    }

    this.log(`${flags['dry-run'] ? 'Target' : 'Shared cache'}: ${target.description}`);
    for (const r of results) {
      if (r.Ok) {
        this.log(`  ${verb} ${r.KeyCount} key(s) in ${r.Category}`);
      } else {
        this.warn(`  FAILED to clear ${r.Category} (${r.KeyCount} key(s) found): ${r.Error ?? 'unknown error'}`);
      }
    }
    const failed = results.filter(r => !r.Ok);
    if (failed.length > 0) {
      this.error(`${failed.length} categor${failed.length === 1 ? 'y' : 'ies'} could not be cleared: ${failed.map(f => f.Category).join(', ')}. Servers may still hold stale data.`, { exit: 1 });
    }
    if (!flags['dry-run']) {
      this.log('Every subscribed server was notified and will reload.');
    }
  }

  private resolveTarget(urlFlag: string | undefined, prefixFlag: string | undefined): { connection: { url: string; keyPrefix: string }; description: string } {
    if (urlFlag) {
      const keyPrefix = prefixFlag ?? process.env.REDIS_KEY_PREFIX ?? 'mj';
      return { connection: { url: urlFlag, keyPrefix }, description: `${DescribeRedisUrl(urlFlag)} (prefix "${keyPrefix}")` };
    }
    const fromEnv = ResolveSharedCacheTarget();
    if (!fromEnv?.Connection.url) {
      this.error('No shared cache configured: set REDIS_URL or pass --url', { exit: 2 });
    }
    const keyPrefix = prefixFlag ?? fromEnv.Connection.keyPrefix ?? 'mj';
    const url = fromEnv.Connection.url;
    return { connection: { url, keyPrefix }, description: `${DescribeRedisUrl(url)} (prefix "${keyPrefix}")` };
  }
}
