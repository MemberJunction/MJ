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
import { CheckAppsForUpdates, type UpdateCheckApp, type LatestVersionLookup } from '../utils/update-check.js';

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
    });

    it('reports nothing — and does NOT fail — when no version could be resolved', async () => {
        // A repo with no tags at all is a legitimate "nothing published yet", not an error.
        const report = await CheckAppsForUpdates([app()], async () => null);

        expect(report.Updates).toEqual([]);
        expect(report.Failures).toEqual([]);
    });

    it('handles an empty app list', async () => {
        const lookup = vi.fn<LatestVersionLookup>();
        const report = await CheckAppsForUpdates([], lookup);

        expect(report).toEqual({ Updates: [], Failures: [] });
        expect(lookup).not.toHaveBeenCalled();
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
