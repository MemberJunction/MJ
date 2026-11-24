import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    detectPoolSetting,
    findThreadUnsafeCalls,
    checkVitestThreadsSafety,
} from '../check-vitest-threads-safety.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

describe('check-vitest-threads-safety', () => {
    const temps = [];
    const makeTempRepo = () => {
        const dir = mkdtempSync(join(tmpdir(), 'mj-threads-guard-'));
        temps.push(dir);
        return dir;
    };

    afterEach(() => {
        while (temps.length > 0) {
            rmSync(temps.pop(), { recursive: true, force: true });
        }
    });

    it('detects explicit pool settings while ignoring comments', () => {
        expect(detectPoolSetting(`// pool: 'threads'\nexport default defineConfig({ test: {} });`)).toBeNull();
        expect(detectPoolSetting(`export default defineProject({ test: { pool: 'threads' } });`)).toBe('threads');
        expect(detectPoolSetting(`export default defineProject({ test: { pool: 'forks' } });`)).toBe('forks');
    });

    it('detects process.env.TZ mutations and process.chdir() calls', () => {
        const src = [
            `const prev = process.env.TZ;`, // read-only: allowed
            `process.env.TZ = 'America/New_York';`,
            `delete process.env.TZ;`,
            `// process.env.TZ = 'UTC';`, // comment: ignored
            `process.chdir('/tmp');`,
        ].join('\n');
        const findings = findThreadUnsafeCalls(src);
        expect(findings).toHaveLength(3);
        expect(findings.map((f) => f.line)).toEqual([2, 3, 5]);
    });

    it('flags a threads-enabled package whose test assigns process.env.TZ or calls process.chdir()', () => {
        const root = makeTempRepo();
        writeFileSync(join(root, 'vitest.shared.ts'), `export default { test: {} };`);
        const pkg = join(root, 'packages', 'BadPkg');
        mkdirSync(join(pkg, 'src', '__tests__'), { recursive: true });
        writeFileSync(
            join(pkg, 'vitest.config.ts'),
            `import shared from '../../vitest.shared';\nexport default mergeConfig(shared, { test: { pool: 'threads' } });`,
        );
        writeFileSync(
            join(pkg, 'src', '__tests__', 'tz.test.ts'),
            `process.env.TZ = 'America/Chicago';\n`,
        );

        const res = checkVitestThreadsSafety(root);
        expect(res.threadsPackageCount).toBe(1);
        expect(res.violations).toHaveLength(1);
        expect(res.violations[0].filePath).toBe('packages/BadPkg/src/__tests__/tz.test.ts');
    });

    it('allows process.env.TZ in packages that stay on forks', () => {
        const root = makeTempRepo();
        writeFileSync(join(root, 'vitest.shared.ts'), `export default { test: {} };`);
        const pkg = join(root, 'packages', 'ForksPkg');
        mkdirSync(join(pkg, 'src', '__tests__'), { recursive: true });
        writeFileSync(
            join(pkg, 'vitest.config.ts'),
            `import shared from '../../vitest.shared';\nexport default mergeConfig(shared, { test: { environment: 'node' } });`,
        );
        writeFileSync(
            join(pkg, 'src', '__tests__', 'tz.test.ts'),
            `process.env.TZ = 'America/Chicago';\n`,
        );

        const res = checkVitestThreadsSafety(root);
        expect(res.threadsPackageCount).toBe(0);
        expect(res.violations).toEqual([]);
    });

    it('passes cleanly on the real repository with our opted-in threads packages', () => {
        const res = checkVitestThreadsSafety(REPO_ROOT);
        expect(res.threadsPackageCount).toBeGreaterThanOrEqual(4);
        expect(res.violations).toEqual([]);
    });
});
