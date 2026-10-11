/**
 * Tests for ResolveDependencyVersion (B26).
 *
 * A dependency declares a semver range; the installer must pin to the highest PUBLISHED
 * version that satisfies it — not silently install whatever the default branch reports (which
 * could be a different major). An unsatisfiable or invalid range fails loudly.
 *
 * It also must not spend GitHub's anonymous allowance (60 REST requests/hour) on a releases listing
 * that cannot change its answer: tags are listed first, and releases only when they could.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import semver from 'semver';

// install-orchestrator imports @memberjunction/core at module load — mock it minimally.
vi.mock('@memberjunction/core', () => ({
    Metadata: class {},
    RunView: class {},
    BaseEntity: class {},
    DatabaseProviderBase: class {},
    CompositeKey: class {},
}));

// The functions ResolveDependencyVersion consults — controllable per test.
vi.mock('../github/github-client.js', () => ({
    FetchManifestFromGitHub: vi.fn(),
    DownloadMigrations: vi.fn(),
    GetLatestVersion: vi.fn(),
    ValidateGitHubTag: vi.fn(),
    ListGitHubReleases: vi.fn(),
    ListGitHubTags: vi.fn(),
    ListGitHubTagNames: vi.fn(),
}));

import { ResolveDependencyVersion } from '../install/install-orchestrator.js';
import { ListGitHubReleases, ListGitHubTagNames, ListGitHubTags } from '../github/github-client.js';

type Release = { TagName: string; PreRelease: boolean; Draft: boolean; CreatedAt: string };
function release(tag: string, draft = false): Release {
    return { TagName: tag, PreRelease: false, Draft: draft, CreatedAt: '2026-01-01T00:00:00Z' };
}

/**
 * Publishes a repository's tags and releases to the three mocks CONSISTENTLY with GitHub: every
 * published release's tag is a tag in the repository, while a draft's tag does not exist until it is
 * published. `strictTags` is what ListGitHubTags returns (names matching its pattern); `otherTags` are
 * tags it filters out (build metadata, hyphenated prerelease ids, non-versions).
 */
function publish(repo: { strictTags?: string[]; otherTags?: string[]; releases?: Release[] }): void {
    const strict = repo.strictTags ?? [];
    const releases = repo.releases ?? [];
    const names = new Set([...strict, ...(repo.otherTags ?? []), ...releases.filter(r => !r.Draft).map(r => r.TagName)]);
    vi.mocked(ListGitHubTags).mockResolvedValue(strict);
    vi.mocked(ListGitHubTagNames).mockResolvedValue([...names]);
    vi.mocked(ListGitHubReleases).mockResolvedValue(releases);
}

const REPO = 'https://github.com/Acme/Dep';

beforeEach(() => {
    vi.clearAllMocks();
    publish({});
});

