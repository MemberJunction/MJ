// Tests for .github/scripts/archify-sync.mjs
// Run with: npx vitest run --config .github/scripts/vitest.config.mts __tests__/archify-sync
import { describe, it, expect } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    BOT,
    BODY_LIMIT,
    CHECKS,
    SYNC_BRANCH,
    buildPrBody,
    changesetFor,
    compareVersions,
    decide,
    fence,
    nextUpstream,
    parseOpenPr,
    publish,
    releasesBetween,
    replaceVendored,
    sha256,
    validateManifest,
    vendorPlan,
    verifySha256,
} from '../archify-sync.mjs';

const MANIFEST = {
    schemaVersion: 1,
    skillId: 'archify',
    channel: 'stable',
    version: '3.0.1',
    publishedAt: '2026-09-28T15:16:27Z',
    source: { repository: 'https://github.com/tt-a1i/archify', ref: 'v3.0.1', treeSha: '7dcd73a73672d5da4f85d4c612017b478547303b' },
    artifact: { sha256: 'b0b23bd28db314f04ca8ab9620fe20f8c1ac6474a3546bd8fe4679508aa1b7f5' },
    summary: 'x',
    releaseNotes: 'https://github.com/tt-a1i/archify/releases/tag/v3.0.1',
    severity: 'normal',
};

const botPr = (over = {}) => ({ number: 7, url: 'u', isDraft: false, headRefOid: 'abc123', tag: 'v3.0.0', authors: [BOT.email], ...over });

describe('decide', () => {
    it('exits quietly when the pinned tag is the current stable', () => {
        expect(decide({ pinnedTag: 'v3.0.1', stableRef: 'v3.0.1', openPr: null }).action).toBe('noop');
    });

    it('never proposes a downgrade, comparing versions numerically', () => {
        expect(decide({ pinnedTag: 'v3.10.0', stableRef: 'v3.9.0', openPr: null }).action).toBe('noop');
        expect(compareVersions('v3.10.0', 'v3.9.9')).toBeGreaterThan(0);
    });

    it('opens a PR when a newer release exists and none is open', () => {
        expect(decide({ pinnedTag: 'v3.0.0', stableRef: 'v3.0.1', openPr: null })).toEqual({ action: 'create' });
    });

    it("updates last month's open PR instead of opening a second", () => {
        const d = decide({ pinnedTag: 'v3.0.0', stableRef: 'v3.1.0', openPr: botPr({ tag: 'v3.0.1' }) });
        expect(d.action).toBe('update');
        expect(d.pr.number).toBe(7);
    });

    it('exits quietly when the open PR already proposes the current stable', () => {
        expect(decide({ pinnedTag: 'v3.0.0', stableRef: 'v3.0.1', openPr: botPr({ tag: 'v3.0.1' }) }).action).toBe('noop');
    });

    it('refuses to force-update a branch someone else has pushed to', () => {
        const d = decide({ pinnedTag: 'v3.0.0', stableRef: 'v3.1.0', openPr: botPr({ authors: [BOT.email, 'dev@example.com'] }) });
        expect(d.action).toBe('blocked');
        expect(d.reason).toContain('dev@example.com');
    });
});

describe('parseOpenPr', () => {
    it('reads the proposed tag from the body marker and dedupes commit authors', () => {
        const pr = parseOpenPr([{
            number: 9, url: 'u', isDraft: true, headRefOid: 'h',
            body: 'x\n<!-- archify-sync tag=v3.2.0 -->\ny',
            commits: [{ authors: [{ email: BOT.email }] }, { authors: [{ email: BOT.email }, { email: 'a@b.c' }] }],
        }]);
        expect(pr).toMatchObject({ number: 9, tag: 'v3.2.0', isDraft: true, headRefOid: 'h' });
        expect(pr.authors).toEqual([BOT.email, 'a@b.c']);
    });

    it('returns null when no PR is open', () => {
        expect(parseOpenPr([])).toBeNull();
    });
});

