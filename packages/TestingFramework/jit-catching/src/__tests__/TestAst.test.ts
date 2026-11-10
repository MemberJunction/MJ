import { describe, it, expect, vi } from 'vitest';
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ts from 'typescript';
import { TestAst } from '../rules/TestAst';

const lib = `export class Svc { private secret = 1; protected hook() { return 2; } public Open() { return 3; } }
export interface IMetadataProvider { Foo(): number }`;
function load(test: string) { return TestAst.Load(test, '/repo', 'packages/X', 'packages/X/src/__tests__/jit/t.jit.test.ts', { '/repo/packages/X/src/svc.ts': lib }); }

describe('TestAst.DeclarationVisibility', () => {
  it('sees through casts to the original receiver type', () => {
    const ast = load(`import { Svc } from '../../svc'; const s = new Svc(); const v = (s as unknown as { secret: number }).secret; const h = (s as any).hook();`);
    const [a, b] = ast.MemberAccesses();
    expect(ast.DeclarationVisibility(a.Receiver, a.Name)).toBe('private');
    expect(ast.DeclarationVisibility(b.Receiver, b.Name)).toBe('protected');
  });
  it('index access and plain access resolve the same way', () => {
    const ast = load(`import { Svc } from '../../svc'; const s = new Svc(); const v = s['secret']; const o = s.Open();`);
    const [a, b] = ast.MemberAccesses();
    expect(ast.DeclarationVisibility(a.Receiver, a.Name)).toBe('private'); expect(ast.DeclarationVisibility(b.Receiver, b.Name)).toBe('public');
  });
  it('a stub built by cast has no declaration → none', () => {
    const ast = load(`import type { IMetadataProvider } from '../../svc'; const stub = { Foo: () => 1 } as unknown as IMetadataProvider; stub.Foo();`);
    const [a] = ast.MemberAccesses();
    expect(ast.DeclarationVisibility(a.Receiver, a.Name)).toBe('none');
  });
  it('a member the test file declares itself is not a base member → none', () => {
    const ast = load(`class Fake { private n = 1; get() { return this.n; } } new Fake().get();`);
    const n = ast.MemberAccesses().find((m) => m.Name === 'n');
    expect(n).toBeDefined();
    expect(ast.DeclarationVisibility(n!.Receiver, n!.Name)).toBe('none');
  });
  it('follows a variable to its cast initializer (two-step form) and treats a write like a read', () => {
    const ast = load(`import { Svc } from '../../svc'; const svc = new Svc(); const s = svc as unknown as { secret: number }; s.secret = 2; const t = s.secret;`);
    const [w, r] = ast.MemberAccesses();
    expect(ast.DeclarationVisibility(w.Receiver, w.Name)).toBe('private');
    expect(ast.DeclarationVisibility(r.Receiver, r.Name)).toBe('private');
  });
});

describe('TestAst.ProtectedAccessFromTestSubclass', () => {
  it('does not take a member declared in a class expression for a member of the class around that expression', () => {
    const ast = load(`class Outer { static Make() { return class { protected Secret(): number { return 1; } }; } }
const Made = Outer.Make();
interface Outer extends InstanceType<typeof Made> {}
class Sub extends Outer { public Run(): number { return this.Secret(); } }`);
    const secret = ast.MemberAccesses().find((m) => m.Name === 'Secret');
    expect(secret).toBeDefined();
    expect(ast.ProtectedAccessFromTestSubclass(secret!)).toBe(false);
  });
});

describe('TestAst helpers', () => {
  it('finds expect() arguments and hook ranges', () => {
    const ast = load(`import { describe, it, expect, beforeEach, vi } from 'vitest'; vi.mock('x', () => ({ a: 1 })); beforeEach(() => { const y = 1; }); it('t', () => { expect(JSON.stringify({a:1})).toBe('x'); });`);
    expect(ast.ExpectArguments()).toHaveLength(1);
    expect(ast.RangesOf('vi.mock')).toHaveLength(1); expect(ast.RangesOf('beforeEach')).toHaveLength(1);
  });
});

describe('TestAst.Load on disk', () => {
  it('never reads a symlink planted in the jit folder: the import resolves to nothing', () => {
    const root = mkdtempSync(join(tmpdir(), 'jit-ast-')); const jit = join(root, 'packages/X/src/__tests__/jit'); mkdirSync(jit, { recursive: true });
    const outside = join(mkdtempSync(join(tmpdir(), 'jit-out-')), 'credentials.ts'); writeFileSync(outside, 'export const leaked = 1;\n');
    symlinkSync(outside, join(jit, 'helper.ts'));
    const read = vi.spyOn(ts.sys, 'readFile');
    try {
      const ast = TestAst.Load(`import { leaked } from './helper'; it('x', () => { expect(leaked).toBe(1); });`, root, 'packages/X', 'packages/X/src/__tests__/jit/t.jit.test.ts');
      expect(ast.ExpectArguments()).toHaveLength(1);
      const reads = read.mock.calls.map((c) => c[0]);
      expect(reads.filter((f) => f.includes('helper') || f.includes('credentials'))).toEqual([]);
    } finally { read.mockRestore(); }
  });
});