describe('ResolveDependencyVersion (B26)', () => {
    it('picks the highest tag satisfying the range (^1.0.0 → 1.5.0, not 2.0.0)', async () => {
        publish({ strictTags: ['1.0.0', '1.5.0', '2.0.0'] });
        const r = await ResolveDependencyVersion(REPO, '^1.0.0', {});
        expect(r.Version).toBe('1.5.0');
        expect(r.ErrorMessage).toBeUndefined();
    });

    it('combines releases and tags as candidates', async () => {
        // The release's tag is absent from the strict list, so the tags alone cannot rule it out.
        publish({ releases: [release('v1.4.0')], strictTags: ['1.2.0'] });
        const r = await ResolveDependencyVersion(REPO, '^1.0.0', {});
        expect(r.Version).toBe('1.4.0');
    });

    it('excludes draft releases from the candidate set', async () => {
        publish({ releases: [release('v2.0.0', true)], strictTags: ['1.0.0'] }); // draft, ignored
        const r = await ResolveDependencyVersion(REPO, '>=1.0.0', {});
        expect(r.Version).toBe('1.0.0');
    });

    it('a draft release cannot satisfy a range nothing published satisfies', async () => {
        publish({ releases: [release('v2.0.0', true)], strictTags: ['1.0.0'] });
        const r = await ResolveDependencyVersion(REPO, '>=2.0.0', {});
        expect(r.Version).toBeUndefined();
        expect(r.ErrorMessage).toContain('latest available: 1.0.0');
        expect(vi.mocked(ListGitHubReleases)).toHaveBeenCalled();
    });

    it('fails loudly when NO published version satisfies the range (the silent-wrong-major bug)', async () => {
        publish({ strictTags: ['2.0.0', '3.0.0'] });
        const r = await ResolveDependencyVersion(REPO, '^1.0.0', {});
        expect(r.Version).toBeUndefined();
        expect(r.ErrorMessage).toContain('satisfies');
        // With nothing satisfying in the tags, the releases are the only remaining source — consulted.
        expect(vi.mocked(ListGitHubReleases)).toHaveBeenCalled();
    });

    it('pins an exact version directly without listing', async () => {
        const r = await ResolveDependencyVersion(REPO, '1.2.3', {});
        expect(r.Version).toBe('1.2.3');
        expect(vi.mocked(ListGitHubTags)).not.toHaveBeenCalled();
        expect(vi.mocked(ListGitHubTagNames)).not.toHaveBeenCalled();
    });

    it('treats empty / * / latest as "no constraint" (default-branch latest)', async () => {
        for (const range of ['', '*', 'latest']) {
            const r = await ResolveDependencyVersion(REPO, range, {});
            expect(r.Version).toBeUndefined();
            expect(r.ErrorMessage).toBeUndefined();
        }
    });

    it('rejects an invalid semver range', async () => {
        const r = await ResolveDependencyVersion(REPO, 'not-a-range!!', {});
        expect(r.ErrorMessage).toContain('not a valid semver');
    });
});

describe('ResolveDependencyVersion — lists releases only when they could change the answer', () => {
    it('does not list releases when the tags already decide it', async () => {
        // Every release here is also a strict tag, so no release can add a candidate.
        publish({ strictTags: ['v1.0.0', 'v1.4.0', 'v2.0.0'], releases: [release('v1.4.0'), release('v2.0.0')] });
        const r = await ResolveDependencyVersion(REPO, '^1.0.0', {});
        expect(r.Version).toBe('1.4.0');
        expect(vi.mocked(ListGitHubReleases)).not.toHaveBeenCalled();
    });

    it('ignores tags outside the strict pattern that cannot win (lower, or outside the range)', async () => {
        publish({ strictTags: ['v1.4.0'], otherTags: ['v1.3.0+build.1', 'v2.0.0-rc-1', 'nightly'] });
        const r = await ResolveDependencyVersion(REPO, '^1.0.0', {});
        expect(r.Version).toBe('1.4.0');
        expect(vi.mocked(ListGitHubReleases)).not.toHaveBeenCalled();
    });

    it('lists releases when a published tag outside the strict pattern could outrank the tags', async () => {
        // ListGitHubTags drops build metadata, but a RELEASE on that tag is still a candidate.
        publish({ strictTags: ['v1.2.0'], releases: [release('v1.4.0+build.7')] });
        const r = await ResolveDependencyVersion(REPO, '^1.0.0', {});
        expect(r.Version).toBe('1.4.0+build.7');
        expect(vi.mocked(ListGitHubReleases)).toHaveBeenCalled();
    });

    it('lists releases when such a tag would TIE the tags\' best — the first maximum wins, and releases come first', async () => {
        publish({ strictTags: ['v1.4.0'], releases: [release('v1.4.0+build.7')] });
        const r = await ResolveDependencyVersion(REPO, '^1.0.0', {});
        expect(r.Version).toBe('1.4.0+build.7');
        expect(vi.mocked(ListGitHubReleases)).toHaveBeenCalled();
    });

    it('is the same answer whether or not releases were listed — a release that is also a strict tag', async () => {
        publish({ strictTags: ['v1.4.0'], releases: [release('v1.4.0')] });
        const r = await ResolveDependencyVersion(REPO, '^1.0.0', {});
        expect(r.Version).toBe('1.4.0');
    });

    it('skips the strict tag listing entirely when the repository has no tags at all', async () => {
        publish({ releases: [] });
        const r = await ResolveDependencyVersion(REPO, '^1.0.0', {});
        expect(r.ErrorMessage).toContain('no published versions');
        expect(vi.mocked(ListGitHubTags)).not.toHaveBeenCalled();
    });
});

