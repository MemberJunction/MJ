import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    detectPoolSetting,
    findThreadUnsafeCalls,
    classifyConfig,
    isTestSupportFile,
    checkVitestThreadsSafety,
    DEFAULT_ALLOWLIST_PATH,
} from '../check-vitest-threads-safety.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

const SHARED_FORKS = `export default defineConfig({ test: { globals: true } });`;
const SHARED_THREADS = `export default defineConfig({ test: { globals: true, pool: 'threads' } });`;
const NODE_PRESET_CONFIG = `import shared from '../../vitest.shared';\nexport default mergeConfig(shared, defineProject({ test: { environment: 'node' } }));`;
const EXPLICIT_THREADS_CONFIG = `import shared from '../../vitest.shared';\nexport default mergeConfig(shared, defineProject({ test: { pool: 'threads' } }));`;
const DUAL_PRESET_CONFIG = [
    `import nodeShared from '../../vitest.shared';`,
    `import domShared from '../../vitest.dom.shared';`,
    `export default defineConfig({ test: { projects: [`,
    `  mergeConfig(nodeShared, defineConfig({ test: { name: 'node', environment: 'node' } })),`,
    `  mergeConfig(domShared, defineConfig({ test: { name: 'dom', pool: 'forks' } })),`,
    `] } });`,
].join('\n');
const PROOF = 'https://github.com/MemberJunction/MJ/actions/runs/123456789';

