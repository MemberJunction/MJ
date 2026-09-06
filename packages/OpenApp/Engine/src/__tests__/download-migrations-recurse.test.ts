/**
 * #3858 — DownloadMigrations must fetch what skyway will run: the RECURSIVE .sql set, and an empty
 * download is a failure, not a green install with an empty schema.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// Intercept at the Octokit boundary — ListDirectory/FetchFileContent are private to the module,
// and mocking the transport keeps them (and the walk) genuinely under test.
const getContent = vi.hoisted(() => vi.fn());
vi.mock('@octokit/rest', () => ({
    Octokit: class {
        public repos = { getContent };
        public git = { getBlob: vi.fn() };
    },
}));

import { DownloadMigrations } from '../github/github-client';

const OPTIONS = {} as Parameters<typeof DownloadMigrations>[4];
let dir: string;

beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'mj-3858-'));
    getContent.mockReset();
});

afterEach(() => rmSync(dir, { recursive: true, force: true }));

/**
 * Wires the Contents API to a fake repo tree: a DIRECTORY path answers with its entry list, a FILE
 * path answers with inline base64 content — the same two shapes the real API returns.
 */
function treeOf(byDir: Record<string, { type: string; name: string; path: string }[]>): void {
    getContent.mockImplementation(async ({ path }: { path: string }) => {
        if (byDir[path]) {
            return { data: byDir[path].map(e => ({ ...e, sha: 'sha-' + e.name })) };
        }
        return {
            data: {
                type: 'file', sha: 'sha-file', encoding: 'base64',
                content: Buffer.from(`-- ${path}`).toString('base64'),
            },
        };
    });
}

describe('DownloadMigrations (#3858)', () => {
    it('descends into subdirectories and preserves relative paths on disk', async () => {
        treeOf({
            'migrations': [
                { type: 'file', name: 'V1__a.sql', path: 'migrations/V1__a.sql' },
                { type: 'dir', name: 'extra', path: 'migrations/extra' },
                { type: 'file', name: 'README.md', path: 'migrations/README.md' },
            ],
            'migrations/extra': [
                { type: 'file', name: 'V2__b.sql', path: 'migrations/extra/V2__b.sql' },
            ],
        });
        const result = await DownloadMigrations('https://github.com/o/r', undefined, 'migrations', dir, OPTIONS);
        expect(result.Success).toBe(true);
        expect(result.Files?.sort()).toEqual(['V1__a.sql', 'extra/V2__b.sql']);
        // Structure survives on disk — flattening file.name would let two same-named migrations in
        // different subdirectories silently overwrite each other.
        expect(readFileSync(join(dir, 'extra', 'V2__b.sql'), 'utf-8')).toContain('V2__b.sql');
    });

    it('treats ZERO downloaded files as a FAILURE with an actionable message', async () => {
        // The old `Success: true, Files: []` let an install proceed, record the app as installed,
        // and leave the host with an empty schema and a green result — the one place the migration
        // phase failed soft.
        treeOf({ 'migrations': [{ type: 'file', name: 'notes.md', path: 'migrations/notes.md' }] });
        const result = await DownloadMigrations('https://github.com/o/r', undefined, 'migrations', dir, OPTIONS);
        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toMatch(/No \.sql files/);
        expect(result.ErrorMessage).toMatch(/mj-app\.json/);
    });

    it('refuses a pathologically deep tree instead of walking forever', async () => {
        const deep: Record<string, { type: string; name: string; path: string }[]> = {};
        let path = 'migrations';
        for (let i = 0; i < 10; i++) {
            const child = `${path}/d${i}`;
            deep[path] = [{ type: 'dir', name: `d${i}`, path: child }];
            path = child;
        }
        deep[path] = [{ type: 'file', name: 'V9__deep.sql', path: `${path}/V9__deep.sql` }];
        treeOf(deep);
        const result = await DownloadMigrations('https://github.com/o/r', undefined, 'migrations', dir, OPTIONS);
        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toMatch(/nesting exceeds/);
    });
});
