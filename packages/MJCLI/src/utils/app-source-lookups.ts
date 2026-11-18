/**
 * Version lookups for `mj app check-updates`, read through each app's source: GitHub tags for a
 * repository URL, the folder's mj-app.json for a `file:` locator.
 */
import { ResolveAppSource, type GitHubClientOptions } from '@memberjunction/open-app-engine';
import type { LatestVersionLookup, UnresolvedReasonLookup } from './update-check.js';

/** The two lookups {@link CheckAppsForUpdates} takes. */
export interface AppVersionLookups {
  LookupLatestVersion: LatestVersionLookup;
  DescribeUnresolved: UnresolvedReasonLookup;
}

/**
 * Builds the version lookups for installed apps.
 *
 * @param gitHubOptions - The same GitHub options `mj app install` / `upgrade` use
 * @param repoRoot - Absolute path of the repository root, where `file:` locators start
 */
export function BuildAppVersionLookups(gitHubOptions: GitHubClientOptions, repoRoot: string): AppVersionLookups {
  const resolve = (repositoryUrl: string, subpath?: string) =>
    ResolveAppSource(repositoryUrl, { GitHubOptions: gitHubOptions, Subpath: subpath, RepoRoot: repoRoot });
  return {
    LookupLatestVersion: (repositoryUrl, subpath) => resolve(repositoryUrl, subpath).GetLatestVersion(),
    DescribeUnresolved: (repositoryUrl, subpath) => resolve(repositoryUrl, subpath).DescribeUnresolvedVersion(),
  };
}
