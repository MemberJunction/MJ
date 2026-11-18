import { describe, it, expect, afterEach } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CheckedBaseSourceDir, SnapshotBaseSources } from '../pipeline/BaseSnapshot';
import { RunDir } from '../pipeline/RunDir';
import { RedactionCheck } from '../sandbox/Redaction';
import { RUN_ID } from './helpers/pipelineFixtures';

const temps: string[] = [];
function temp(prefix: string): string { const d = mkdtempSync(join(tmpdir(), prefix)); temps.push(d); return d; }
afterEach(() => { for (const d of temps.splice(0)) rmSync(d, { recursive: true, force: true }); });

describe('SnapshotBaseSources', () => {
  it('copies regular source files and tsconfig.json, but not the jit tests or a symlink', () => {
    const root = temp('jit-snap-base-'); const pkg = join(root, 'packages/X');
    mkdirSync(join(pkg, 'src/__tests__/jit'), { recursive: true });
    writeFileSync(join(pkg, 'src/a.ts'), 'export const a = 1;\n');
    writeFileSync(join(pkg, 'src/__tests__/jit/t.jit.test.ts'), 'it("t", () => {});\n');
    symlinkSync('/etc/hosts', join(pkg, 'src/link.ts'));
    writeFileSync(join(pkg, 'tsconfig.json'), '{}');
    const dest = join(temp('jit-snap-dest-'), 'base-src');

    const count = SnapshotBaseSources(root, ['packages/X'], dest);

    expect(count).toBe(2);
    expect(existsSync(join(dest, 'packages/X/src/a.ts'))).toBe(true);
    expect(existsSync(join(dest, 'packages/X/tsconfig.json'))).toBe(true);
    expect(existsSync(join(dest, 'packages/X/src/__tests__/jit/t.jit.test.ts'))).toBe(false);
    expect(existsSync(join(dest, 'packages/X/src/link.ts'))).toBe(false);
  });
});

describe('SnapshotBaseSources tsconfig chain', () => {
  it('copies the parent tsconfig a package tsconfig extends, at the same relative path', () => {
    const root = temp('jit-snap-base-'); const pkg = join(root, 'packages/X');
    mkdirSync(join(pkg, 'src'), { recursive: true }); writeFileSync(join(pkg, 'src/a.ts'), 'export const a = 1;\n');
    const parent = JSON.stringify({ compilerOptions: { target: 'ES2022', lib: ['ES2022'] } });
    writeFileSync(join(root, 'tsconfig.server.json'), parent);
    writeFileSync(join(pkg, 'tsconfig.json'), JSON.stringify({ extends: '../../tsconfig.server.json' }));
    const dest = join(temp('jit-snap-dest-'), 'base-src');

    SnapshotBaseSources(root, ['packages/X'], dest);

    expect(readFileSync(join(dest, 'tsconfig.server.json'), 'utf8')).toBe(parent);
  });
});

describe('CheckedBaseSourceDir', () => {
  it('rejects a folder outside the run', () => {
    const root = temp('jit-snap-run-'); const dir = new RunDir(root, RUN_ID, new RedactionCheck([]));
    mkdirSync(join(dir.Path, 'base-src'), { recursive: true });
    const outside = temp('jit-snap-outside-');
    expect(() => CheckedBaseSourceDir(dir, outside)).toThrow(/base source/);
    expect(CheckedBaseSourceDir(dir, join(dir.Path, 'base-src'))).toBe(join(dir.Path, 'base-src'));
  });
});
