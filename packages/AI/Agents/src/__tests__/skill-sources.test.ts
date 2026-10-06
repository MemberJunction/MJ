/**
 * SkillSources — parsing a skill's upstream location, hashing what was fetched, the update decision
 * the scheduled check makes, and the GitHub fetch (one tree listing + raw downloads) against a fake
 * `fetch`. No network.
 */
import { describe, it, expect } from 'vitest';
import {
    ComputeSkillContentHash,
    DecideSkillUpdateStatus,
    FetchSkillBundle,
    GitHubSkillSource,
    ParseSkillSource,
    SkillSourceFromSkill,
    SkillSourceURL
} from '../SkillSources';

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

    it('rejects non-https, malformed, and path-escaping sources', () => {
        expect(() => ParseSkillSource('http://example.com/SKILL.md')).toThrow(/https/);
        expect(() => ParseSkillSource('not a url')).toThrow(/Not a valid/);
        expect(() => ParseSkillSource('https://github.com/acme')).toThrow(/owner/);
        expect(() => ParseSkillSource('https://github.com/acme/skills/issues/1')).toThrow(/repository, a folder/);
        // URL parsing already resolves dot segments; a structured source is checked directly.
        expect(() => GitHubSkillSource('acme', 'skills', 'a/../b', 'main')).toThrow(/Invalid skill folder path/);
        expect(() => GitHubSkillSource('acme', 'skills', 'a', ' ')).toThrow(/needs a ref/);
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
});

/** A fake fetch serving a fixed URL -> body map; anything else is a 404. */
function fakeFetch(routes: Record<string, string>): { fetchFn: typeof fetch; calls: string[] } {
    const calls: string[] = [];
    const fetchFn = (async (input: string | URL | Request) => {
        const url = String(input);
        calls.push(url);
        const body = routes[url];
        return body === undefined
            ? new Response('not found', { status: 404, statusText: 'Not Found' })
            : new Response(body, { status: 200 });
    }) as typeof fetch;
    return { fetchFn, calls };
}

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

    it('lists the folder once, downloads SKILL.md and its text files, and skips binary and oversized ones', async () => {
        const { fetchFn, calls } = fakeFetch({
            'https://api.github.com/repos/acme/skills/git/trees/v1?recursive=1': tree,
            [`${raw}/SKILL.md`]: '---\nname: pdf\n---\nBody',
            [`${raw}/references/forms.md`]: 'Forms',
            [`${raw}/assets/logo.png`]: 'PNG\u0000\u0001',
        });
        const bundle = await FetchSkillBundle(source, fetchFn);

        expect(bundle.Markdown).toBe('---\nname: pdf\n---\nBody');
        expect(bundle.Files).toEqual([{ Path: 'references/forms.md', Content: 'Forms' }]);
        expect(bundle.Skipped.sort()).toEqual(['assets/logo.png', 'huge.md']);
        expect(calls.filter(c => c.includes('api.github.com'))).toHaveLength(1);
        expect(calls.some(c => c.includes('huge.md') || c.includes('pdfx'))).toBe(false);
    });

    it('fails clearly when the folder has no SKILL.md, or a download fails', async () => {
        const noSkill = ParseSkillSource('https://github.com/acme/skills/tree/v1/docs');
        await expect(FetchSkillBundle(noSkill, fakeFetch({ 'https://api.github.com/repos/acme/skills/git/trees/v1?recursive=1': tree }).fetchFn))
            .rejects.toThrow(/No SKILL\.md found/);
        await expect(FetchSkillBundle({ SourceType: 'URL', URL: 'https://example.com/SKILL.md' }, fakeFetch({}).fetchFn))
            .rejects.toThrow(/404/);
    });
});
