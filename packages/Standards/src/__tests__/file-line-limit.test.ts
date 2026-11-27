import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { CountSourceLines, FileLineLimitCheck } from '../checks/file-line-limit.js';

const tempDirs: string[] = [];

function createTempRepo(files: Record<string, string>): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mj-std-line-limit-'));
    tempDirs.push(dir);
    for (const [rel, content] of Object.entries(files)) {
        const full = path.join(dir, rel);
        fs.mkdirSync(path.dirname(full), { recursive: true });
        fs.writeFileSync(full, content, 'utf8');
    }
    return dir;
}

function makeLines(count: number, prefixLines: string[] = []): string {
    const lines = [...prefixLines];
    while (lines.length < count) {
        lines.push(`export const line_${lines.length + 1} = ${lines.length + 1};`);
    }
    return `${lines.join('\n')}\n`;
}

afterEach(() => {
    while (tempDirs.length > 0) {
        const d = tempDirs.pop();
        if (d && fs.existsSync(d)) {
            fs.rmSync(d, { recursive: true, force: true });
        }
    }
});

describe('file-line-limit standard', () => {
    it('counts logical lines consistently with and without trailing newline', () => {
        expect(CountSourceLines('').LineCount).toBe(0);
        expect(CountSourceLines('a\nb\n').LineCount).toBe(2);
        expect(CountSourceLines('a\nb').LineCount).toBe(2);
        expect(CountSourceLines('a\r\nb\r\n').LineCount).toBe(2);
    });

    it('passes a 1,000-line file and fails a 1,001-line un-allowlisted file', async () => {
        const repo = createTempRepo({
            'packages/AI/Agents/src/exact-limit.ts': makeLines(1000),
            'packages/AI/Agents/src/over-limit.ts': makeLines(1001),
        });

        const res = await FileLineLimitCheck.Run({
            RepoRoot: repo,
            Roots: ['packages/AI/Agents/src'],
            Options: FileLineLimitCheck.DefaultOptions ?? {},
        });

        expect(res.Violations).toHaveLength(1);
        expect(res.Violations[0].File).toBe('packages/AI/Agents/src/over-limit.ts');
        expect(res.Violations[0].Line).toBe(1001);
        expect(res.Violations[0].Message).toContain('1001 lines');
        expect(res.Violations[0].Message).toContain('1000-line limit');
    });

    it('passes a 1,001-line file with a top-of-file // file-size-ok: <reason> pragma and rejects one placed below the header', async () => {
        const repo = createTempRepo({
            'packages/AI/Agents/src/exempt-header.ts': makeLines(1001, [
                '// file-size-ok: generated lookup table',
            ]),
            'packages/AI/Agents/src/late-pragma.ts': makeLines(1001, [
                ...Array.from({ length: 20 }, (_, i) => `export const pre_${i} = ${i};`),
                '// file-size-ok: buried too far down',
            ]),
        });

        const res = await FileLineLimitCheck.Run({
            RepoRoot: repo,
            Roots: ['packages/AI/Agents/src'],
            Options: FileLineLimitCheck.DefaultOptions ?? {},
        });

        expect(res.Violations).toHaveLength(1);
        expect(res.Violations[0].File).toBe('packages/AI/Agents/src/late-pragma.ts');
    });

    it('passes allowlisted files and excludes test/spec/declaration files', async () => {
        const repo = createTempRepo({
            'packages/AI/Agents/src/grandfathered.ts': makeLines(2500),
            'packages/AI/Agents/src/__tests__/huge-suite.test.ts': makeLines(4500),
            'packages/AI/Agents/src/inline.spec.ts': makeLines(1500),
            'packages/AI/Agents/src/types.d.ts': makeLines(1500),
        });

        const res = await FileLineLimitCheck.Run({
            RepoRoot: repo,
            Roots: ['packages/AI/Agents/src'],
            Options: {
                MaxLines: 1000,
                HeaderReasonPattern: '//\\s*file-size-ok:\\s*\\S+',
                Allowlist: ['packages/AI/Agents/src/grandfathered.ts'],
            },
        });

        expect(res.Violations).toHaveLength(0);
    });

    it('uses empty DefaultRoots and enforces per-file ratchet caps when Allowlist is a Record<string, number> (H3)', async () => {
        expect(FileLineLimitCheck.DefaultRoots).toEqual([]);

        const repo = createTempRepo({
            'packages/AI/Agents/src/at-cap.ts': makeLines(1200),
            'packages/AI/Agents/src/grew-past-cap.ts': makeLines(1201),
        });

        const res = await FileLineLimitCheck.Run({
            RepoRoot: repo,
            Roots: ['packages/AI/Agents/src'],
            Options: {
                MaxLines: 1000,
                HeaderReasonPattern: '//\\s*file-size-ok:\\s*\\S+',
                Allowlist: {
                    'packages/AI/Agents/src/at-cap.ts': 1200,
                    'packages/AI/Agents/src/grew-past-cap.ts': 1200,
                },
            },
        });

        expect(res.Violations).toHaveLength(1);
        expect(res.Violations[0].File).toBe('packages/AI/Agents/src/grew-past-cap.ts');
        expect(res.Violations[0].Message).toContain('ratchet cap of 1200');
    });
});
