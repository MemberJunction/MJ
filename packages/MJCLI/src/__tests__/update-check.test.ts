/**
 * Tests for `mj app check-updates` version resolution.
 *
 * Two defects this pins:
 *  1. **Dropped `Subpath`.** A multi-app repo versions each app with a scoped `<subpath>@<semver>`
 *     tag. The command called the lookup without the app's subpath, so resolution fell back to
 *     repo-wide `v*` tags and reported a SIBLING app's version as this app's latest — a wrong
 *     "upgrade available" (or a wrong "up to date") with no error anywhere.
 *  2. **No per-app isolation.** A single unreachable / rate-limited / private repo threw out of the
 *     loop, so the whole command failed — or worse, the app silently vanished from a report that
 *     still concluded "All apps are up to date."
 */
import { describe, it, expect, vi } from 'vitest';
import {
    CheckAppsForUpdates,
    FormatUpdateCheckReport,
    type UpdateCheckApp,
    type LatestVersionLookup,
    type UpdateCheckReport,
} from '../utils/update-check.js';

function app(overrides: Partial<UpdateCheckApp> = {}): UpdateCheckApp {
    return {
        Name: 'App One',
        Version: '1.0.0',
        RepositoryURL: 'https://github.com/acme/apps',
        Subpath: null,
        ...overrides,
    };
}

describe('CheckAppsForUpdates — subpath threading', () => {
    it('passes each app\'s Subpath through to the lookup', async () => {
        const lookup = vi.fn<LatestVersionLookup>().mockResolvedValue('1.0.0');

        await CheckAppsForUpdates(
            [
                app({ Name: 'Alpha', Subpath: 'apps/alpha' }),
                app({ Name: 'Beta', Subpath: 'apps/beta' }),
            ],
            lookup
        );

        expect(lookup).toHaveBeenNthCalledWith(1, 'https://github.com/acme/apps', 'apps/alpha');
        expect(lookup).toHaveBeenNthCalledWith(2, 'https://github.com/acme/apps', 'apps/beta');
    });

    it('normalizes a null/absent Subpath to undefined (single-app repo → repo-wide tags)', async () => {
        const lookup = vi.fn<LatestVersionLookup>().mockResolvedValue('1.0.0');

        await CheckAppsForUpdates([app({ Subpath: null }), app({ Name: 'Two', Subpath: undefined })], lookup);

        expect(lookup).toHaveBeenNthCalledWith(1, 'https://github.com/acme/apps', undefined);
        expect(lookup).toHaveBeenNthCalledWith(2, 'https://github.com/acme/apps', undefined);
    });

    it('does not report an update when a sibling app in the same repo is newer', async () => {
        // The concrete #1 symptom: both apps live in one repo. Scoped lookup returns each app's OWN
        // latest; the repo-wide fallback would have returned 'apps/beta@2.0.0' for BOTH.
        const lookup = vi.fn<LatestVersionLookup>().mockImplementation(async (_repo, subpath) =>
            subpath === 'apps/beta' ? '2.0.0' : '1.0.0'
        );

        const report = await CheckAppsForUpdates(
            [
                app({ Name: 'Alpha', Version: '1.0.0', Subpath: 'apps/alpha' }),
                app({ Name: 'Beta', Version: '1.0.0', Subpath: 'apps/beta' }),
            ],
            lookup
        );

        expect(report.Updates).toEqual([{ Name: 'Beta', Current: '1.0.0', Latest: '2.0.0' }]);
        expect(report.Failures).toEqual([]);
    });
});

describe('CheckAppsForUpdates — update detection', () => {
    it('reports an app whose latest differs from its installed version', async () => {
        const report = await CheckAppsForUpdates(
            [app({ Version: '1.0.0' })],
            async () => '1.2.0'
        );

        expect(report.Updates).toEqual([{ Name: 'App One', Current: '1.0.0', Latest: '1.2.0' }]);
    });

    it('reports nothing when versions match', async () => {
        const report = await CheckAppsForUpdates([app({ Version: '1.2.0' })], async () => '1.2.0');

        expect(report.Updates).toEqual([]);
        expect(report.Failures).toEqual([]);
        expect(report.Unresolved).toEqual([]);
    });

    it('handles an empty app list', async () => {
        const lookup = vi.fn<LatestVersionLookup>();
        const report = await CheckAppsForUpdates([], lookup);

        expect(report).toEqual({ Updates: [], Failures: [], Unresolved: [] });
        expect(lookup).not.toHaveBeenCalled();
    });
});