describe('validateManifest', () => {
    it('accepts the live stable.json shape', () => {
        expect(validateManifest(structuredClone(MANIFEST))).toBeTruthy();
    });

    it.each([
        ['a ref that is not v<version>', (m) => (m.source.ref = 'main')],
        ['another repository', (m) => (m.source.repository = 'https://github.com/evil/archify')],
        ['a malformed sha256', (m) => (m.artifact.sha256 = 'abc')],
        ['a severity that is not a plain word', (m) => (m.severity = '`x`')],
    ])('rejects %s', (_, mutate) => {
        const m = structuredClone(MANIFEST);
        mutate(m);
        expect(() => validateManifest(m)).toThrow(/failed validation/);
    });
});

describe('sha256 verification', () => {
    const buf = Buffer.from('archify zip bytes');

    it('passes a matching digest', () => {
        expect(() => verifySha256(buf, sha256(buf), 'zip')).not.toThrow();
    });

    it('refuses a mismatched digest', () => {
        expect(() => verifySha256(buf, '0'.repeat(64), 'archify v9 zip')).toThrow(/archify v9 zip: SHA-256 .* Refusing/);
    });
});

describe('vendoredPaths mapping', () => {
    const put = (root, rel, text = rel) => {
        mkdirSync(join(root, rel, '..'), { recursive: true });
        writeFileSync(join(root, rel), text);
    };
    const setup = () => {
        const base = mkdtempSync(join(tmpdir(), 'archify-sync-test-'));
        const zip = join(base, 'zip', 'archify');
        const vendor = join(base, 'vendor');
        for (const f of ['renderers/a.mjs', 'examples/x.workflow.json', 'examples/x.html', 'examples/locales/de.json',
            'assets/template.html', 'assets/not-vendored.bin', 'SKILL.md']) put(zip, f);
        put(vendor, 'renderers/deleted-upstream.mjs');
        put(vendor, 'LOCAL.md');
        return { zip, vendor };
    };
    const PATHS = ['renderers', 'examples', 'assets/template.html', 'SKILL.md'];

    it('maps each path from the zip root onto vendor/archify', () => {
        expect(vendorPlan(['renderers', 'assets/template.html'], '/z', '/v')).toEqual([
            { rel: 'renderers', from: '/z/renderers', to: '/v/renderers' },
            { rel: 'assets/template.html', from: '/z/assets/template.html', to: '/v/assets/template.html' },
        ]);
    });

    it('rejects a path that escapes vendor/archify', () => {
        expect(() => vendorPlan(['../x'], '/z', '/v')).toThrow(/escapes/);
        expect(() => vendorPlan(['a/../../x'], '/z', '/v')).toThrow(/escapes/);
        expect(() => vendorPlan(['/etc'], '/z', '/v')).toThrow(/escapes/);
    });

    it('replaces listed paths wholesale and honors exclude', () => {
        const { zip, vendor } = setup();
        replaceVendored(vendorPlan(PATHS, zip, vendor), zip, ['examples/*.html']);
        expect(existsSync(join(vendor, 'renderers/a.mjs'))).toBe(true);
        expect(existsSync(join(vendor, 'renderers/deleted-upstream.mjs'))).toBe(false);
        expect(existsSync(join(vendor, 'examples/x.workflow.json'))).toBe(true);
        expect(existsSync(join(vendor, 'examples/x.html'))).toBe(false);
        expect(existsSync(join(vendor, 'examples/locales/de.json'))).toBe(true);
        expect(existsSync(join(vendor, 'assets/template.html'))).toBe(true);
        expect(existsSync(join(vendor, 'assets/not-vendored.bin'))).toBe(false);
        expect(existsSync(join(vendor, 'LOCAL.md'))).toBe(true);
    });

    it('fails before touching anything when upstream dropped a listed path', () => {
        const { zip, vendor } = setup();
        expect(() => replaceVendored(vendorPlan([...PATHS, 'gone'], zip, vendor), zip)).toThrow(/no longer ships gone/);
        expect(existsSync(join(vendor, 'renderers/deleted-upstream.mjs'))).toBe(true);
    });
});

