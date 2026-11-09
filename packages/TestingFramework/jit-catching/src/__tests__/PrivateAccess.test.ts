import { describe, it, expect } from 'vitest';
import { PrivateAccess } from '../rules/drop/PrivateAccess';
import { TestAst } from '../rules/TestAst';
import type { CatchContext } from '../types';

const lib = `export class Svc { private secret = 1; public Open() { return 3; } protected Hook(): number { return 1; } }`;
function ctx(source: string): CatchContext {
  const ast = TestAst.Load(source, '/repo', 'packages/X', 'packages/X/src/__tests__/jit/t.jit.test.ts', { '/repo/packages/X/src/svc.ts': lib });
  return { Run: {} as never, Analysis: {} as never, Test: { Source: source, Package: 'x', FilePath: 'packages/X/src/__tests__/jit/t.jit.test.ts' } as never, Base: [], Head: [], Verdict: { Label: 'WeakCatch', Timeout: false, Reason: '' }, BaseRootDir: '/repo', Boosts: [], Ast: ast } as CatchContext & { Ast: TestAst };
}
describe('PrivateAccess', () => {
  const rule = new PrivateAccess();
  it('fires on a private member reached through a cast', () => { expect(rule.Evaluate(ctx(`import { Svc } from '../../svc'; expect((new Svc() as unknown as { secret: number }).secret).toBe(1);`))).toMatchObject({ Fired: true }); });
  it('does not fire on a stub cast or on public members', () => {
    expect(rule.Evaluate(ctx(`import { Svc } from '../../svc'; const stub = { Open: () => 3 } as unknown as Svc; expect(stub.Open()).toBe(3); expect(new Svc().Open()).toBe(3);`)).Fired).toBe(false);
  });
  it('does not fire on a private member of a class the test declares itself', () => {
    expect(rule.Evaluate(ctx(`class Fake { private n = 1; get() { return this.n; } } expect(new Fake().get()).toBe(1);`)).Fired).toBe(false);
  });
  it('does not fire when a subclass the test declares calls a protected extension point', () => {
    const src = `import { Svc } from '../../svc'; class Sub extends Svc { public Run(): number { return this.Hook(); } } expect(new Sub().Run()).toBe(1);`;
    expect(rule.Evaluate(ctx(src)).Fired).toBe(false);
  });
  it('fires on a protected member reached by a cast on a test-subclass instance', () => {
    const src = `import { Svc } from '../../svc'; class Sub extends Svc {} expect((new Sub() as unknown as { Hook(): number }).Hook()).toBe(1);`;
    expect(rule.Evaluate(ctx(src))).toMatchObject({ Fired: true, Reason: expect.stringMatching(/protected member Hook/) });
  });
  it('fires on a protected member called on a test-subclass instance from outside the subclass', () => {
    const src = `import { Svc } from '../../svc'; class Sub extends Svc {} expect(new Sub().Hook()).toBe(1);`;
    expect(rule.Evaluate(ctx(src))).toMatchObject({ Fired: true, Reason: expect.stringMatching(/protected member Hook/) });
  });
  it('does not fire when a subclass the test declares calls a protected extension point through super', () => {
    const src = `import { Svc } from '../../svc'; class Sub extends Svc { public Run(): number { return super.Hook(); } } expect(new Sub().Run()).toBe(1);`;
    expect(rule.Evaluate(ctx(src)).Fired).toBe(false);
  });
  it('fires on the two-step cast form and on a write to a private member', () => {
    expect(rule.Evaluate(ctx(`import { Svc } from '../../svc'; const svc = new Svc(); const s = svc as unknown as { secret: number }; expect(s.secret).toBe(1);`)).Fired).toBe(true);
    expect(rule.Evaluate(ctx(`import { Svc } from '../../svc'; const svc = new Svc(); (svc as any).secret = 5; expect(svc.Open()).toBe(3);`)).Fired).toBe(true);
  });
});