describe('CheckAppsForUpdates — an unresolvable version is an UNKNOWN, not "up to date"', () => {
    /**
     * The concrete regression this pins. `ListGitHubTags` reads a single page of the GitHub tags
     * API. `MemberJunction/Integrations` carries 374 tags, and the `Platform-<App>@<semver>` tag
     * line for every installed connector lives past page 1 — so the scoped lookup returns null for
     * every app. Folding null into "no update available" made `mj app check-updates` print a
     * confident "All apps are up to date" over nine apps that had real upgrades waiting, which is
     * strictly worse than the wrong-but-loud answer it replaced.
     *
     * Every app in this list is INSTALLED, so it resolved from a real ref at install time.
     * Finding no version now means the resolver and the repository disagree.
     */
    it('records a null result as Unresolved rather than as silence', async () => {
        const report = await CheckAppsForUpdates(
            [app({ Name: 'connector-orcid', Version: '1.1.2', Subpath: 'Platform/ORCID' })],
            async () => null
        );

        expect(report.Updates).toEqual([]);
        expect(report.Failures).toEqual([]);
        expect(report.Unresolved).toEqual([
            {
                Name: 'connector-orcid',
                Current: '1.1.2',
                Reason: "no 'Platform/ORCID@<version>' tags found in https://github.com/acme/apps",
            },
        ]);
    });

    it('records an undefined result the same way', async () => {
        const report = await CheckAppsForUpdates([app()], async () => undefined);

        expect(report.Unresolved).toHaveLength(1);
        expect(report.Updates).toEqual([]);
    });

    it('names the repo-wide tag line when the app has no Subpath', async () => {
        const report = await CheckAppsForUpdates([app({ Subpath: null })], async () => null);

        expect(report.Unresolved[0].Reason).toBe(
            'no version tags or releases found in https://github.com/acme/apps'
        );
    });

    it('keeps Unresolved separate from Failures — they are different unknowns', async () => {
        const report = await CheckAppsForUpdates(
            [
                app({ Name: 'Empty', Subpath: 'apps/empty' }),
                app({ Name: 'Throwing', Subpath: 'apps/throwing' }),
                app({ Name: 'Fine', Version: '1.0.0', Subpath: 'apps/fine' }),
            ],
            async (_repo, subpath) => {
                if (subpath === 'apps/throwing') throw new Error('API rate limit exceeded');
                return subpath === 'apps/fine' ? '2.0.0' : null;
            }
        );

        expect(report.Updates).toEqual([{ Name: 'Fine', Current: '1.0.0', Latest: '2.0.0' }]);
        expect(report.Failures.map((f) => f.Name)).toEqual(['Throwing']);
        expect(report.Unresolved.map((u) => u.Name)).toEqual(['Empty']);
    });

    it('does not treat an app whose latest EQUALS its installed version as unresolved', async () => {
        const report = await CheckAppsForUpdates([app({ Version: '1.0.0' })], async () => '1.0.0');

        expect(report.Unresolved).toEqual([]);
    });
});

describe('CheckAppsForUpdates — per-app failure isolation', () => {
    it('keeps checking the remaining apps after one throws', async () => {
        const lookup = vi.fn<LatestVersionLookup>().mockImplementation(async (_repo, subpath) => {
            if (subpath === 'apps/broken') throw new Error('API rate limit exceeded');
            return '2.0.0';
        });

        const report = await CheckAppsForUpdates(
            [
                app({ Name: 'Broken', Subpath: 'apps/broken' }),
                app({ Name: 'Fine', Version: '1.0.0', Subpath: 'apps/fine' }),
            ],
            lookup
        );

        // pre-fix: the throw escaped the loop and 'Fine' was never checked
        expect(report.Updates).toEqual([{ Name: 'Fine', Current: '1.0.0', Latest: '2.0.0' }]);
        expect(report.Failures).toEqual([{ Name: 'Broken', Message: 'API rate limit exceeded' }]);
    });

    it('surfaces the failure instead of folding it into "up to date"', async () => {
        const report = await CheckAppsForUpdates([app({ Name: 'Private' })], async () => {
            throw new Error('404 Not Found');
        });

        expect(report.Updates).toEqual([]);
        // The distinction that matters: UNKNOWN, not "no update available".
        expect(report.Failures).toEqual([{ Name: 'Private', Message: '404 Not Found' }]);
    });

    it('stringifies a non-Error throw rather than losing it', async () => {
        const report = await CheckAppsForUpdates([app({ Name: 'Odd' })], async () => {
            throw 'socket hang up';
        });

        expect(report.Failures).toEqual([{ Name: 'Odd', Message: 'socket hang up' }]);
    });

    it('records every failure when all apps fail', async () => {
        const report = await CheckAppsForUpdates(
            [app({ Name: 'A' }), app({ Name: 'B' })],
            async () => {
                throw new Error('network down');
            }
        );

        expect(report.Updates).toEqual([]);
        expect(report.Failures.map((f) => f.Name)).toEqual(['A', 'B']);
    });
});

