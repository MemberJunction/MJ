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

/**
 * One line of `mj app check-updates` output, tagged with its role so the command can colour it.
 *
 * Colour lives in the command; the DECISION of which lines exist lives here. That split is the
 * point: the load-bearing rule below is that the reassuring headline is a positive claim, and
 * the code enforcing it is worth a test that does not need oclif, a terminal, or a network.
 */
export type UpdateCheckLine = {
  Kind: 'up-to-date' | 'inconclusive' | 'updates-header' | 'update' | 'upgrade-hint'
      | 'failures-header' | 'failure' | 'failures-note'
      | 'unresolved-header' | 'unresolved' | 'unresolved-note';
  Text: string;
};

/**
 * Renders a report into the lines the command prints, in order.
 *
 * The invariant: **`up-to-date` is emitted only when every app actually produced an answer.**
 * An app that threw, and an app that resolved to no version at all, are both unknowns — printing
 * "All apps are up to date" over either one is precisely the failure this command exists to
 * avoid, and it is the bug that shipped when a null lookup was folded into "no update available".
 */
export function FormatUpdateCheckReport(report: UpdateCheckReport): UpdateCheckLine[] {
  const { Updates, Failures, Unresolved } = report;
  const lines: UpdateCheckLine[] = [];

  if (Updates.length === 0) {
    lines.push(
      Failures.length === 0 && Unresolved.length === 0
        ? { Kind: 'up-to-date', Text: 'All apps are up to date.' }
        : { Kind: 'inconclusive', Text: 'No updates found, but some apps could not be checked (see below).' }
    );
  } else {
    lines.push({ Kind: 'updates-header', Text: 'Updates available:' });
    for (const u of Updates) {
      lines.push({ Kind: 'update', Text: `${u.Name}: ${u.Current} -> ${u.Latest}` });
    }
    lines.push({ Kind: 'upgrade-hint', Text: 'Run mj app upgrade <name> to upgrade.' });
  }

  if (Failures.length > 0) {
    lines.push({ Kind: 'failures-header', Text: `Could not check ${Failures.length} app(s):` });
    for (const f of Failures) {
      lines.push({ Kind: 'failure', Text: `${f.Name}: ${f.Message}` });
    }
    lines.push({
      Kind: 'failures-note',
      Text: 'These apps may or may not have updates — the check did not complete for them.',
    });
  }

  if (Unresolved.length > 0) {
    lines.push({
      Kind: 'unresolved-header',
      Text: `No published version could be resolved for ${Unresolved.length} app(s):`,
    });
    for (const a of Unresolved) {
      lines.push({ Kind: 'unresolved', Text: `${a.Name} (installed ${a.Current}): ${a.Reason}` });
    }
    lines.push({
      Kind: 'unresolved-note',
      Text: 'These apps were installed from a real ref, so finding no version now means the lookup '
          + 'and the repository disagree — treat this as UNKNOWN, not as up to date.',
    });
  }

  return lines;
}
