import { describe, it, expect } from 'vitest';
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
  it('follows a variable to its cast initializer (two-step form) and treats a write like a read', () => {
    const ast = load(`import { Svc } from '../../svc'; const svc = new Svc(); const s = svc as unknown as { secret: number }; s.secret = 2; const t = s.secret;`);
    const [w, r] = ast.MemberAccesses();
    expect(ast.DeclarationVisibility(w.Receiver, w.Name)).toBe('private');
    expect(ast.DeclarationVisibility(r.Receiver, r.Name)).toBe('private');
  });
});

describe('TestAst helpers', () => {
  it('finds expect() arguments and hook ranges', () => {
    const ast = load(`import { describe, it, expect, beforeEach, vi } from 'vitest'; vi.mock('x', () => ({ a: 1 })); beforeEach(() => { const y = 1; }); it('t', () => { expect(JSON.stringify({a:1})).toBe('x'); });`);
    expect(ast.ExpectArguments()).toHaveLength(1);
    expect(ast.RangesOf('vi.mock')).toHaveLength(1); expect(ast.RangesOf('beforeEach')).toHaveLength(1);
  });
});