describe('FormatUpdateCheckReport — the reassuring line is a positive claim', () => {
    /**
     * `CheckAppsForUpdates` deciding an app is UNKNOWN is only half the fix; the other half is the
     * command not printing "All apps are up to date" over it. That decision previously lived inline
     * in the oclif command with no test, so re-collapsing it would have silently restored the
     * original bug — nine apps with real upgrades reported as current. These pin it.
     */
    function report(overrides: Partial<UpdateCheckReport> = {}): UpdateCheckReport {
        return { Updates: [], Failures: [], Unresolved: [], ...overrides };
    }
    const kinds = (r: UpdateCheckReport) => FormatUpdateCheckReport(r).map((l) => l.Kind);

    it('says "up to date" ONLY when nothing is outstanding', () => {
        const lines = FormatUpdateCheckReport(report());
        expect(lines).toEqual([{ Kind: 'up-to-date', Text: 'All apps are up to date.' }]);
    });

    it('does NOT say "up to date" when an app could not be resolved', () => {
        const kindList = kinds(report({
            Unresolved: [{ Name: 'connector-orcid', Current: '1.1.2', Reason: "no 'Platform/ORCID@<version>' tags found" }],
        }));

        expect(kindList).not.toContain('up-to-date');
        expect(kindList[0]).toBe('inconclusive');
        expect(kindList).toContain('unresolved');
    });

    it('does NOT say "up to date" when an app threw', () => {
        const kindList = kinds(report({ Failures: [{ Name: 'Private', Message: '404 Not Found' }] }));

        expect(kindList).not.toContain('up-to-date');
        expect(kindList[0]).toBe('inconclusive');
        expect(kindList).toContain('failure');
    });

    it('does NOT say "up to date" when BOTH kinds of unknown are present', () => {
        const kindList = kinds(report({
            Failures: [{ Name: 'A', Message: 'rate limited' }],
            Unresolved: [{ Name: 'B', Current: '1.0.0', Reason: 'no tags' }],
        }));

        expect(kindList).not.toContain('up-to-date');
        expect(kindList).toEqual([
            'inconclusive', 'failures-header', 'failure', 'failures-note',
            'unresolved-header', 'unresolved', 'unresolved-note',
        ]);
    });

    it('lists updates, and still reports unknowns alongside them', () => {
        const lines = FormatUpdateCheckReport(report({
            Updates: [{ Name: 'connector-hubspot', Current: '1.1.0', Latest: '1.1.2' }],
            Unresolved: [{ Name: 'connector-orcid', Current: '1.1.2', Reason: 'no tags' }],
        }));

        expect(lines.map((l) => l.Kind)).toEqual([
            'updates-header', 'update', 'upgrade-hint',
            'unresolved-header', 'unresolved', 'unresolved-note',
        ]);
        // An update being found must not suppress the unknowns — they are independent facts.
        expect(lines.find((l) => l.Kind === 'update')?.Text).toBe('connector-hubspot: 1.1.0 -> 1.1.2');
    });

    it('counts the apps it could not check', () => {
        const lines = FormatUpdateCheckReport(report({
            Failures: [{ Name: 'A', Message: 'x' }, { Name: 'B', Message: 'y' }],
        }));

        expect(lines.find((l) => l.Kind === 'failures-header')?.Text).toBe('Could not check 2 app(s):');
    });

    it('names the app and its installed version on an unresolved line', () => {
        const lines = FormatUpdateCheckReport(report({
            Unresolved: [{ Name: 'connector-orcid', Current: '1.1.2', Reason: 'no scoped tags found' }],
        }));

        expect(lines.find((l) => l.Kind === 'unresolved')?.Text)
            .toBe('connector-orcid (installed 1.1.2): no scoped tags found');
    });
});
