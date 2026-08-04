import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
    mkdtempSync,
    mkdirSync,
    readFileSync,
    rmSync,
    writeFileSync,
    existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { mergePack } from '../../lib/claude-pack/PackMerger.js';
import type { Manifest } from '../../lib/claude-pack/PackTypes.js';

const PACK_CLAUDE_MD = `# Project Instructions for Claude Code

<!-- MJ-MANAGED:CLAUDE-PACK START version=5.1.0 mj-major=5 -->

@.claude/mj/core.md
@.claude/mj/v5.md

<!-- MJ-MANAGED:CLAUDE-PACK END -->

## Project notes
`;

const PACK_SETTINGS = JSON.stringify({
    __mj_managed: { version: '5.1.0', mjMajor: '5', keys: ['permissions.allow', 'env.MJ_CLAUDE_PACK'] },
    permissions: { allow: ['Bash(npm install)', 'Bash(git status)'] },
    env: { MJ_CLAUDE_PACK: '5.1.0' },
});

const PACK_CORE = '# Core guidance\nrules here\n';
const PACK_V5 = '# v5 overlay\nv5 stuff\n';
const PACK_README = '# Managed bundle README\n';
const PACK_VERSION = '5.1.0\n';
const PACK_COMMAND = '# /commit\nThe commit command.\n';
const PACK_SKILL = '---\nname: test-skill\n---\n# test-skill\n';

function utf8(s: string): Uint8Array {
    return new TextEncoder().encode(s);
}

function makePackFiles(extras: Record<string, string> = {}): Map<string, Uint8Array> {
    const files = new Map<string, Uint8Array>();
    files.set('CLAUDE.md', utf8(PACK_CLAUDE_MD));
    files.set('.claude/settings.json', utf8(PACK_SETTINGS));
    files.set('.claude/mj/core.md', utf8(PACK_CORE));
    files.set('.claude/mj/v5.md', utf8(PACK_V5));
    files.set('.claude/mj/VERSION', utf8(PACK_VERSION));
    files.set('.claude/mj/README.md', utf8(PACK_README));
    files.set('.claude/commands/commit.md', utf8(PACK_COMMAND));
    files.set('.claude/skills/test-skill/SKILL.md', utf8(PACK_SKILL));
    for (const [k, v] of Object.entries(extras)) files.set(k, utf8(v));
    return files;
}

const STUB_MANIFEST: Manifest = {
    packVersion: '5.1.0',
    mjMajor: '5',
    remoteUrlPrefix: 'https://example/',
    files: [], // not used by the merger directly
};

