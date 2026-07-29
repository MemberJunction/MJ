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

export type UpdateCheckReport = {
  Updates: AvailableUpdate[];
  /**
   * Apps whose check could not complete. Reported separately and never folded into
   * "all apps are up to date" — a rate-limited or unreachable repo is an UNKNOWN, not a no-op.
   */
  Failures: UpdateCheckFailure[];
};

/**
 * Checks each installed app for a newer published version.
 *
 * Two properties this function exists to guarantee:
 *  - **Scoped-tag correctness.** Each app's `Subpath` is passed through. A multi-app repo versions
 *    each app with a `<subpath>@<semver>` tag; without the subpath the lookup falls back to
 *    repo-wide `v*` tags and reports a SIBLING app's version as this app's latest.
 *  - **Per-app isolation.** One failing app never aborts the sweep, and never silently disappears.
 */
export async function CheckAppsForUpdates(
  apps: readonly UpdateCheckApp[],
  lookupLatestVersion: LatestVersionLookup
): Promise<UpdateCheckReport> {
  const updates: AvailableUpdate[] = [];
  const failures: UpdateCheckFailure[] = [];

  for (const app of apps) {
    try {
      const latest = await lookupLatestVersion(app.RepositoryURL, app.Subpath ?? undefined);
      if (latest && latest !== app.Version) {
        updates.push({ Name: app.Name, Current: app.Version, Latest: latest });
      }
    } catch (error: unknown) {
      failures.push({
        Name: app.Name,
        Message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { Updates: updates, Failures: failures };
}
