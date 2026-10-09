/**
 * SkillSources — parsing a skill's upstream location, hashing what was fetched, the update decision
 * the scheduled check makes, and the GitHub fetch (one tree listing + raw downloads). `SafeFetch` from
 * `@memberjunction/network-utils` is module-mocked: every request must go through it, with
 * `RequireHttps`, a timeout signal, and a capped body. No network.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { safeFetch } = vi.hoisted(() => ({ safeFetch: vi.fn() }));
vi.mock('@memberjunction/network-utils', () => ({ SafeFetch: (...args: unknown[]) => safeFetch(...args) }));

import {
    AssertStorableSkillFiles,
    ComputeSkillContentHash,
    DecideSkillUpdateStatus,
    FetchSkillBundle,
    GitHubSkillSource,
    MAX_SKILL_FILE_BYTES,
    ParseSkillSource,
    ResolveGitHubCommit,
    SkillSourceFromSkill,
    SkillSourceURL
} from '../SkillSources';

/** Serves a fixed URL -> body map through the mocked SafeFetch; anything else is a 404. Returns the URLs asked for. */
function serve(routes: Record<string, string | (() => Response)>): string[] {
    const calls: string[] = [];
    safeFetch.mockImplementation(async (url: string) => {
        calls.push(url);
        const route = routes[url];
        if (route === undefined) return new Response('not found', { status: 404, statusText: 'Not Found' });
        return typeof route === 'string' ? new Response(route, { status: 200 }) : route();
    });
    return calls;
}

beforeEach(() => safeFetch.mockReset());

