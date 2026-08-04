/**
 * Adapter that fetches a subset of the canonical MemberJunction repository at a
 * given ref using a git **blobless partial clone** (`--filter=blob:none`) plus
 * **sparse-checkout**, so only the blobs for the requested paths come over the
 * wire. This is the network primitive behind the sparse-checkout install path
 * (replacing the bootstrap-zip download) and `mj bundle`.
 *
 * If the git server/client rejects the partial-clone filter, it falls back to a
 * shallow sparse clone (every blob in the sparse cone) and reports the fallback
 * via {@link SparseFetchResult.UsedFallback}.
 *
 * SIDE EFFECTS: clones over the network into a temp directory. The returned
 * {@link SparseFetchResult.Cleanup} MUST be invoked by the caller in a `finally`
 * on every exit path. On any internal failure the temp dir is removed before the
 * error propagates.
 *
 * @module adapters/RepoFetcher
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { simpleGit, type SimpleGit } from 'simple-git';

/** Inputs for a sparse fetch. */
export interface SparseFetchOptions {
  /** Clone URL of the canonical repository. */
  RepoUrl: string;
  /** Branch name or tag to fetch (e.g. `'main'`, `'v5.38.0'`). */
  Ref: string;
  /** Repo-relative paths (files or directories) to check out. */
  Paths: readonly string[];
}

/** Result of a sparse fetch. */
export interface SparseFetchResult {
  /** Absolute path to the temp clone root containing the checked-out paths. */
  Dir: string;
  /** True when the blobless partial clone was unavailable and the shallow sparse fallback was used. */
  UsedFallback: boolean;
  /** Removes the temp clone. Callers MUST invoke this in a `finally` on every exit path. */
  Cleanup: () => Promise<void>;
}

/**
 * Fetches an arbitrary set of repo paths at a ref via partial clone + sparse-checkout.
 */
export class RepoFetcher {
  /**
   * Clone `opts.Paths` from `opts.RepoUrl` at `opts.Ref` into a fresh temp dir.
   *
   * @throws If the repo/ref is unreachable or neither clone strategy succeeds.
   */
  async FetchPaths(opts: SparseFetchOptions): Promise<SparseFetchResult> {
    if (opts.Paths.length === 0) {
      throw new Error('RepoFetcher.FetchPaths requires at least one path');
    }

    const dir = await mkdtemp(path.join(tmpdir(), 'mj-fetch-'));
    const cleanup = async (): Promise<void> => {
      await rm(dir, { recursive: true, force: true });
    };

    try {
      const git = simpleGit(dir);
      const partialOk = await this.tryPartialClone(git, opts, dir);
      const usedFallback = !partialOk;
      if (usedFallback) {
        await this.fullSparseClone(git, opts, dir);
      }
      await this.checkoutPaths(git, opts.Paths);
      return { Dir: dir, UsedFallback: usedFallback, Cleanup: cleanup };
    } catch (err) {
      await cleanup();
      throw err;
    }
  }

  /** Attempts a blobless, no-checkout shallow clone. Returns false if the filter is rejected. */
  private async tryPartialClone(git: SimpleGit, opts: SparseFetchOptions, dir: string): Promise<boolean> {
    try {
      await git.clone(opts.RepoUrl, dir, ['--no-checkout', '--filter=blob:none', '--depth=1', '--branch', opts.Ref]);
      return true;
    } catch {
      return false; // caller falls back to a full sparse clone
    }
  }

  /** Fallback: shallow sparse clone of the whole cone (every blob in the sparse set). */
  private async fullSparseClone(git: SimpleGit, opts: SparseFetchOptions, dir: string): Promise<void> {
    await git.clone(opts.RepoUrl, dir, ['--sparse', '--depth=1', '--branch', opts.Ref]);
  }

  /** Configures the sparse set to exactly `paths` (no-cone, gitignore-style) and checks them out. */
  private async checkoutPaths(git: SimpleGit, paths: readonly string[]): Promise<void> {
    await git.raw(['sparse-checkout', 'set', '--no-cone', ...paths]);
    await git.raw(['checkout']);
  }
}
