/**
 * Update-availability logic for `mj app check-updates`, kept in its own module with no
 * provider/oclif imports so it is directly unit-testable.
 *
 * The version lookup is injected rather than imported so a test never needs a GitHub token or a
 * network round-trip. Production passes the engine's `GetLatestVersion`.
 */

/** The subset of `InstalledAppInfo` this check needs. */
export type UpdateCheckApp = {
  Name: string;
  Version: string;
  RepositoryURL: string;
  /** In-repo path for a multi-app repo; drives scoped-tag resolution. */
  Subpath?: string | null;
};

/** Resolves the newest published version of an app, or null/undefined when none is found. */
export type LatestVersionLookup = (
  repositoryUrl: string,
  subpath?: string
) => Promise<string | null | undefined>;

export type AvailableUpdate = { Name: string; Current: string; Latest: string };
export type UpdateCheckFailure = { Name: string; Message: string };
export type UnresolvedApp = { Name: string; Current: string; Reason: string };

export type UpdateCheckReport = {
  Updates: AvailableUpdate[];
  /**
   * Apps whose check could not complete. Reported separately and never folded into
   * "all apps are up to date" — a rate-limited or unreachable repo is an UNKNOWN, not a no-op.
   */
  Failures: UpdateCheckFailure[];
  /**
   * Apps whose lookup returned successfully but produced NO version at all.
   *
   * This is a third outcome, distinct from both "up to date" and "the call failed", and it must
   * never be folded into the green line. Every app in this list is *installed*, so it was resolved
   * from a real ref at install time — a lookup that now finds nothing means the resolver and the
   * repository disagree, not that the app has no releases.
   *
   * The concrete case that motivates it: `ListGitHubTags` reads a single page of the GitHub tags
   * API, so in a repository with more tags than one page an app's scoped `<subpath>@<semver>` tag
   * line can be entirely invisible. Every app resolves to null and the command would otherwise
   * print a confident "All apps are up to date" while real upgrades exist.
   */
  Unresolved: UnresolvedApp[];
};

/**
 * Checks each installed app for a newer published version.
 *
 * Three properties this function exists to guarantee:
 *  - **Scoped-tag correctness.** Each app's `Subpath` is passed through. A multi-app repo versions
 *    each app with a `<subpath>@<semver>` tag; without the subpath the lookup falls back to
 *    repo-wide `v*` tags and reports a SIBLING app's version as this app's latest.
 *  - **Per-app isolation.** One failing app never aborts the sweep, and never silently disappears.
 *  - **No unknown is ever reported as green.** A throw and an empty result are different kinds of
 *    unknown, but neither one is evidence that the installed version is current.
 */
export async function CheckAppsForUpdates(
  apps: readonly UpdateCheckApp[],
  lookupLatestVersion: LatestVersionLookup
): Promise<UpdateCheckReport> {
  const updates: AvailableUpdate[] = [];
  const failures: UpdateCheckFailure[] = [];
  const unresolved: UnresolvedApp[] = [];

  for (const app of apps) {
    const subpath = app.Subpath ?? undefined;
    try {
      const latest = await lookupLatestVersion(app.RepositoryURL, subpath);
      if (!latest) {
        unresolved.push({
          Name: app.Name,
          Current: app.Version,
          Reason: subpath
            ? `no '${subpath}@<version>' tags found in ${app.RepositoryURL}`
            : `no version tags or releases found in ${app.RepositoryURL}`,
        });
      } else if (latest !== app.Version) {
        updates.push({ Name: app.Name, Current: app.Version, Latest: latest });
      }
    } catch (error: unknown) {
      failures.push({
        Name: app.Name,
        Message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { Updates: updates, Failures: failures, Unresolved: unresolved };
}
