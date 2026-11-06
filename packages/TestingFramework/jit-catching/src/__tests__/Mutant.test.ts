import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, symlinkSync, lstatSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ApplyMutantEdits, ValidateMutantEdits, CopyPackageForMutant } from '../generator/Mutant';

function pkg(): string { const d = mkdtempSync(join(tmpdir(), 'jit-mut-')); mkdirSync(join(d, 'src/__tests__'), { recursive: true }); writeFileSync(join(d, 'src/a.ts'), 'export function f(u: string) {\n  return u === "admin";\n}\n'); writeFileSync(join(d, 'package.json'), '{}'); return d; }

describe('ValidateMutantEdits', () => {
  it('accepts edits to src files of the package and rejects tests, other packages and traversal', () => {
    expect(ValidateMutantEdits('packages/MJCore', [{ File: 'packages/MJCore/src/a.ts', Find: 'x', Replace: 'y' }])).toBeNull();
    expect(ValidateMutantEdits('packages/MJCore', [{ File: 'packages/MJCore/src/__tests__/a.test.ts', Find: 'x', Replace: 'y' }])).toMatch(/test/);
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
  it('rejects a Find that is missing or not unique', () => {
    expect(() => ApplyMutantEdits(pkg(), [{ File: 'packages/MJCore/src/a.ts', Find: 'nope', Replace: 'x' }], 'packages/MJCore')).toThrow(/not found/);
    expect(() => ApplyMutantEdits(pkg(), [{ File: 'packages/MJCore/src/a.ts', Find: 'u', Replace: 'x' }], 'packages/MJCore')).toThrow(/once/);
  });
});

describe('CopyPackageForMutant', () => {
  it('copies the package keeping node_modules symlinks as links', () => {
    const d = pkg(); mkdirSync(join(d, 'node_modules')); symlinkSync('/nonexistent-target', join(d, 'node_modules/dep'));
    const copy = CopyPackageForMutant(d, mkdtempSync(join(tmpdir(), 'jit-scratch-')));
    expect(readFileSync(join(copy, 'src/a.ts'), 'utf8')).toContain('admin');
    expect(lstatSync(join(copy, 'node_modules/dep')).isSymbolicLink()).toBe(true);
  });
});
