/**
 * #3858 — DownloadMigrations must fetch what skyway will run: the RECURSIVE .sql set, and an empty
 * download is a failure, not a green install with an empty schema.
 *
 * Runs the REAL Octokit and client against a fake GitHub (helpers/fake-github.ts) served through
 * `fetch`, so both ways the directory can be listed are genuinely exercised: one recursive Git Trees
 * request (the normal path) and the per-directory Contents walk (the fallback when GitHub truncates a
 * tree). The #3858 guarantees are asserted against both, since they must hold whichever one runs.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { FakeGitHub, type FakeFile, type FakeGitHubOptions, type FakeRepo } from './helpers/fake-github.js';
import { DownloadMigrations, ClearGitHubTagCache } from '../github/github-client';

const OPTIONS = {} as Parameters<typeof DownloadMigrations>[4];
const REPO_URL = 'https://github.com/o/r';
let dir: string;

beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'mj-3858-'));
    ClearGitHubTagCache();
});

afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    vi.unstubAllGlobals();
});

/** A repository whose files exist at `ref` (default branch unless given), each holding `-- <path>`. */
function repoAt(paths: string[], extra: Partial<FakeRepo> = {}, ref = 'HEAD'): FakeRepo {
    const files: Record<string, FakeFile> = {};
    for (const path of paths) {
        files[path] = { Content: `-- ${path}` };
    }
    return { Owner: 'o', Repo: 'r', Files: { [ref]: files }, ...extra };
}

/** Installs a fake GitHub serving `repo` as the global fetch, and returns it for request inspection. */
function serve(repo: FakeRepo, options: FakeGitHubOptions = {}): FakeGitHub {
    const fake = new FakeGitHub([repo], options);
    vi.stubGlobal('fetch', fake.Fetch);
    return fake;
}

describe.each([
    ['one recursive tree request', false],
    ['the per-directory walk (GitHub truncated the tree)', true],
])('DownloadMigrations (#3858) — listing via %s', (_label, truncated) => {
    it('descends into subdirectories and preserves relative paths on disk', async () => {
        const fake = serve(repoAt(['migrations/V1__a.sql', 'migrations/extra/V2__b.sql', 'migrations/README.md'], { TruncateTrees: truncated }));

        const result = await DownloadMigrations(REPO_URL, undefined, 'migrations', dir, OPTIONS);

        expect(result.Success, result.ErrorMessage).toBe(true);
        // Proves which listing ran: the walk lists each of the two directories through Contents.
        expect(fake.ApiBreakdown()).toEqual(truncated ? { trees: 1, contents: 2 } : { trees: 1 });
        expect(result.Files?.sort()).toEqual(['V1__a.sql', 'extra/V2__b.sql']);
        // Structure survives on disk — flattening file.name would let two same-named migrations in
        // different subdirectories silently overwrite each other.
        expect(readFileSync(join(dir, 'extra', 'V2__b.sql'), 'utf-8')).toBe('-- migrations/extra/V2__b.sql');
    });

    it('treats ZERO downloaded files as a FAILURE with an actionable message', async () => {
        // The old `Success: true, Files: []` let an install proceed, record the app as installed,
        // and leave the host with an empty schema and a green result — the one place the migration
        // phase failed soft.
        serve(repoAt(['migrations/notes.md'], { TruncateTrees: truncated }));

        const result = await DownloadMigrations(REPO_URL, undefined, 'migrations', dir, OPTIONS);

        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toMatch(/No \.sql files/);
        expect(result.ErrorMessage).toMatch(/mj-app\.json/);
    });

    it('refuses a pathologically deep tree instead of walking forever', async () => {
        let path = 'migrations';
        for (let i = 0; i < 10; i++) {
            path = `${path}/d${i}`;
        }
        serve(repoAt([`${path}/V9__deep.sql`], { TruncateTrees: truncated }));

        const result = await DownloadMigrations(REPO_URL, undefined, 'migrations', dir, OPTIONS);

        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toMatch(/nesting exceeds/);
    });

    it('accepts the deepest layout the walk always accepted (six directory levels)', async () => {
        serve(repoAt(['migrations/a/b/c/d/e/f/V1__deep.sql'], { TruncateTrees: truncated }));

        const result = await DownloadMigrations(REPO_URL, undefined, 'migrations', dir, OPTIONS);

        expect(result.Success, result.ErrorMessage).toBe(true);
        expect(result.Files).toEqual(['a/b/c/d/e/f/V1__deep.sql']);
    });

    it('never writes raw bytes that do not match the listed blob — that file is read through the API instead', async () => {
        // A CDN copy that is stale after a tag was moved, or a proxy's block page served with a 200.
        const fake = serve(repoAt(['migrations/V1__a.sql', 'migrations/V2__b.sql'], { TruncateTrees: truncated }), {
            RawOverrides: { 'migrations/V1__a.sql': '<html>Blocked by your network administrator</html>' },
        });

        const result = await DownloadMigrations(REPO_URL, undefined, 'migrations', dir, OPTIONS);

        expect(result.Success, result.ErrorMessage).toBe(true);
        expect(readFileSync(join(dir, 'V1__a.sql'), 'utf-8')).toBe('-- migrations/V1__a.sql');
        expect(readFileSync(join(dir, 'V2__b.sql'), 'utf-8')).toBe('-- migrations/V2__b.sql');
        // Raw is abandoned for the rest of this download once it served something unverifiable.
        expect(fake.RawCalls).toBe(1);
    });

    it('skips a symbolic link named *.sql, as the Contents walk always did', async () => {
        const repo = repoAt(['migrations/V1__a.sql'], { TruncateTrees: truncated });
        repo.Files.HEAD['migrations/V2__link.sql'] = { Content: 'V1__a.sql', Mode: '120000' };
        serve(repo);

        const result = await DownloadMigrations(REPO_URL, undefined, 'migrations', dir, OPTIONS);

        expect(result.Files).toEqual(['V1__a.sql']);
    });
});