describe('mergePack', () => {
    let tmp: string;
    beforeEach(() => {
        tmp = mkdtempSync(path.join(tmpdir(), 'mj-pack-merger-'));
    });
    afterEach(() => {
        rmSync(tmp, { recursive: true, force: true });
    });

    // ───────────────────────────────────────────────────────────────────
    // CLAUDE.md
    // ───────────────────────────────────────────────────────────────────
    describe('CLAUDE.md', () => {
        it('writes the file when absent', () => {
            const result = mergePack({
                TargetDir: tmp,
                PackFiles: makePackFiles(),
                Manifest: STUB_MANIFEST,
            });
            expect(result.Actions.added).toContain('CLAUDE.md');
            expect(readFileSync(path.join(tmp, 'CLAUDE.md'), 'utf8')).toBe(PACK_CLAUDE_MD);
        });

        it('rewrites only the managed block when CLAUDE.md exists with markers', () => {
            const existing = `# My project\n\n<!-- MJ-MANAGED:CLAUDE-PACK START version=5.0.0 -->\nOLD\n<!-- MJ-MANAGED:CLAUDE-PACK END -->\n\n## My notes\nproject-specific\n`;
            writeFileSync(path.join(tmp, 'CLAUDE.md'), existing);

            const result = mergePack({
                TargetDir: tmp,
                PackFiles: makePackFiles(),
                Manifest: STUB_MANIFEST,
            });
            expect(result.Actions.updated).toContain('CLAUDE.md');
            const written = readFileSync(path.join(tmp, 'CLAUDE.md'), 'utf8');
            expect(written).toContain('# My project');
            expect(written).toContain('## My notes');
            expect(written).toContain('project-specific');
            expect(written).toContain('@.claude/mj/core.md');
            expect(written).not.toContain('OLD');
            expect(written).toContain('version=5.1.0');
        });

        it('wraps unmanaged CLAUDE.md with markers, keeping user content below', () => {
            writeFileSync(path.join(tmp, 'CLAUDE.md'), '# my project\n\nuser stuff\n');
            mergePack({ TargetDir: tmp, PackFiles: makePackFiles(), Manifest: STUB_MANIFEST });
            const written = readFileSync(path.join(tmp, 'CLAUDE.md'), 'utf8');
            const startIdx = written.indexOf('MJ-MANAGED:CLAUDE-PACK START');
            const endIdx = written.indexOf('MJ-MANAGED:CLAUDE-PACK END');
            const userIdx = written.indexOf('# my project');
            expect(startIdx).toBeGreaterThan(-1);
            expect(endIdx).toBeGreaterThan(startIdx);
            expect(userIdx).toBeGreaterThan(endIdx);
        });

        it('skips when rewrite produces identical content', () => {
            writeFileSync(path.join(tmp, 'CLAUDE.md'), PACK_CLAUDE_MD);
            const result = mergePack({
                TargetDir: tmp,
                PackFiles: makePackFiles(),
                Manifest: STUB_MANIFEST,
            });
            expect(result.Actions.skipped.some((s) => s.startsWith('CLAUDE.md'))).toBe(true);
        });

        it('warns and skips when CLAUDE.md has malformed markers', () => {
            // END before START
            const broken = `<!-- MJ-MANAGED:CLAUDE-PACK END -->\nstuff\n<!-- MJ-MANAGED:CLAUDE-PACK START -->\n`;
            writeFileSync(path.join(tmp, 'CLAUDE.md'), broken);
            const result = mergePack({
                TargetDir: tmp,
                PackFiles: makePackFiles(),
                Manifest: STUB_MANIFEST,
            });
            expect(result.Actions.skipped.some((s) => s.startsWith('CLAUDE.md'))).toBe(true);
            expect(result.Warnings.length).toBeGreaterThan(0);
            // unchanged
            expect(readFileSync(path.join(tmp, 'CLAUDE.md'), 'utf8')).toBe(broken);
        });

        it('records an error when pack CLAUDE.md is absent', () => {
            const files = makePackFiles();
            files.delete('CLAUDE.md');
            const result = mergePack({
                TargetDir: tmp,
                PackFiles: files,
                Manifest: STUB_MANIFEST,
            });
            expect(result.Actions.errors.some((e) => e.startsWith('CLAUDE.md'))).toBe(true);
        });
    });

    // ───────────────────────────────────────────────────────────────────
    // .claude/mj/**
    // ───────────────────────────────────────────────────────────────────
    describe('.claude/mj/** (managed bundle)', () => {
        it('writes all mj/* files when absent', () => {
            mergePack({ TargetDir: tmp, PackFiles: makePackFiles(), Manifest: STUB_MANIFEST });
            expect(existsSync(path.join(tmp, '.claude/mj/core.md'))).toBe(true);
            expect(existsSync(path.join(tmp, '.claude/mj/v5.md'))).toBe(true);
            expect(existsSync(path.join(tmp, '.claude/mj/VERSION'))).toBe(true);
            expect(existsSync(path.join(tmp, '.claude/mj/README.md'))).toBe(true);
            expect(readFileSync(path.join(tmp, '.claude/mj/VERSION'), 'utf8')).toBe(PACK_VERSION);
        });

        it('sweeps stale .claude/mj/ files that the new pack does not ship', () => {
            // Pre-seed with a stale file
            mkdirSync(path.join(tmp, '.claude/mj'), { recursive: true });
            writeFileSync(path.join(tmp, '.claude/mj/stale-file.md'), 'leftover');
            mergePack({ TargetDir: tmp, PackFiles: makePackFiles(), Manifest: STUB_MANIFEST });
            expect(existsSync(path.join(tmp, '.claude/mj/stale-file.md'))).toBe(false);
        });

        it('skips identical mj/* files', () => {
            mkdirSync(path.join(tmp, '.claude/mj'), { recursive: true });
            writeFileSync(path.join(tmp, '.claude/mj/core.md'), PACK_CORE);
            const result = mergePack({
                TargetDir: tmp,
                PackFiles: makePackFiles(),
                Manifest: STUB_MANIFEST,
            });
            expect(result.Actions.skipped.some((s) => s.startsWith('.claude/mj/core.md'))).toBe(true);
        });
    });

    // ───────────────────────────────────────────────────────────────────
    // settings.json
    // ───────────────────────────────────────────────────────────────────
    describe('.claude/settings.json', () => {
        it('writes the baseline when absent', () => {
            mergePack({ TargetDir: tmp, PackFiles: makePackFiles(), Manifest: STUB_MANIFEST });
            const written = JSON.parse(
                readFileSync(path.join(tmp, '.claude/settings.json'), 'utf8')
            );
            expect(written.permissions.allow).toContain('Bash(npm install)');
            expect(written.env.MJ_CLAUDE_PACK).toBe('5.1.0');
            expect(written.__mj_managed.version).toBe('5.1.0');
        });

        it('deep-merges into existing settings, preserving user keys', () => {
            mkdirSync(path.join(tmp, '.claude'));
            writeFileSync(
                path.join(tmp, '.claude/settings.json'),
                JSON.stringify({
                    customField: 'kept',
                    permissions: { allow: ['Bash(my-custom)'], deny: ['Bash(rm -rf)'] },
                })
            );
            mergePack({ TargetDir: tmp, PackFiles: makePackFiles(), Manifest: STUB_MANIFEST });
            const written = JSON.parse(
                readFileSync(path.join(tmp, '.claude/settings.json'), 'utf8')
            );
            expect(written.customField).toBe('kept');
            expect(written.permissions.deny).toEqual(['Bash(rm -rf)']);
            expect(written.permissions.allow).toContain('Bash(my-custom)');
            expect(written.permissions.allow).toContain('Bash(npm install)');
        });

        it('--skip-settings leaves the file untouched', () => {
            mergePack({
                TargetDir: tmp,
                PackFiles: makePackFiles(),
                Manifest: STUB_MANIFEST,
                SkipSettings: true,
            });
            expect(existsSync(path.join(tmp, '.claude/settings.json'))).toBe(false);
        });

        it('warns and skips when existing settings.json is malformed JSON', () => {
            mkdirSync(path.join(tmp, '.claude'));
            writeFileSync(path.join(tmp, '.claude/settings.json'), '{ not valid');
            const result = mergePack({
                TargetDir: tmp,
                PackFiles: makePackFiles(),
                Manifest: STUB_MANIFEST,
            });
            expect(result.Warnings.some((w) => w.includes('malformed'))).toBe(true);
            expect(result.Actions.skipped.some((s) => s.startsWith('.claude/settings.json'))).toBe(
                true
            );
        });
    });

    // ───────────────────────────────────────────────────────────────────
    // commands / skills
    // ───────────────────────────────────────────────────────────────────
    describe('.claude/commands/* (seed-once)', () => {
        it('writes new commands when absent', () => {
            mergePack({ TargetDir: tmp, PackFiles: makePackFiles(), Manifest: STUB_MANIFEST });
            expect(existsSync(path.join(tmp, '.claude/commands/commit.md'))).toBe(true);
        });

        it('keeps user-modified commands without --force (warns)', () => {
            mkdirSync(path.join(tmp, '.claude/commands'), { recursive: true });
            writeFileSync(
                path.join(tmp, '.claude/commands/commit.md'),
                '# my customized commit command\n'
            );
            const result = mergePack({
                TargetDir: tmp,
                PackFiles: makePackFiles(),
                Manifest: STUB_MANIFEST,
            });
            expect(result.Warnings.some((w) => w.includes('commit.md'))).toBe(true);
            expect(
                readFileSync(path.join(tmp, '.claude/commands/commit.md'), 'utf8')
            ).toBe('# my customized commit command\n');
            expect(existsSync(path.join(tmp, '.claude/commands/commit.md.bak'))).toBe(false);
        });

        it('--force overwrites user-modified commands and saves a .bak', () => {
            mkdirSync(path.join(tmp, '.claude/commands'), { recursive: true });
            writeFileSync(
                path.join(tmp, '.claude/commands/commit.md'),
                '# my customized commit command\n'
            );
            mergePack({
                TargetDir: tmp,
                PackFiles: makePackFiles(),
                Manifest: STUB_MANIFEST,
                Force: true,
            });
            expect(readFileSync(path.join(tmp, '.claude/commands/commit.md'), 'utf8')).toBe(
                PACK_COMMAND
            );
            expect(readFileSync(path.join(tmp, '.claude/commands/commit.md.bak'), 'utf8')).toBe(
                '# my customized commit command\n'
            );
        });

        it('--refresh-commands forces overwrite (same effect as --force for commands)', () => {
            mkdirSync(path.join(tmp, '.claude/commands'), { recursive: true });
            writeFileSync(path.join(tmp, '.claude/commands/commit.md'), 'user\n');
            mergePack({
                TargetDir: tmp,
                PackFiles: makePackFiles(),
                Manifest: STUB_MANIFEST,
                RefreshCommands: true,
            });
            expect(readFileSync(path.join(tmp, '.claude/commands/commit.md'), 'utf8')).toBe(
                PACK_COMMAND
            );
        });

        it('skips identical commands', () => {
            mkdirSync(path.join(tmp, '.claude/commands'), { recursive: true });
            writeFileSync(path.join(tmp, '.claude/commands/commit.md'), PACK_COMMAND);
            const result = mergePack({
                TargetDir: tmp,
                PackFiles: makePackFiles(),
                Manifest: STUB_MANIFEST,
            });
            expect(
                result.Actions.skipped.some((s) => s.startsWith('.claude/commands/commit.md'))
            ).toBe(true);
        });

        it('--skip-commands omits commands entirely', () => {
            mergePack({
                TargetDir: tmp,
                PackFiles: makePackFiles(),
                Manifest: STUB_MANIFEST,
                SkipCommands: true,
            });
            expect(existsSync(path.join(tmp, '.claude/commands'))).toBe(false);
        });
    });

    describe('.claude/skills/** (seed-once, nested)', () => {
        it('writes nested skill files when absent', () => {
            mergePack({ TargetDir: tmp, PackFiles: makePackFiles(), Manifest: STUB_MANIFEST });
            expect(existsSync(path.join(tmp, '.claude/skills/test-skill/SKILL.md'))).toBe(true);
        });

        it('--skip-skills omits skills entirely', () => {
            mergePack({
                TargetDir: tmp,
                PackFiles: makePackFiles(),
                Manifest: STUB_MANIFEST,
                SkipSkills: true,
            });
            expect(existsSync(path.join(tmp, '.claude/skills'))).toBe(false);
        });
    });

    // ───────────────────────────────────────────────────────────────────
    // dry-run
    // ───────────────────────────────────────────────────────────────────
    describe('--dry-run', () => {
        it('reports actions without writing anything', () => {
            const result = mergePack({
                TargetDir: tmp,
                PackFiles: makePackFiles(),
                Manifest: STUB_MANIFEST,
                DryRun: true,
            });
            // Actions populated
            expect(result.Actions.added.length).toBeGreaterThan(0);
            // But nothing on disk
            expect(existsSync(path.join(tmp, 'CLAUDE.md'))).toBe(false);
            expect(existsSync(path.join(tmp, '.claude'))).toBe(false);
        });
    });
});