describe('ParseSkillSource', () => {
    it('treats a non-GitHub https URL as a plain SKILL.md URL', () => {
        expect(ParseSkillSource('https://example.com/skills/diagrams/SKILL.md'))
            .toEqual({ SourceType: 'URL', URL: 'https://example.com/skills/diagrams/SKILL.md' });
    });

    it('parses a GitHub repository root, defaulting the ref to HEAD', () => {
        expect(ParseSkillSource('https://github.com/acme/skills'))
            .toEqual({ SourceType: 'GitHub', Owner: 'acme', Repo: 'skills', Path: '', Ref: 'HEAD' });
        expect(ParseSkillSource('https://github.com/acme/skills.git', 'v2.0.0'))
            .toEqual({ SourceType: 'GitHub', Owner: 'acme', Repo: 'skills', Path: '', Ref: 'v2.0.0' });
    });

    it('parses a /tree/ folder URL into ref and path', () => {
        expect(ParseSkillSource('https://github.com/anthropics/skills/tree/v1.2.0/document-skills/pdf'))
            .toEqual({ SourceType: 'GitHub', Owner: 'anthropics', Repo: 'skills', Path: 'document-skills/pdf', Ref: 'v1.2.0' });
    });

    it('parses a /blob/ SKILL.md URL into its folder', () => {
        expect(ParseSkillSource('https://github.com/tt-a1i/archify/blob/main/skills/archify/SKILL.md'))
            .toEqual({ SourceType: 'GitHub', Owner: 'tt-a1i', Repo: 'archify', Path: 'skills/archify', Ref: 'main' });
    });

    it('uses the ref hint to split a ref that contains slashes', () => {
        expect(ParseSkillSource('https://github.com/acme/skills/tree/release/2026-10/skills/pdf', 'release/2026-10'))
            .toEqual({ SourceType: 'GitHub', Owner: 'acme', Repo: 'skills', Path: 'skills/pdf', Ref: 'release/2026-10' });
    });

    it('round-trips through SkillSourceURL + SourceRef, the way a skill row stores it', () => {
        const source = ParseSkillSource('https://github.com/acme/skills/tree/feature/x/skills/pdf', 'feature/x');
        const stored = { SourceType: 'GitHub' as const, SourceURL: SkillSourceURL(source), SourceRef: 'feature/x' };
        expect(stored.SourceURL).toBe('https://github.com/acme/skills/tree/feature/x/skills/pdf');
        expect(SkillSourceFromSkill(stored)).toEqual(source);
        expect(SkillSourceFromSkill({ SourceType: null, SourceURL: null, SourceRef: null })).toBeNull();
    });

    it('percent-encodes #, ? and % in the ref and path, so they survive the round trip', () => {
        const source = GitHubSkillSource('acme', 'skills', 'skills/c#/50%?', 'v1#beta?x%');
        const url = SkillSourceURL(source);
        expect(url).toBe('https://github.com/acme/skills/tree/v1%23beta%3Fx%25/skills/c%23/50%25%3F');
        expect(SkillSourceFromSkill({ SourceType: 'GitHub', SourceURL: url, SourceRef: 'v1#beta?x%' })).toEqual(source);
    });

    it('reads a row whose SourceURL links the imported commit while SourceRef follows a branch', () => {
        const sha = 'a'.repeat(40);
        const stored = { SourceType: 'GitHub' as const, SourceURL: `https://github.com/acme/skills/tree/${sha}/skills/pdf`, SourceRef: 'release/2026-10' };
        expect(SkillSourceFromSkill(stored)).toEqual({ SourceType: 'GitHub', Owner: 'acme', Repo: 'skills', Path: 'skills/pdf', Ref: 'release/2026-10' });
        expect(SkillSourceFromSkill({ ...stored, SourceRef: null })).toMatchObject({ Ref: sha });
    });

    it('rejects non-https, malformed, and path-escaping sources', () => {
        expect(() => ParseSkillSource('http://example.com/SKILL.md')).toThrow(/https/);
        expect(() => ParseSkillSource('not a url')).toThrow(/Not a valid/);
        expect(() => ParseSkillSource('https://github.com/acme')).toThrow(/owner/);
        expect(() => ParseSkillSource('https://github.com/acme/skills/issues/1')).toThrow(/repository, a folder/);
        // URL parsing already resolves dot segments; a structured source is checked directly.
        expect(() => GitHubSkillSource('acme', 'skills', 'a/../b', 'main')).toThrow(/Invalid skill folder path/);
        expect(() => GitHubSkillSource('acme', 'skills', 'a', ' ')).toThrow(/needs a ref/);
        expect(() => GitHubSkillSource('acme', '..', 'a', 'main')).toThrow(/owner/);
    });

    it('re-validates a stored source: an http URL on a skill row is refused', () => {
        expect(() => SkillSourceFromSkill({ SourceType: 'URL', SourceURL: 'http://169.254.169.254/latest/meta-data', SourceRef: null })).toThrow(/https/);
        expect(() => SkillSourceFromSkill({ SourceType: 'GitHub', SourceURL: 'https://example.com/x', SourceRef: 'main' })).toThrow(/not a github\.com URL/);
    });
});

describe('ComputeSkillContentHash', () => {
    const bundle = { Markdown: '---\nname: X\n---\nBody', Files: [{ Path: 'b.md', Content: 'B' }, { Path: 'a.md', Content: 'A' }] };

    it('is a 64-char hex digest independent of file order', () => {
        const hash = ComputeSkillContentHash(bundle);
        expect(hash).toMatch(/^[0-9a-f]{64}$/);
        expect(ComputeSkillContentHash({ ...bundle, Files: [...bundle.Files].reverse() })).toBe(hash);
    });

    it('changes when SKILL.md, a file body, or a file path changes', () => {
        const hash = ComputeSkillContentHash(bundle);
        expect(ComputeSkillContentHash({ ...bundle, Markdown: bundle.Markdown + '!' })).not.toBe(hash);
        expect(ComputeSkillContentHash({ ...bundle, Files: [{ Path: 'a.md', Content: 'A2' }, bundle.Files[0]] })).not.toBe(hash);
        expect(ComputeSkillContentHash({ ...bundle, Files: [{ Path: 'c.md', Content: 'A' }, bundle.Files[0]] })).not.toBe(hash);
    });
});

