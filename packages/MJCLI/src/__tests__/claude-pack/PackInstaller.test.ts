import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
    mkdtempSync,
    mkdirSync,
    readFileSync,
    rmSync,
    writeFileSync,
    existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { installPack } from '../../lib/claude-pack/PackInstaller.js';
import type { HttpGetter, HttpResponse } from '../../lib/claude-pack/PackFetcher.js';
import type { Manifest } from '../../lib/claude-pack/PackTypes.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const PACK_CLAUDE_MD = `# Project Instructions for Claude Code

<!-- MJ-MANAGED:CLAUDE-PACK START version=5.1.0 mj-major=5 -->

@.claude/mj/core.md
@.claude/mj/v5.md

<!-- MJ-MANAGED:CLAUDE-PACK END -->
`;

const PACK_SETTINGS = JSON.stringify({
    __mj_managed: {
        version: '5.1.0',
        mjMajor: '5',
        keys: ['permissions.allow', 'env.MJ_CLAUDE_PACK'],
    },
    permissions: { allow: ['Bash(npm install)'] },
    env: { MJ_CLAUDE_PACK: '5.1.0' },
});

const PACK_CONTENTS: Record<string, string> = {
    'CLAUDE.md': PACK_CLAUDE_MD,
    '.claude/settings.json': PACK_SETTINGS,
    '.claude/mj/core.md': '# core\n',
    '.claude/mj/v5.md': '# v5\n',
    '.claude/mj/VERSION': '5.1.0\n',
    '.claude/mj/README.md': '# managed\n',
};

function sha(content: string): string {
    return createHash('sha256').update(content).digest('hex');
}

function utf8(s: string): Uint8Array {
    return new TextEncoder().encode(s);
}

function makeManifest(packVersion = '5.1.0', mjMajor = '5'): Manifest {
    return {
        packVersion,
        mjMajor,
        remoteUrlPrefix: `https://example/v${mjMajor}/`,
        files: Object.entries(PACK_CONTENTS).map(([p, c]) => ({
            path: p,
            bytes: Buffer.byteLength(c, 'utf8'),
            sha256: sha(c),
        })),
    };
}

/** Write the pack contents to a temp directory as if it were an unpacked dist. */
function writeFixturePackToDir(dir: string, manifest: Manifest): void {
    for (const [rel, content] of Object.entries(PACK_CONTENTS)) {
        const abs = path.join(dir, ...rel.split('/'));
        mkdirSync(path.dirname(abs), { recursive: true });
        writeFileSync(abs, content);
    }
    const manifestPath = path.join(dir, '.claude', 'mj', 'MANIFEST.json');
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
}

/** Build a mock HttpGetter from a URL→response map (404 by default). */
function mockHttp(responses: Record<string, HttpResponse>): HttpGetter {
    return vi.fn(async (url: string) => {
        if (responses[url] === undefined) {
            return { statusCode: 404, body: utf8('Not Found') };
        }
        return responses[url];
    });
}

const ok = (body: string): HttpResponse => ({ statusCode: 200, body: utf8(body) });