describe('ResolveDependencyVersion — same answer as listing releases every time (differential)', () => {
    /** The algorithm before releases became conditional, verbatim: releases + strict tags, always. */
    function resolveListingEverything(range: string, releases: Release[], strictTags: string[]): { Version?: string; ErrorMessage?: string } {
        const candidates = [
            ...releases.filter((r) => !r.Draft).map((r) => r.TagName.replace(/^v/, '')),
            ...strictTags.map((t) => t.replace(/^v/, '')),
        ].filter((v) => semver.valid(v) != null);
        if (candidates.length === 0) {
            return { ErrorMessage: `no published versions found at ${REPO} to satisfy '${range}'` };
        }
        const best = semver.maxSatisfying(candidates, range);
        if (!best) {
            const latest = candidates.sort(semver.rcompare)[0];
            return { ErrorMessage: `no published version at ${REPO} satisfies '${range}' (latest available: ${latest})` };
        }
        return { Version: best };
    }

    /** What ListGitHubTags returns for a repo-wide app: its pattern, then semver order. */
    function strictTagsOf(names: string[]): string[] {
        const pattern = /^(v?\d+\.\d+\.\d+(-[a-zA-Z0-9]+(\.[a-zA-Z0-9]+)*)?)$/;
        const core = (t: string) => semver.valid(t) ?? semver.valid(t.replace(/^v/, ''));
        return names.filter((n) => pattern.test(n) && core(n) !== null).sort((a, b) => semver.rcompare(core(a)!, core(b)!));
    }

    /** A small seeded PRNG (mulberry32), so a failure reproduces exactly. */
    function seeded(seed: number): () => number {
        return () => {
            seed = (seed + 0x6d2b79f5) | 0;
            let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    // Deliberately awkward: build metadata, hyphenated prerelease ids, missing or capital 'v',
    // leading zeros, scoped and non-version tags — everything the strict pattern and semver disagree on.
    const TAG_VOCABULARY = [
        'v0.9.0', 'v1.0.0', '1.0.0', 'v1.2.0', 'v1.2.0-rc.1', 'v1.2.0-rc-1', 'v1.2.0+build.7', '1.2.0+b', 'v1.2.1',
        'v1.4.0', 'v1.4.0+build.7', 'v2.0.0-beta.1', 'v2.0.0', '2.1.0', 'v2.1.0+meta', 'V1.5.0', 'v1.5', 'v01.0.0',
        'nightly', 'latest', '@scope/pkg@1.3.0', 'CRM-HubSpot@1.2.0',
    ];
    const RANGES = ['^1.0.0', '>=1.0.0 <2.0.0', '>=1.2.0', '~1.2.0', '>=2.0.0', '^0.9.0', '>=1.0.0', '1.x', '>=3.0.0', '<1.2.0'];

    it('matches over 3,000 random repositories', async () => {
        const random = seeded(4242);
        const pick = <T,>(items: T[]): T => items[Math.floor(random() * items.length)];
        for (let i = 0; i < 3000; i++) {
            const names = [...new Set(Array.from({ length: Math.floor(random() * 7) }, () => pick(TAG_VOCABULARY)))];
            // GitHub's invariant: a published release is on an existing tag; a draft's tag need not exist.
            const published = names.filter(() => random() < 0.4).map((tag) => release(tag));
            const drafts = Array.from({ length: Math.floor(random() * 2) }, () => release(pick(TAG_VOCABULARY), true));
            const releases = [...published, ...drafts].sort(() => random() - 0.5);
            const strictTags = strictTagsOf(names);
            const range = pick(RANGES);

            vi.mocked(ListGitHubTagNames).mockResolvedValue(names);
            vi.mocked(ListGitHubTags).mockResolvedValue(strictTags);
            vi.mocked(ListGitHubReleases).mockResolvedValue(releases);

            const actual = await ResolveDependencyVersion(REPO, range, {});
            const expected = resolveListingEverything(range, releases, strictTags);
            expect(actual, JSON.stringify({ names, releases, range })).toEqual(expected);
        }
    });
});