describe('DownloadMigrations — REST cost and content source', () => {
    it('lists the whole directory with ONE tree request and reads every file from raw', async () => {
        const paths = Array.from({ length: 40 }, (_, i) => `migrations/V${i + 1}__m.sql`).concat('migrations/archive/V99__old.sql');
        const fake = serve(repoAt(paths));

        const result = await DownloadMigrations(REPO_URL, undefined, 'migrations', dir, OPTIONS);

        expect(result.Success, result.ErrorMessage).toBe(true);
        expect(result.Files).toHaveLength(41);
        expect(fake.ApiBreakdown()).toEqual({ trees: 1 });
        expect(fake.RawCalls).toBe(41);
    });

    it('reads a tagged version at refs/tags/v<version> on raw and <tag>:<path> on the tree', async () => {
        const fake = serve(repoAt(['migrations/V1__a.sql'], {}, 'v1.2.0'));

        const result = await DownloadMigrations(REPO_URL, '1.2.0', 'migrations', dir, OPTIONS);

        expect(result.Success, result.ErrorMessage).toBe(true);
        const urls = fake.Requests.map(r => r.Url);
        expect(urls).toContain('https://api.github.com/repos/o/r/git/trees/v1.2.0%3Amigrations?recursive=true');
        expect(urls).toContain('https://raw.githubusercontent.com/o/r/refs/tags/v1.2.0/migrations/V1__a.sql');
    });

    it('uses the app\'s scoped tag and subpath in a multi-app repository', async () => {
        const fake = serve({
            Owner: 'MemberJunction', Repo: 'Integrations',
            Files: { 'CRM-HubSpot@1.2.0': { 'CRM/HubSpot/migrations/V1__hubspot.sql': { Content: '-- hubspot' } } },
        });

        const result = await DownloadMigrations('https://github.com/MemberJunction/Integrations/CRM/HubSpot', '1.2.0', 'migrations', dir, OPTIONS);

        expect(result.Success, result.ErrorMessage).toBe(true);
        expect(readFileSync(join(dir, 'V1__hubspot.sql'), 'utf-8')).toBe('-- hubspot');
        const urls = fake.Requests.map(r => r.Url);
        expect(urls).toContain('https://api.github.com/repos/MemberJunction/Integrations/git/trees/CRM-HubSpot%401.2.0%3ACRM%2FHubSpot%2Fmigrations?recursive=true');
        expect(urls).toContain('https://raw.githubusercontent.com/MemberJunction/Integrations/refs/tags/CRM-HubSpot%401.2.0/CRM/HubSpot/migrations/V1__hubspot.sql');
    });

    it('normalizes a trailing or doubled slash in migrations.directory, which the Trees API rejects', async () => {
        serve(repoAt(['migrations/V1__a.sql']));

        const result = await DownloadMigrations(REPO_URL, undefined, 'migrations//', dir, OPTIONS);

        expect(result.Success, result.ErrorMessage).toBe(true);
        expect(result.Files).toEqual(['V1__a.sql']);
    });

    it('fails with a message naming the directory when it does not exist at the ref', async () => {
        serve(repoAt(['migrations/V1__a.sql']));

        const result = await DownloadMigrations(REPO_URL, undefined, 'migrations-pg', dir, OPTIONS);

        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toContain("'migrations-pg' was not found in o/r at ref HEAD");
    });

    it('fails when the migrations path is a file rather than a directory', async () => {
        serve(repoAt(['migrations']));

        const result = await DownloadMigrations(REPO_URL, undefined, 'migrations', dir, OPTIONS);

        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toMatch(/Expected a directory at migrations/);
    });

    it('falls back to the Contents API when raw is unreachable, and tries raw only once', async () => {
        const fake = serve(repoAt(['migrations/V1__a.sql', 'migrations/V2__b.sql', 'migrations/V3__c.sql']), { Raw: 'unreachable' });

        const result = await DownloadMigrations(REPO_URL, undefined, 'migrations', dir, OPTIONS);

        expect(result.Success, result.ErrorMessage).toBe(true);
        expect(readFileSync(join(dir, 'V3__c.sql'), 'utf-8')).toBe('-- migrations/V3__c.sql');
        expect(fake.RawCalls).toBe(1);
        expect(fake.ApiBreakdown()).toEqual({ trees: 1, contents: 3 });
    });

    it('switches the rest of a download to the API once raw refuses a file (e.g. a private repo raw will not authorize)', async () => {
        const fake = serve(repoAt(['migrations/V1__a.sql', 'migrations/V2__b.sql']), { Raw: 404 });

        const result = await DownloadMigrations(REPO_URL, undefined, 'migrations', dir, OPTIONS);

        expect(result.Success, result.ErrorMessage).toBe(true);
        expect(fake.RawCalls).toBe(1);
        expect(fake.ApiBreakdown()).toEqual({ trees: 1, contents: 2 });
    });

    it('reads a file over 1 MB through the Blob API when the API path is used, with identical bytes', async () => {
        const repo = repoAt(['migrations/V1__a.sql']);
        repo.Files.HEAD['migrations/V2__big.sql'] = { Content: '-- big\nSELECT 1;\n', Size: 5 * 1024 * 1024 };
        const fake = serve(repo, { Raw: 'unreachable' });

        const result = await DownloadMigrations(REPO_URL, undefined, 'migrations', dir, OPTIONS);

        expect(result.Success, result.ErrorMessage).toBe(true);
        expect(readFileSync(join(dir, 'V2__big.sql'), 'utf-8')).toBe('-- big\nSELECT 1;\n');
        expect(fake.ApiBreakdown().blobs).toBe(1);
    });

    it('sends a configured token to both hosts, as a Bearer header to raw', async () => {
        const fake = serve(repoAt(['migrations/V1__a.sql'], { RequiredToken: 'ghp_private' }));

        const result = await DownloadMigrations(REPO_URL, undefined, 'migrations', dir, { Token: 'ghp_private' });

        expect(result.Success, result.ErrorMessage).toBe(true);
        expect(fake.Requests.find(r => r.Host === 'raw')?.Authorization).toBe('Bearer ghp_private');
        expect(fake.Requests.find(r => r.Host === 'api')?.Authorization).toBe('token ghp_private');
    });

    it('explains an exhausted rate limit — and why raw could not absorb the reads — without leaking anything', async () => {
        const reset = Math.floor(Date.UTC(2026, 9, 7, 21, 34, 0) / 1000);
        serve(repoAt(['migrations/V1__a.sql', 'migrations/V2__b.sql', 'migrations/V3__c.sql']), { Raw: 'unreachable', ApiBudget: 2, RateLimitResetEpoch: reset });

        const result = await DownloadMigrations(REPO_URL, undefined, 'migrations', dir, OPTIONS);

        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toContain("GitHub's API rate limit was reached while downloading migrations from o/r");
        expect(result.ErrorMessage).toContain('2026-10-07 21:34:00 UTC');
        expect(result.ErrorMessage).toContain('GITHUB_TOKEN');
        expect(result.ErrorMessage).toContain('raw.githubusercontent.com could not be used');
        expect(existsSync(join(dir, 'V3__c.sql'))).toBe(false);
    });
});