describe('UPSTREAM.json and changeset', () => {
    it('updates the four release fields and keeps the rest', () => {
        const up = { repository: 'r', tag: 'v3.0.0', version: '3.0.0', treeSha: 't', zipSha256: 'z', vendoredPaths: ['SKILL.md'], exclude: ['examples/*.html'] };
        expect(nextUpstream(up, MANIFEST)).toEqual({
            ...up,
            tag: 'v3.0.1',
            version: '3.0.1',
            treeSha: MANIFEST.source.treeSha,
            zipSha256: MANIFEST.artifact.sha256,
        });
    });

    it('writes a patch changeset for the package', () => {
        const cs = changesetFor('v3.0.0', 'v3.0.1');
        expect(cs.path).toBe('.changeset/archify-sync-v3-0-1.md');
        expect(cs.text).toMatch(/^---\n"@memberjunction\/ai-diagrams": patch\n---\n/);
    });
});

describe('PR body', () => {
    const REL = (tag, extra = {}) => ({ tag_name: tag, html_url: `h/${tag}`, published_at: '2026-09-28T00:00:00Z', body: `notes ${tag}`, ...extra });
    const base = {
        from: 'v3.0.0',
        to: 'v3.0.1',
        manifest: MANIFEST,
        checks: [{ name: 'Shim patch', status: 'passed' }],
        diff: 'diff --git a/SKILL.md b/SKILL.md\n-old\n+new\n',
        releases: [REL('v3.0.1', { body: 'Thanks @someone ```inline``` <img src=x>' })],
    };

    it('carries the marker, the prompt-injection warning, the release notes and the diff', () => {
        const body = buildPrBody(base);
        expect(body).toMatch(/^<!-- archify-sync tag=v3\.0\.1 -->/);
        expect(body).toContain('prompt-injection surface');
        expect(body).toContain('https://github.com/tt-a1i/archify/compare/v3.0.0...v3.0.1');
        expect(body).toContain('````\nThanks @someone ```inline``` <img src=x>\n````');
        expect(body).toContain('```diff\ndiff --git a/SKILL.md');
        expect(body).not.toContain('[!CAUTION]');
    });

    it('flags failed checks prominently, with their output', () => {
        const body = buildPrBody({ ...base, checks: [{ name: 'Shim patch', status: 'FAILED', output: 'error: patch does not apply' }] });
        expect(body.indexOf('[!CAUTION]')).toBeLessThan(body.indexOf('[!WARNING]'));
        expect(body).toContain('Failed: Shim patch');
        expect(body).toContain('error: patch does not apply');
    });

    it('calls out a non-normal severity', () => {
        expect(buildPrBody({ ...base, manifest: { ...MANIFEST, severity: 'security' } })).toContain('`security`');
    });

    it('stays under the GitHub body limit with a huge diff', () => {
        const body = buildPrBody({ ...base, diff: '+x\n'.repeat(100000) });
        expect(body.length).toBeLessThan(BODY_LIMIT);
        expect(body).toContain('truncated');
    });

    it('stays under the limit when the release notes alone overflow it, keeping the marker', () => {
        const releases = Array.from({ length: 20 }, (_, i) => REL(`v3.0.${i + 1}`, { body: 'n'.repeat(5900) }));
        const body = buildPrBody({ ...base, releases });
        expect(body.length).toBeLessThanOrEqual(BODY_LIMIT);
        expect(body).toMatch(/^<!-- archify-sync tag=v3\.0\.1 -->/);
        expect(body).toContain("hit GitHub's size limit");
    });

    it('says plainly that CI has not run, and how a maintainer starts it', () => {
        const body = buildPrBody(base);
        expect(body).toContain('CI has not run on this PR');
        expect(body).toContain('closing and reopening this PR');
    });

    it('keeps upstream manifest text inert: publishedAt in one code span, no releaseNotes string', () => {
        const manifest = { ...MANIFEST, publishedAt: '2026 | @evil [x](https://e.example) `y`', releaseNotes: '@evil https://e.example' };
        const body = buildPrBody({ ...base, manifest, releases: [], releasesError: 'HTTP 403' });
        expect(body).toContain('(published `2026   @evil [x](https://e.example)  y `)');
        expect(body).not.toContain('@evil https://e.example');
        expect(body).toContain('https://github.com/tt-a1i/archify/releases/tag/v3.0.1');
    });

    it('says so when release notes could not be fetched', () => {
        expect(buildPrBody({ ...base, releases: [], releasesError: 'HTTP 403' })).toContain('Could not fetch them (HTTP 403)');
    });

    it('fences text longer than any backtick run inside it', () => {
        expect(fence('a ````` b')).toBe('``````\na ````` b\n``````');
    });

    it('lists every stable release in the range, oldest first', () => {
        const all = [REL('v3.1.0'), REL('v3.0.0'), REL('v3.0.2', { prerelease: true }), REL('v3.0.1'), REL('v3.2.0'), REL('v3.0.3', { draft: true })];
        expect(releasesBetween(all, 'v3.0.0', 'v3.1.0').map((r) => r.tag_name)).toEqual(['v3.0.1', 'v3.1.0']);
    });
});