describe('check-vitest-threads-safety', () => {
    const temps = [];

    /** Build a throwaway repo: `{ shared, allowlist, files: { 'packages/X/...': text } }`. */
    const makeRepo = ({ shared = SHARED_FORKS, allowlist = {}, files = {} } = {}) => {
        const root = mkdtempSync(join(tmpdir(), 'mj-threads-guard-'));
        temps.push(root);
        writeFileSync(join(root, 'vitest.shared.ts'), shared);
        for (const [rel, text] of Object.entries(files)) {
            mkdirSync(dirname(join(root, rel)), { recursive: true });
            writeFileSync(join(root, rel), text);
        }
        const allowlistPath = join(root, 'allowlist.json');
        writeFileSync(allowlistPath, JSON.stringify({ packages: allowlist }));
        return { root, check: () => checkVitestThreadsSafety(root, { allowlistPath }) };
    };

    afterEach(() => {
        while (temps.length > 0) rmSync(temps.pop(), { recursive: true, force: true });
    });

    it('detects explicit pool settings while ignoring comments', () => {
        expect(detectPoolSetting(`// pool: 'threads'\nexport default defineConfig({ test: {} });`)).toBeNull();
        expect(detectPoolSetting(`/* pool: 'threads' */ export default defineConfig({ test: {} });`)).toBeNull();
        expect(detectPoolSetting(`export default defineProject({ test: { pool: 'threads' } });`)).toBe('threads');
        expect(detectPoolSetting(`export default defineProject({ test: { pool: 'forks' } });`)).toBe('forks');
    });

    it('detects TZ writes, vi.stubEnv(TZ), chdir and cpuUsage, and ignores reads and comments', () => {
        const src = [
            `const prev = process.env.TZ;`, // 1 read-only: allowed
            `process.env.TZ = 'America/New_York';`, // 2
            `delete process.env.TZ;`, // 3
            `// process.env.TZ = 'UTC';`, // 4 comment: ignored
            `process.chdir('/tmp');`, // 5
            `vi.stubEnv('TZ', 'Asia/Tokyo');`, // 6
            `vi.stubEnv('NODE_ENV', 'test');`, // 7 other env var: allowed
            `const t0 = process.cpuUsage();`, // 8
            `process.env['TZ'] = 'UTC';`, // 9
            `if (process.env.TZ === 'UTC') {}`, // 10 comparison: allowed
        ].join('\n');
        const findings = findThreadUnsafeCalls(src);
        expect(findings.map((f) => f.line)).toEqual([2, 3, 5, 6, 8, 9]);
        expect(findings.find((f) => f.line === 6).reason).toMatch(/stubEnv/);
        expect(findings.find((f) => f.line === 8).reason).toMatch(/cpuUsage/);
    });

    it('reports the source line, not a drifted one, after a multi-line block comment', () => {
        const src = ['/**', ' * three', ' * line', ' * comment', ' */', `process.chdir('/tmp');`].join('\n');
        expect(findThreadUnsafeCalls(src)).toEqual([expect.objectContaining({ line: 6 })]);
    });

    describe('classifyConfig (pool inheritance)', () => {
        it('a node-preset config with no pool inherits threads from the shared preset', () => {
            expect(classifyConfig(NODE_PRESET_CONFIG, true)).toEqual({ usesThreads: true, explicit: false });
            expect(classifyConfig(NODE_PRESET_CONFIG, false)).toEqual({ usesThreads: false, explicit: false });
        });

        it('a single-preset config that pins its own non-threads pool does not inherit', () => {
            const pinned = NODE_PRESET_CONFIG.replace(`environment: 'node'`, `environment: 'node', pool: 'forks'`);
            expect(classifyConfig(pinned, true).usesThreads).toBe(false);
        });

        it('a dual-preset config inherits threads for its node project even though its dom project pins forks', () => {
            expect(classifyConfig(DUAL_PRESET_CONFIG, true)).toEqual({ usesThreads: true, explicit: false });
            expect(classifyConfig(DUAL_PRESET_CONFIG, false).usesThreads).toBe(false);
        });

        it('a DOM-only config never inherits the node preset pool', () => {
            const domOnly = `import domShared from '../../vitest.dom.shared';\nexport default mergeConfig(domShared, defineProject({ test: {} }));`;
            expect(classifyConfig(domOnly, true).usesThreads).toBe(false);
        });
    });

    it('treats test files, setup files and helpers as test code, but not production source', () => {
        expect(isTestSupportFile('a.test.ts', 'src/a.test.ts')).toBe(true);
        expect(isTestSupportFile('setup.ts', 'src/__tests__/setup.ts')).toBe(true);
        expect(isTestSupportFile('test-setup.ts', 'src/test-setup.ts')).toBe(true);
        expect(isTestSupportFile('db-helpers.ts', 'src/db-helpers.ts')).toBe(true);
        expect(isTestSupportFile('mock-db.ts', 'test/mock-db.ts')).toBe(true);
        expect(isTestSupportFile('engine.ts', 'src/engine.ts')).toBe(false);
        expect(isTestSupportFile('README.md', 'src/__tests__/README.md')).toBe(false);
    });

    it('flags an inherited-threads package when the shared preset selects threads', () => {
        const { check } = makeRepo({
            shared: SHARED_THREADS,
            files: {
                'packages/Inherit/vitest.config.ts': NODE_PRESET_CONFIG,
                'packages/Inherit/src/__tests__/tz.test.ts': `process.env.TZ = 'America/Chicago';\n`,
            },
        });
        const res = check();
        expect(res.threadsPackages).toEqual(['packages/Inherit']);
        expect(res.violations.map((v) => v.filePath)).toEqual(['vitest.shared.ts', 'packages/Inherit/src/__tests__/tz.test.ts']);
    });

    it('flags a dual-preset package (node project inherits threads) — the record-changes case', () => {
        const { check } = makeRepo({
            shared: SHARED_THREADS,
            files: {
                'packages/Dual/vitest.config.ts': DUAL_PRESET_CONFIG,
                'packages/Dual/src/lib/__tests__/format.test.ts': `beforeEach(() => {\n  process.env.TZ = 'America/Chicago';\n});\n`,
            },
        });
        const res = check();
        expect(res.threadsPackages).toEqual(['packages/Dual']);
        expect(res.violations).toContainEqual(
            expect.objectContaining({ filePath: 'packages/Dual/src/lib/__tests__/format.test.ts', line: 2 }),
        );
    });

    it('scans setup files referenced by the config and helper files, not just *.test.* files', () => {
        const { check } = makeRepo({
            allowlist: { 'packages/Setup': { linuxRun: PROOF } },
            files: {
                'packages/Setup/vitest.config.ts': `export default defineProject({ test: { pool: 'threads', setupFiles: ['./config/boot.ts'] } });`,
                'packages/Setup/config/boot.ts': `process.env.TZ = 'UTC';\n`,
                'packages/Setup/src/__tests__/helpers/env.ts': `export const go = () => process.chdir('/tmp');\n`,
                'packages/Setup/src/timing-helper.ts': `export const cpu = () => process.cpuUsage();\n`,
                'packages/Setup/src/engine.ts': `export const cpu = () => process.cpuUsage();\n`,
            },
        });
        const files = check().violations.map((v) => v.filePath).sort();
        expect(files).toEqual([
            'packages/Setup/config/boot.ts',
            'packages/Setup/src/__tests__/helpers/env.ts',
            'packages/Setup/src/timing-helper.ts',
        ]);
    });

    it('rejects an explicit threads opt-in that has no proof of a green Linux run', () => {
        const files = {
            'packages/OptIn/vitest.config.ts': EXPLICIT_THREADS_CONFIG,
            'packages/OptIn/src/__tests__/ok.test.ts': `expect(1).toBe(1);\n`,
        };
        const missing = makeRepo({ files }).check();
        expect(missing.violations).toEqual([
            expect.objectContaining({ filePath: 'packages/OptIn/vitest.config.ts', line: 2, reason: expect.stringMatching(/without proof/) }),
        ]);

        const notAUrl = makeRepo({ files, allowlist: { 'packages/OptIn': { linuxRun: 'passed locally' } } }).check();
        expect(notAUrl.violations).toHaveLength(1);

        const proven = makeRepo({ files, allowlist: { 'packages/OptIn': { linuxRun: PROOF } } }).check();
        expect(proven.threadsPackageCount).toBe(1);
        expect(proven.violations).toEqual([]);
    });

    it('rejects a stale allowlist entry for a package that no longer opts in', () => {
        const { check } = makeRepo({
            allowlist: { 'packages/Gone': { linuxRun: PROOF } },
            files: { 'packages/Gone/vitest.config.ts': NODE_PRESET_CONFIG },
        });
        expect(check().violations).toEqual([expect.objectContaining({ reason: expect.stringMatching(/stale allowlist entry "packages\/Gone"/) })]);
    });

    it('allows process.env.TZ in packages that stay on forks', () => {
        const { check } = makeRepo({
            files: {
                'packages/ForksPkg/vitest.config.ts': NODE_PRESET_CONFIG,
                'packages/ForksPkg/src/__tests__/tz.test.ts': `process.env.TZ = 'America/Chicago';\n`,
            },
        });
        const res = check();
        expect(res.threadsPackageCount).toBe(0);
        expect(res.violations).toEqual([]);
    });

    it('on the real repository: every package is on forks, the allowlist is empty, and the guard passes', () => {
        const res = checkVitestThreadsSafety(REPO_ROOT);
        expect(res.threadsPackages).toEqual([]);
        expect(JSON.parse(readFileSync(DEFAULT_ALLOWLIST_PATH, 'utf8')).packages).toEqual({});
        expect(res.violations).toEqual([]);
    });

    it('on the real repository: setting threads in vitest.shared.ts would flag record-changes, MJCore, MetadataSync and generic-database-provider', () => {
        // Rebuild a copy of the real configs + tests with the real shared preset switched to threads.
        const sharedText = readFileSync(join(REPO_ROOT, 'vitest.shared.ts'), 'utf8').replace(
            /globals:\s*true,/,
            `globals: true,\n    pool: 'threads',`,
        );
        const copy = (rel) => [rel, readFileSync(join(REPO_ROOT, rel), 'utf8')];
        const { check } = makeRepo({
            shared: sharedText,
            files: Object.fromEntries([
                copy('packages/Angular/Generic/record-changes/vitest.config.ts'),
                copy('packages/Angular/Generic/record-changes/src/lib/__tests__/format-change-value.test.ts'),
                copy('packages/MJCore/vitest.config.ts'),
                copy('packages/MJCore/src/__tests__/util.test.ts'),
                copy('packages/MetadataSync/vitest.config.ts'),
                copy('packages/MetadataSync/src/__tests__/pull-env-references.test.ts'),
                copy('packages/GenericDatabaseProvider/vitest.config.ts'),
                copy('packages/GenericDatabaseProvider/src/__tests__/clientClauseScreen.linearTime.test.ts'),
            ]),
        });
        const flagged = new Set(check().violations.map((v) => v.filePath));
        expect(flagged).toEqual(
            new Set([
                'vitest.shared.ts',
                'packages/Angular/Generic/record-changes/src/lib/__tests__/format-change-value.test.ts',
                'packages/MJCore/src/__tests__/util.test.ts',
                'packages/MetadataSync/src/__tests__/pull-env-references.test.ts',
                'packages/GenericDatabaseProvider/src/__tests__/clientClauseScreen.linearTime.test.ts',
            ]),
        );
    });
});