describe('DecideSkillUpdateStatus (the scheduled check decision)', () => {
    const HASH = 'ab'.repeat(32);

    it('upstream hash changed -> Pending', () => {
        expect(DecideSkillUpdateStatus({ Status: 'Active', SourceContentHash: HASH }, 'cd'.repeat(32))).toBe('Pending');
    });

    it('unchanged -> nothing (case-insensitive)', () => {
        expect(DecideSkillUpdateStatus({ Status: 'Active', SourceContentHash: HASH.toUpperCase() }, HASH)).toBeNull();
    });

    it('a skill already Pending, or Deprecated, is left alone', () => {
        expect(DecideSkillUpdateStatus({ Status: 'Pending', SourceContentHash: HASH }, 'cd'.repeat(32))).toBeNull();
        expect(DecideSkillUpdateStatus({ Status: 'Deprecated', SourceContentHash: HASH }, 'cd'.repeat(32))).toBeNull();
    });

    it('an Active sourced skill with no recorded hash is treated as changed', () => {
        expect(DecideSkillUpdateStatus({ Status: 'Active', SourceContentHash: null }, HASH)).toBe('Pending');
    });

    it('a skill set back to Active while upstream still differs is flagged again (the contract: pin to keep)', () => {
        expect(DecideSkillUpdateStatus({ Status: 'Active', SourceContentHash: HASH }, 'cd'.repeat(32))).toBe('Pending');
    });
});

describe('AssertStorableSkillFiles', () => {
    it('accepts distinct paths', () => {
        expect(() => AssertStorableSkillFiles([{ Path: 'a.md', Content: '' }, { Path: 'b/a.md', Content: '' }])).not.toThrow();
    });

    it('rejects paths that differ only by case, naming both', () => {
        expect(() => AssertStorableSkillFiles([{ Path: 'README.md', Content: '' }, { Path: 'readme.md', Content: '' }]))
            .toThrow(/'README\.md' and 'readme\.md'/);
    });

    it('rejects a path longer than AISkillFile.Path holds', () => {
        expect(() => AssertStorableSkillFiles([{ Path: `${'d/'.repeat(250)}x.md`, Content: '' }])).toThrow(/longer than 500/);
    });
});