describe('publish', () => {
    const META = {
        from: 'v3.0.0',
        to: 'v3.1.0',
        manifest: { ...MANIFEST, version: '3.1.0', source: { ...MANIFEST.source, ref: 'v3.1.0' } },
        checks: [{ name: CHECKS.shims, status: 'passed' }],
        diff: '',
        changeset: '.changeset/archify-sync-v3-1-0.md',
        needsWork: false,
    };
    const ok = (stdout = '') => ({ status: 0, stdout, stderr: '' });

    /**
     * Records every command; answers gh and the staged-files query (`git diff --name-status`, so a
     * plain path is reported as modified). At the push it records what body.md held at that moment.
     */
    function setup({ meta = META, openPrs = [], releases = [], staged = ['packages/AI/Diagrams/UPSTREAM.json', META.changeset], pinned = META.from, stable = META.manifest, prCreate = null } = {}) {
        const inDir = mkdtempSync(join(tmpdir(), 'archify-sync-pub-'));
        writeFileSync(join(inDir, 'meta.json'), JSON.stringify(meta));
        // The trusted side: the checked-out base's UPSTREAM.json, and stable.json as fetched at publish.
        const root = mkdtempSync(join(tmpdir(), 'archify-sync-root-'));
        mkdirSync(join(root, 'packages/AI/Diagrams'), { recursive: true });
        writeFileSync(join(root, 'packages/AI/Diagrams/UPSTREAM.json'), JSON.stringify({ tag: pinned, manifest: 'https://example.test/stable.json' }));
        const calls = [];
        const atPush = {};
        const run = (cmd, args) => {
            calls.push(`${cmd} ${args.join(' ')}`);
            if (cmd === 'gh' && args[1] === 'list') return ok(JSON.stringify(openPrs));
            if (cmd === 'gh' && args[0] === 'api') return ok(JSON.stringify(releases));
            if (cmd === 'curl') return ok(JSON.stringify(stable));
            if (cmd === 'gh' && args[1] === 'create') return prCreate ?? ok('https://github.com/o/r/pull/8\n');
            if (cmd === 'git' && args[0] === 'diff') return ok(staged.map((p) => (p.includes('\t') ? p : `M\t${p}`)).join('\n'));
            if (cmd === 'git' && args[0] === 'push') atPush.body = existsSync(join(inDir, 'body.md')) ? readFileSync(join(inDir, 'body.md'), 'utf8') : null;
            return ok();
        };
        const go = () => publish({ root, inDir, run, repo: 'o/r', token: 't' });
        return { go, calls, inDir, atPush };
    }
    it('refuses a meta.json whose pinned tag differs from UPSTREAM.json on the base', () => {
        const { go, calls } = setup({ pinned: 'v2.9.0' });
        expect(go).toThrow(/UPSTREAM\.json on .* pins v2\.9\.0/);
        expect(calls.some((c) => c.startsWith('git push'))).toBe(false);
    });

    it('refuses a meta.json whose manifest differs from stable.json fetched at publish', () => {
        const { go, calls } = setup({ stable: { ...META.manifest, artifact: { ...META.manifest.artifact, sha256: 'f'.repeat(64) } } });
        expect(go).toThrow(/does not match stable\.json/);
        expect(calls.some((c) => c.startsWith('git push'))).toBe(false);
    });

    it('names the repo setting when GitHub refuses to open the PR', () => {
        const { go } = setup({ prCreate: { status: 1, stdout: '', stderr: 'GraphQL: GitHub Actions is not permitted to create or approve pull requests' } });
        expect(go).toThrow(/Allow GitHub Actions to create and approve pull requests/);
    });

    const openPr = (over = {}) => ({
        number: 5, url: 'https://github.com/o/r/pull/5', isDraft: false, headRefOid: 'oldhead',
        body: '<!-- archify-sync tag=v3.0.1 -->', commits: [{ authors: [{ email: BOT.email }] }], ...over,
    });

    it('opens a new PR into next when none is open', () => {
        const { go, calls } = setup();
        expect(go()).toBe(0);
        expect(calls).toContain(`git checkout -B ${SYNC_BRANCH}`);
        expect(calls).toContain(`git push --force origin HEAD:refs/heads/${SYNC_BRANCH}`);
        const create = calls.find((c) => c.startsWith('gh pr create'));
        expect(create).toContain(`--base next --head ${SYNC_BRANCH}`);
        expect(create).not.toContain('--draft');
        expect(calls.some((c) => c.startsWith('gh pr edit'))).toBe(false);
    });

    it('opens it as a draft and fails the run when a check failed', () => {
        const { go, calls } = setup({ meta: { ...META, needsWork: true, checks: [{ name: CHECKS.shims, status: 'FAILED' }] } });
        expect(go()).toBe(1);
        expect(calls.find((c) => c.startsWith('gh pr create'))).toContain('--draft');
    });

    it("force-updates last month's PR with a lease and rewrites it instead of opening a second", () => {
        const { go, calls, inDir } = setup({ openPrs: [openPr({ isDraft: true })] });
        expect(go()).toBe(0);
        expect(calls).toContain(`git push --force-with-lease=refs/heads/${SYNC_BRANCH}:oldhead origin HEAD:refs/heads/${SYNC_BRANCH}`);
        expect(calls).toContain(`gh pr edit 5 --title chore(ai-diagrams): sync vendored archify v3.0.0 to v3.1.0 --body-file ${join(inDir, 'body.md')} --repo o/r`);
        expect(calls).toContain('gh pr ready 5 --repo o/r');
        expect(calls.some((c) => c.startsWith('gh pr create'))).toBe(false);
        expect(readFileSync(join(inDir, 'body.md'), 'utf8')).toMatch(/^<!-- archify-sync tag=v3\.1\.0 -->/);
    });

    it('does nothing when the open PR already proposes this release', () => {
        const { go, calls } = setup({ openPrs: [openPr({ body: '<!-- archify-sync tag=v3.1.0 -->' })] });
        expect(go()).toBe(0);
        expect(calls.filter((c) => c.startsWith('git'))).toEqual([]);
    });

    it('refuses, before any git command, when someone else pushed to the branch', () => {
        const { go, calls } = setup({ openPrs: [openPr({ commits: [{ authors: [{ email: 'dev@example.com' }] }] })] });
        expect(go).toThrow(/will not be force-updated/);
        expect(calls.filter((c) => c.startsWith('git'))).toEqual([]);
    });

    it('accepts exactly what a sync writes', () => {
        const { go } = setup({ staged: ['packages/AI/Diagrams/vendor/archify/renderers/a.mjs', 'packages/AI/Diagrams/assets/template.lite.html',
            'packages/AI/Diagrams/UPSTREAM.json', META.changeset] });
        expect(go()).toBe(0);
    });

    it.each(['.github/workflows/evil.yml', 'packages/AI/Diagrams/package.json'])('refuses a prepared patch that touches %s', (path) => {
        const { go, calls } = setup({ staged: ['packages/AI/Diagrams/UPSTREAM.json', path] });
        expect(go).toThrow(`touches files a sync never writes: ${path}`);
        expect(calls.some((c) => c.startsWith('git commit') || c.includes(' commit '))).toBe(false);
        expect(calls.some((c) => c.startsWith('git push'))).toBe(false);
    });

    it('ignores a changeset path in meta.json and allows only the one recomputed from the tags', () => {
        const action = '.github/actions/mj-setup/action.yml';
        const tampered = setup({ meta: { ...META, changeset: action }, staged: ['packages/AI/Diagrams/UPSTREAM.json', action] });
        expect(tampered.go).toThrow(`touches files a sync never writes: ${action}`);
        expect(tampered.calls.some((c) => c.startsWith('git push'))).toBe(false);
        // The real changeset still passes, whatever meta.json claimed.
        expect(setup({ meta: { ...META, changeset: action } }).go()).toBe(0);
    });

    it.each([
        ['as a delete plus an add (--no-renames)', ['D\t.github/CODEOWNERS', 'A\tpackages/AI/Diagrams/vendor/archify/x']],
        ['as a rename line', ['R100\t.github/CODEOWNERS\tpackages/AI/Diagrams/vendor/archify/x']],
        ['as a plain delete', ['D\t.github/CODEOWNERS']],
    ])('refuses a rename from outside the allow-list, reported %s', (_, staged) => {
        const { go, calls } = setup({ staged });
        expect(go).toThrow('touches files a sync never writes: .github/CODEOWNERS');
        expect(calls).toContain('git diff --cached --name-status --no-renames');
        expect(calls.some((c) => c.startsWith('git push'))).toBe(false);
    });

    it.each([
        ['a path in a tag', { to: 'v3.1.0/../../x' }],
        ['a non-string tag', { from: ['v3.0.0'] }],
        ['a manifest for another release', { manifest: MANIFEST }],
        ['a manifest that fails validation', { manifest: { ...META.manifest, severity: '@evil' } }],
    ])('refuses meta.json with %s before any git command', (_, over) => {
        const { go, calls } = setup({ meta: { ...META, ...over } });
        expect(go).toThrow(/refusing/);
        expect(calls.filter((c) => c.startsWith('git'))).toEqual([]);
    });

    it('builds the body, fenced and sized, before the push', () => {
        const releases = Array.from({ length: 20 }, (_, i) => ({
            tag_name: `v3.0.${i + 1}`, html_url: `h/${i}`, published_at: '2026-09-28T00:00:00Z', body: `@someone <img src=x> ${'n'.repeat(5900)}`,
        }));
        const meta = { ...META, checks: [...META.checks, { name: '@evil [click](https://e.example)', status: 'FAILED', output: 'x' }] };
        const { go, atPush } = setup({ meta, releases });
        expect(go()).toBe(0);
        expect(atPush.body).toMatch(/^<!-- archify-sync tag=v3\.1\.0 -->/);
        expect(atPush.body.length).toBeLessThanOrEqual(BODY_LIMIT);
        expect(atPush.body).toContain('```\n@someone <img src=x> nnn');
        expect(atPush.body).not.toContain('@evil');
    });
});

describe('archify-sync.yml', () => {
    const wf = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../workflows/archify-sync.yml'), 'utf8');
    const job = (name) => wf.slice(wf.indexOf(`  ${name}:\n`)).split(/\n {2}(?=\S)/)[0];

    it('uses no PAT or other secret: publish writes with GITHUB_TOKEN', () => {
        expect(wf).not.toMatch(/secrets\./);
        expect(wf).not.toContain('MJ_GH_BOT');
        expect(job('publish')).toContain('GH_TOKEN: ${{ github.token }}');
    });

    it('grants publish exactly contents and pull-requests write', () => {
        expect(job('publish')).toMatch(/permissions:\n {6}contents: write\n {6}pull-requests: write\n(?! {6}\S)/);
    });

    it('never saves a cache from prepare, which runs upstream code', () => {
        const prepare = job('prepare').split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');
        expect(prepare).toMatch(/run: node \.github\/scripts\/archify-sync\.mjs prepare/);
        expect(prepare).not.toContain('mj-setup');
        expect(prepare).not.toContain('actions/cache');
        expect(prepare).toContain("cache: 'false'");
        expect(prepare).toContain('package-manager-cache: false');
        expect(prepare.match(/cache:/g)).toHaveLength(2);
    });
});