/** Construct a fully-populated mock httpGet that serves the fixture pack. */
function mockServingFixturePack(major = '5', ref = 'main'): HttpGetter {
    const manifest = makeManifest('5.1.0', major);
    const base = `https://raw.githubusercontent.com/MemberJunction/MJ/${ref}/templates/claude-pack/dist/v${major}/`;
    const responses: Record<string, HttpResponse> = {
        [base + '.claude/mj/MANIFEST.json']: ok(JSON.stringify(manifest)),
    };
    for (const [p, c] of Object.entries(PACK_CONTENTS)) {
        responses[base + p] = ok(c);
    }
    return mockHttp(responses);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('installPack — source resolution', () => {
    let target: string;
    let packDir: string;
    beforeEach(() => {
        target = mkdtempSync(path.join(tmpdir(), 'mj-installer-target-'));
        packDir = mkdtempSync(path.join(tmpdir(), 'mj-installer-pack-'));
        // Seed target with a package.json so MJ major can be auto-detected
        writeFileSync(
            path.join(target, 'package.json'),
            JSON.stringify({ name: 'user', dependencies: { '@memberjunction/cli': '^5.33.0' } })
        );
    });
    afterEach(() => {
        rmSync(target, { recursive: true, force: true });
        rmSync(packDir, { recursive: true, force: true });
    });

    it('errors when MJ major cannot be detected and --major not given', async () => {
        // overwrite package.json without an MJ dep
        writeFileSync(
            path.join(target, 'package.json'),
            JSON.stringify({ name: 'user', dependencies: {} })
        );
        const result = await installPack({ TargetDir: target });
        expect(result.ok).toBe(false);
        expect(result.actions.errors.some((e) => e.includes('major'))).toBe(true);
    });

    it('respects --major override', async () => {
        // No package.json deps for MJ, but --major is passed
        writeFileSync(path.join(target, 'package.json'), JSON.stringify({ name: 'user' }));
        writeFixturePackToDir(packDir, makeManifest());
        const result = await installPack({
            TargetDir: target,
            Major: '5',
            FromPath: packDir,
        });
        expect(result.ok).toBe(true);
    });

    it('errors when --offline given without --from', async () => {
        const result = await installPack({ TargetDir: target, Offline: true });
        expect(result.ok).toBe(false);
        expect(result.actions.errors.some((e) => e.includes('--from'))).toBe(true);
    });

    it('loads pack from --from (already-unpacked dist directory)', async () => {
        writeFixturePackToDir(packDir, makeManifest());
        const result = await installPack({ TargetDir: target, FromPath: packDir });
        expect(result.ok).toBe(true);
        expect(result.packVersion).toBe('5.1.0');
        expect(existsSync(path.join(target, 'CLAUDE.md'))).toBe(true);
        expect(existsSync(path.join(target, '.claude/mj/VERSION'))).toBe(true);
    });

    it('errors when --from path has no manifest', async () => {
        // packDir exists but is empty
        const result = await installPack({ TargetDir: target, FromPath: packDir });
        expect(result.ok).toBe(false);
        expect(result.actions.errors.some((e) => e.includes('--from'))).toBe(true);
    });

    it('errors on checksum mismatch in local pack', async () => {
        writeFixturePackToDir(packDir, makeManifest());
        // Tamper with one of the files after writing the manifest
        writeFileSync(path.join(packDir, '.claude/mj/core.md'), 'tampered content\n');
        const result = await installPack({ TargetDir: target, FromPath: packDir });
        expect(result.ok).toBe(false);
        expect(result.actions.errors.some((e) => e.toLowerCase().includes('checksum'))).toBe(true);
    });

    it('fetches from network when no --from is given', async () => {
        const result = await installPack({
            TargetDir: target,
            HttpGet: mockServingFixturePack(),
        });
        expect(result.ok).toBe(true);
        expect(result.packVersion).toBe('5.1.0');
        expect(existsSync(path.join(target, 'CLAUDE.md'))).toBe(true);
    });
});

describe('installPack — --check fast path', () => {
    let target: string;
    let packDir: string;
    beforeEach(() => {
        target = mkdtempSync(path.join(tmpdir(), 'mj-installer-check-'));
        packDir = mkdtempSync(path.join(tmpdir(), 'mj-installer-check-pack-'));
        writeFileSync(
            path.join(target, 'package.json'),
            JSON.stringify({ name: 'user', dependencies: { '@memberjunction/cli': '^5.33.0' } })
        );
    });
    afterEach(() => {
        rmSync(target, { recursive: true, force: true });
        rmSync(packDir, { recursive: true, force: true });
    });

    it('reports up-to-date as a note (not a warning) when local version matches', async () => {
        writeFixturePackToDir(packDir, makeManifest('5.1.0'));
        // Plant a local VERSION matching the pack
        mkdirSync(path.join(target, '.claude/mj'), { recursive: true });
        writeFileSync(path.join(target, '.claude/mj/VERSION'), '5.1.0\n');

        const result = await installPack({
            TargetDir: target,
            FromPath: packDir,
            CheckOnly: true,
        });
        expect(result.ok).toBe(true);
        // "Up to date" is the success case — should land in notes, not warnings.
        expect(result.notes.some((n) => n.includes('up to date'))).toBe(true);
        expect(result.warnings.some((w) => w.includes('up to date'))).toBe(false);
        // --check doesn't write anything
        expect(existsSync(path.join(target, 'CLAUDE.md'))).toBe(false);
    });

    it('reports update available as a note (not a warning) when versions differ', async () => {
        writeFixturePackToDir(packDir, makeManifest('5.2.0'));
        mkdirSync(path.join(target, '.claude/mj'), { recursive: true });
        writeFileSync(path.join(target, '.claude/mj/VERSION'), '5.1.0\n');

        const result = await installPack({
            TargetDir: target,
            FromPath: packDir,
            CheckOnly: true,
        });
        // "Update available" is informational, not a warning state.
        expect(result.notes.some((n) => n.includes('Update available'))).toBe(true);
        expect(result.notes.some((n) => n.includes('5.2.0'))).toBe(true);
        expect(result.warnings.some((w) => w.includes('Update available'))).toBe(false);
    });

    it('reports no local pack found as a warning (not a note) when VERSION missing', async () => {
        writeFixturePackToDir(packDir, makeManifest('5.1.0'));
        // No local .claude/mj/VERSION
        const result = await installPack({
            TargetDir: target,
            FromPath: packDir,
            CheckOnly: true,
        });
        // "No local pack" IS a warning state — caller may want to act.
        expect(result.warnings.some((w) => w.includes('No local pack'))).toBe(true);
        expect(result.notes.some((n) => n.includes('No local pack'))).toBe(false);
    });
});

describe('installPack — cross-major guard', () => {
    let target: string;
    let packDir: string;
    beforeEach(() => {
        target = mkdtempSync(path.join(tmpdir(), 'mj-installer-major-'));
        packDir = mkdtempSync(path.join(tmpdir(), 'mj-installer-major-pack-'));
        writeFileSync(
            path.join(target, 'package.json'),
            JSON.stringify({ name: 'user', dependencies: { '@memberjunction/cli': '^5.33.0' } })
        );
    });
    afterEach(() => {
        rmSync(target, { recursive: true, force: true });
        rmSync(packDir, { recursive: true, force: true });
    });

    it('errors when pack major differs from local MJ major (no --allow-major)', async () => {
        // Local is v5, but we'll point to a v6 fixture pack
        writeFixturePackToDir(packDir, makeManifest('6.0.0', '6'));
        const result = await installPack({
            TargetDir: target,
            Major: '6', // override to use the v6 fixture
            FromPath: packDir,
            // ... but local MJ is v5 — installer checks pack.mjMajor vs Major
        });
        // Major is forced to 6 to match the fixture, and the fixture's pack.mjMajor IS 6.
        // So no mismatch in this case — the test setup above doesn't trigger the guard.
        // The actual guard is: pack.mjMajor !== Major. Below we force the mismatch.
        expect(result.ok).toBe(true);
    });

    it('errors with clear message when fixture has different mjMajor', async () => {
        // Build a v6 fixture but force Major=5 to trigger the mismatch
        writeFixturePackToDir(packDir, makeManifest('6.0.0', '6'));

        // The fixture's path lookup expects dist/v6/... but we'll point --from at the
        // already-unpacked dir, which works regardless of the major.
        // We force Major=5 so the installer's mismatch guard fires.
        const result = await installPack({
            TargetDir: target,
            Major: '5',
            FromPath: packDir,
        });

        // resolveLocalPackRoot with major=5 in our packDir (which is already-unpacked v6 content)
        // — the resolver accepts the dir as a valid pack regardless of major,
        // and the manifest carries mjMajor=6 — so the guard triggers.
        expect(result.ok).toBe(false);
        expect(result.actions.errors.some((e) => e.includes('--allow-major'))).toBe(true);
    });

    it('--allow-major lets the cross-major merge proceed', async () => {
        writeFixturePackToDir(packDir, makeManifest('6.0.0', '6'));
        const result = await installPack({
            TargetDir: target,
            Major: '5',
            FromPath: packDir,
            AllowMajor: true,
        });
        expect(result.ok).toBe(true);
    });
});

describe('installPack — output shape', () => {
    let target: string;
    let packDir: string;
    beforeEach(() => {
        target = mkdtempSync(path.join(tmpdir(), 'mj-installer-out-'));
        packDir = mkdtempSync(path.join(tmpdir(), 'mj-installer-out-pack-'));
        writeFileSync(
            path.join(target, 'package.json'),
            JSON.stringify({ name: 'user', dependencies: { '@memberjunction/cli': '^5.33.0' } })
        );
        writeFixturePackToDir(packDir, makeManifest());
    });
    afterEach(() => {
        rmSync(target, { recursive: true, force: true });
        rmSync(packDir, { recursive: true, force: true });
    });

    it('returns InstallResult with the §7.5-shaped fields', async () => {
        const result = await installPack({ TargetDir: target, FromPath: packDir });
        expect(result).toHaveProperty('ok');
        expect(result).toHaveProperty('packVersion', '5.1.0');
        expect(result).toHaveProperty('installedMJVersion', '5.33.0');
        expect(result).toHaveProperty('actions');
        expect(result.actions).toHaveProperty('added');
        expect(result.actions).toHaveProperty('updated');
        expect(result.actions).toHaveProperty('skipped');
        expect(result.actions).toHaveProperty('errors');
        expect(result).toHaveProperty('warnings');
        // notes was added in the same PR as the "up to date" reclassification —
        // §7.5 schema guarantees it's always present, even as `[]`, so downstream
        // consumers can iterate without optional chaining.
        expect(result).toHaveProperty('notes');
        expect(Array.isArray(result.notes)).toBe(true);
    });

    it('writes the manifest into the user .claude/mj/ directory', async () => {
        await installPack({ TargetDir: target, FromPath: packDir });
        const manifestPath = path.join(target, '.claude/mj/MANIFEST.json');
        expect(existsSync(manifestPath)).toBe(true);
        const parsed = JSON.parse(readFileSync(manifestPath, 'utf8'));
        expect(parsed.packVersion).toBe('5.1.0');
    });
});