describe('FetchSkillBundle', () => {
    const source = ParseSkillSource('https://github.com/acme/skills/tree/v1/skills/pdf');
    const tree = JSON.stringify({
        truncated: false,
        tree: [
            { path: 'README.md', type: 'blob', size: 10 },
            { path: 'skills/pdf', type: 'tree' },
            { path: 'skills/pdf/SKILL.md', type: 'blob', size: 40 },
            { path: 'skills/pdf/references/forms.md', type: 'blob', size: 5 },
            { path: 'skills/pdf/assets/logo.png', type: 'blob', size: 8 },
            { path: 'skills/pdf/huge.md', type: 'blob', size: 10 * 1024 * 1024 },
            { path: 'skills/pdfx/SKILL.md', type: 'blob', size: 40 },
        ],
    });
    const raw = 'https://raw.githubusercontent.com/acme/skills/v1/skills/pdf';
    const TREE_URL = 'https://api.github.com/repos/acme/skills/git/trees/v1?recursive=1';

    it('lists the folder once, downloads SKILL.md and its text files, and skips binary and oversized ones', async () => {
        const calls = serve({
            [TREE_URL]: tree,
            [`${raw}/SKILL.md`]: '---\nname: pdf\n---\nBody',
            [`${raw}/references/forms.md`]: 'Forms',
            [`${raw}/assets/logo.png`]: 'PNG\u0000\u0001',
        });
        const bundle = await FetchSkillBundle(source);

        expect(bundle.Markdown).toBe('---\nname: pdf\n---\nBody');
        expect(bundle.Files).toEqual([{ Path: 'references/forms.md', Content: 'Forms' }]);
        expect(bundle.Skipped.sort()).toEqual(['assets/logo.png', 'huge.md']);
        expect(calls.filter(c => c.includes('api.github.com'))).toHaveLength(1);
        expect(calls.some(c => c.includes('huge.md') || c.includes('pdfx'))).toBe(false);
    });

    it('sends every request through SafeFetch with RequireHttps and a timeout', async () => {
        serve({ 'https://example.com/SKILL.md': '---\nname: x\n---\nBody' });
        await FetchSkillBundle({ SourceType: 'URL', URL: 'https://example.com/SKILL.md' });
        expect(safeFetch).toHaveBeenCalledTimes(1);
        const [, init] = safeFetch.mock.calls[0] as [string, { RequireHttps?: boolean; signal?: AbortSignal }];
        expect(init.RequireHttps).toBe(true);
        expect(init.signal).toBeInstanceOf(AbortSignal);
    });

    it('re-validates the source before any request: an http or malformed source never reaches the network', async () => {
        await expect(FetchSkillBundle({ SourceType: 'URL', URL: 'http://169.254.169.254/latest/meta-data' })).rejects.toThrow(/https/);
        await expect(FetchSkillBundle({ SourceType: 'GitHub', Owner: 'acme', Repo: '..', Path: '', Ref: 'main' })).rejects.toThrow(/owner/);
        expect(safeFetch).not.toHaveBeenCalled();
    });

    it('refuses a body over the cap, by declared length or as it streams', async () => {
        const big = 'x'.repeat(MAX_SKILL_FILE_BYTES + 1);
        serve({ 'https://example.com/a.md': () => new Response(big, { headers: { 'content-length': String(big.length) } }) });
        await expect(FetchSkillBundle({ SourceType: 'URL', URL: 'https://example.com/a.md' })).rejects.toThrow(/limit/);

        const chunk = new Uint8Array(MAX_SKILL_FILE_BYTES / 2 + 1);
        const stream = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(chunk); c.enqueue(chunk); c.close(); } });
        serve({ 'https://example.com/b.md': () => new Response(stream) });
        await expect(FetchSkillBundle({ SourceType: 'URL', URL: 'https://example.com/b.md' })).rejects.toThrow(/limit/);
    });

    it('fails clearly when the folder has no SKILL.md, or a download fails', async () => {
        serve({ [TREE_URL]: tree });
        await expect(FetchSkillBundle(ParseSkillSource('https://github.com/acme/skills/tree/v1/docs'))).rejects.toThrow(/No SKILL\.md found/);
        serve({});
        await expect(FetchSkillBundle({ SourceType: 'URL', URL: 'https://example.com/SKILL.md' })).rejects.toThrow(/404/);
    });
});

describe('ResolveGitHubCommit', () => {
    const sha = '0123456789abcdef0123456789abcdef01234567';

    it('asks the commits API for the SHA of a branch or tag', async () => {
        serve({ 'https://api.github.com/repos/acme/skills/commits/release%2F2026-10': `${sha.toUpperCase()}\n` });
        const source = GitHubSkillSource('acme', 'skills', 'skills/pdf', 'release/2026-10');
        expect(await ResolveGitHubCommit(source)).toBe(sha);
        const [, init] = safeFetch.mock.calls[0] as [string, { headers?: Record<string, string> }];
        expect(init.headers).toEqual({ Accept: 'application/vnd.github.sha' });
    });

    it('returns a ref that already is a SHA without a request, and refuses an answer that is not one', async () => {
        const pinned = GitHubSkillSource('acme', 'skills', '', sha);
        expect(await ResolveGitHubCommit(pinned)).toBe(sha);
        expect(safeFetch).not.toHaveBeenCalled();

        serve({ 'https://api.github.com/repos/acme/skills/commits/main': '<html>' });
        const main = GitHubSkillSource('acme', 'skills', '', 'main');
        await expect(ResolveGitHubCommit(main)).rejects.toThrow(/did not return a commit SHA/);
    });
});

describe('ParseSkillSource with an explicit ref', () => {
    it('follows the given ref, not the commit a stored SourceURL names', () => {
        const source = ParseSkillSource('https://github.com/acme/skills/tree/0123456789abcdef0123456789abcdef01234567/skills/pdf', 'main');

        expect(source).toMatchObject({ SourceType: 'GitHub', Owner: 'acme', Repo: 'skills', Path: 'skills/pdf', Ref: 'main' });
    });
});
