/**
 * Produces a self-contained MemberJunction distribution zip on demand — the
 * offline/air-gapped convenience that replaces the committed bootstrap zip.
 *
 * The zip is assembled from either a remote ref (fetched via sparse-checkout) or
 * a local working tree, using the same {@link DistributionAssembler} the install
 * path uses, so a bundle is byte-equivalent to what `mj install` would lay down.
 *
 * @module distribution/createBundle
 */

import { RepoFetcher } from '../adapters/RepoFetcher.js';
import { DistributionAssembler, distributionSourcePaths, type DbPlatform } from './DistributionAssembler.js';

/** Default canonical MemberJunction clone URL used when bundling from a ref. */
const DEFAULT_REPO_URL = 'https://github.com/MemberJunction/MJ.git';

/** Inputs for {@link createDistributionBundle}. Provide exactly one of `SourceDir` or `Ref`. */
export interface CreateBundleOptions {
  /** Absolute path to write the output zip. */
  Out: string;
  /** Branch/tag to fetch and bundle (e.g. `'main'`, `'v5.38.0'`). Ignored when `SourceDir` is set. */
  Ref?: string;
  /** Clone URL when bundling from a ref (defaults to the canonical MJ repo). */
  RepoUrl?: string;
  /** Local working-tree directory to bundle instead of fetching from a ref. */
  SourceDir?: string;
  /** Include the migration tree(s) so an air-gapped `mj migrate` can run offline. */
  IncludeMigrations?: boolean;
  /**
   * Narrow the bundled migrations to one platform's tree when `IncludeMigrations`
   * is set. Omitted = both `migrations/` (SQL Server) and `migrations-pg/`
   * (PostgreSQL), so the bundle works against either database offline.
   */
  MigrationPlatform?: DbPlatform;
}

/** Result of {@link createDistributionBundle}. */
export interface CreateBundleResult {
  /** Absolute path of the written zip. */
  Out: string;
  /** Number of entries written into the zip. */
  EntryCount: number;
  /** Where the source came from. */
  Source: 'local' | 'fetch';
  /** True when a ref fetch fell back from blobless partial clone to a full sparse clone. */
  UsedFallback: boolean;
}

/**
 * Assemble a distribution zip from a local source dir or a fetched ref.
 *
 * SIDE EFFECTS: writes the zip at `opts.Out`; when fetching, clones over the
 * network into a temp dir that is always cleaned up.
 *
 * @throws If neither `SourceDir` nor `Ref` is provided, or if fetch/assembly fails.
 */
export async function createDistributionBundle(opts: CreateBundleOptions): Promise<CreateBundleResult> {
  const assembler = new DistributionAssembler();
  const includeMigrations = opts.IncludeMigrations ?? false;
  const migrationPlatform = opts.MigrationPlatform;

  if (opts.SourceDir) {
    const ops = await assembler.AssembleToZip(
      { SourceDir: opts.SourceDir, IncludeMigrations: includeMigrations, MigrationPlatform: migrationPlatform },
      opts.Out,
    );
    return { Out: opts.Out, EntryCount: ops.length, Source: 'local', UsedFallback: false };
  }

  if (!opts.Ref) {
    throw new Error('createDistributionBundle requires either SourceDir or Ref');
  }

  const fetched = await new RepoFetcher().FetchPaths({
    RepoUrl: opts.RepoUrl ?? DEFAULT_REPO_URL,
    Ref: opts.Ref,
    Paths: distributionSourcePaths(includeMigrations, migrationPlatform),
  });

  try {
    const ops = await assembler.AssembleToZip({ SourceDir: fetched.Dir, IncludeMigrations: includeMigrations, MigrationPlatform: migrationPlatform }, opts.Out);
    return { Out: opts.Out, EntryCount: ops.length, Source: 'fetch', UsedFallback: fetched.UsedFallback };
  } finally {
    await fetched.Cleanup();
  }
}
