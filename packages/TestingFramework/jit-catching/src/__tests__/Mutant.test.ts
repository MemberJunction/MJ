import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, symlinkSync, lstatSync, readlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ApplyMutantEdits, ValidateMutantEdits, CopyPackageForMutant } from '../generator/Mutant';

function pkg(): string { const d = mkdtempSync(join(tmpdir(), 'jit-mut-')); mkdirSync(join(d, 'src/__tests__'), { recursive: true }); writeFileSync(join(d, 'src/a.ts'), 'export function f(u: string) {\n  return u === "admin";\n}\n'); writeFileSync(join(d, 'package.json'), '{}'); return d; }

describe('ValidateMutantEdits', () => {
  it('refuses a file the stored record cannot hold, such as a template or a name with a space', () => {
    expect(ValidateMutantEdits('packages/Angular/Generic/whiteboard', [{ File: 'packages/Angular/Generic/whiteboard/src/lib/board.component.html', Find: 'x', Replace: 'y' }])).toMatch(/\.ts/);
    expect(ValidateMutantEdits('packages/MJCore', [{ File: 'packages/MJCore/src/my file.ts', Find: 'x', Replace: 'y' }])).toMatch(/\.ts/);
  });
  it('accepts edits to src files of the package and rejects tests, other packages and traversal', () => {
    expect(ValidateMutantEdits('packages/MJCore', [{ File: 'packages/MJCore/src/a.ts', Find: 'x', Replace: 'y' }])).toBeNull();
    expect(ValidateMutantEdits('packages/MJCore', [{ File: 'packages/MJCore/src/__tests__/a.test.ts', Find: 'x', Replace: 'y' }])).toMatch(/test/);
    expect(ValidateMutantEdits('packages/MJCore', [{ File: 'packages/MJCore/src/__mocks__/m.ts', Find: 'x', Replace: 'y' }])).toMatch(/test/);
    expect(ValidateMutantEdits('packages/MJCore', [{ File: 'packages/MJCore/src/test/setup.ts', Find: 'x', Replace: 'y' }])).toMatch(/test/);
    expect(ValidateMutantEdits('packages/MJCore', [{ File: 'packages/MJCore/src/a.spec.tsx', Find: 'x', Replace: 'y' }])).toMatch(/test/);
    expect(ValidateMutantEdits('packages/MJCore', [{ File: 'packages/Other/src/a.ts', Find: 'x', Replace: 'y' }])).toMatch(/package/);
    expect(ValidateMutantEdits('packages/MJCore', [{ File: 'packages/MJCore/src/../../x.ts', Find: 'x', Replace: 'y' }])).toMatch(/path/);
  });
});

describe('ApplyMutantEdits', () => {
  it('applies an exact single-occurrence edit and returns a unified diff', () => {
    const d = pkg();
    const r = ApplyMutantEdits(d, [{ File: 'packages/MJCore/src/a.ts', Find: 'u === "admin"', Replace: 'true' }], 'packages/MJCore');
    expect(readFileSync(join(d, 'src/a.ts'), 'utf8')).toContain('return true;');
    expect(r.Patch).toContain('-  return u === "admin";'); expect(r.Patch).toContain('+  return true;'); expect(r.Changed).toEqual(['src/a.ts']);
  });
  it('keeps both changes when two edits target the same file', () => {
    const d = pkg();
    const r = ApplyMutantEdits(d, [
      { File: 'packages/MJCore/src/a.ts', Find: 'u === "admin"', Replace: 'true' },
      { File: 'packages/MJCore/src/a.ts', Find: 'export function f', Replace: 'export function g' },
    ], 'packages/MJCore');
    const text = readFileSync(join(d, 'src/a.ts'), 'utf8');
    expect(text).toContain('return true;'); expect(text).toContain('function g');
    expect(r.Changed).toEqual(['src/a.ts']);
    expect(r.Patch).toContain('+  return true;'); expect(r.Patch).toContain('+export function g');
  });
  it('rejects a Find that is missing or not unique', () => {
    expect(() => ApplyMutantEdits(pkg(), [{ File: 'packages/MJCore/src/a.ts', Find: 'nope', Replace: 'x' }], 'packages/MJCore')).toThrow(/not found/);
    expect(() => ApplyMutantEdits(pkg(), [{ File: 'packages/MJCore/src/a.ts', Find: 'u', Replace: 'x' }], 'packages/MJCore')).toThrow(/once/);
  });
});

describe('CopyPackageForMutant', () => {
  it('copies the package keeping node_modules symlinks as links', () => {
    const d = pkg(); mkdirSync(join(d, 'node_modules')); symlinkSync('../../AI/Core', join(d, 'node_modules/dep'));
    const copy = CopyPackageForMutant(d, mkdtempSync(join(tmpdir(), 'jit-scratch-')));
    expect(readFileSync(join(copy, 'src/a.ts'), 'utf8')).toContain('admin');
    expect(lstatSync(join(copy, 'node_modules/dep')).isSymbolicLink()).toBe(true);
    expect(readlinkSync(join(copy, 'node_modules/dep'))).toBe('../../AI/Core');
  });
});
