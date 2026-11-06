import { describe, it, expect } from 'vitest';
import { TestAst } from '../rules/TestAst';
import { InternalCallCounting } from '../rules/drop/InternalCallCounting';
import { BrokenMock } from '../rules/drop/BrokenMock';
import { OrderSensitive } from '../rules/drop/OrderSensitive';
import { NotImplemented } from '../rules/drop/NotImplemented';
import { TestOwnError } from '../rules/drop/TestOwnError';
import { RunnerInfrastructure } from '../rules/drop/RunnerInfrastructure';
import type { CatchContext, ExecutionResult, FailureDetail } from '../types';

const lib = `export class Svc { public Open() { return 3; } private helper() { return 1; } } export function free() { return 1; }`;
const FILE = 'packages/X/src/__tests__/jit/t.jit.test.ts';
function ctx(source: string, failure: Partial<FailureDetail> = {}): CatchContext {
  const ast = TestAst.Load(source, '/repo', 'packages/X', FILE, { '/repo/packages/X/src/svc.ts': lib });
  const f: FailureDetail = { Assertion: 'expected 1 to be 2', Expected: '2', Actual: '1', Message: 'AssertionError: expected 1 to be 2', StackExcerpt: `❯ src/__tests__/jit/t.jit.test.ts:1:40`, ErrorName: 'AssertionError', ...failure };
  const head: ExecutionResult = { CandidateTestID: 't', Revision: 'Head', RunIndex: 0, Status: 'Fail', TestName: 'x', Failure: f, DurationMs: 1 };
  return { Run: {} as never, Analysis: { IntentType: 'feature', ChangedFiles: [] } as never, Test: { Source: source, FilePath: FILE, Package: 'x', MutantFailure: null } as never, Base: [], Head: [head], Verdict: { Label: 'WeakCatch', Timeout: false, Reason: '' }, BaseRootDir: '/repo', Boosts: [], Ast: ast };
}
const imp = `import { it, expect, vi, beforeEach } from 'vitest'; import { Svc } from '../../svc'; import * as mod from '../../svc';`;

describe('InternalCallCounting', () => {
  const r = new InternalCallCounting();
  it('fires on call-count assertions against a spy on a class instance or prototype', () => {
    expect(r.Evaluate(ctx(`${imp} const s = new Svc(); const spy = vi.spyOn(s, 'Open'); s.Open(); expect(spy).toHaveBeenCalledTimes(1);`)).Fired).toBe(true);
    expect(r.Evaluate(ctx(`${imp} const spy = vi.spyOn(Svc.prototype, 'Open'); expect(spy).toHaveBeenCalledWith();`)).Fired).toBe(true);
  });
  it('does not fire on a spy of an exported module function or on value assertions', () => {
    expect(r.Evaluate(ctx(`${imp} const spy = vi.spyOn(mod, 'free'); expect(spy).toHaveBeenCalledTimes(1);`)).Fired).toBe(false);
    expect(r.Evaluate(ctx(`${imp} expect(new Svc().Open()).toBe(3);`)).Fired).toBe(false);
  });
});
describe('BrokenMock', () => {
  const r = new BrokenMock();
  it('fires when the failing frame is inside vi.mock or beforeEach', () => {
    const src = `${imp}\nvi.mock('x', () => {\n  throw new Error('boom');\n});\nit('t', () => { expect(1).toBe(1); });`;
    expect(r.Evaluate(ctx(src, { StackExcerpt: '❯ src/__tests__/jit/t.jit.test.ts:3:9', ErrorName: 'Error' })).Fired).toBe(true);
    const src2 = `${imp}\nbeforeEach(() => {\n  throw new Error('setup');\n});\nit('t', () => { expect(1).toBe(1); });`;
    expect(r.Evaluate(ctx(src2, { StackExcerpt: '❯ src/__tests__/jit/t.jit.test.ts:3:9', ErrorName: 'Error' })).Fired).toBe(true);
  });
  it('does not fire for a frame inside the it() body', () => {
    expect(r.Evaluate(ctx(`${imp}\nit('t', () => {\n  expect(new Svc().Open()).toBe(4);\n});`, { StackExcerpt: '❯ src/__tests__/jit/t.jit.test.ts:3:28' })).Fired).toBe(false);
  });
});
describe('OrderSensitive', () => {
  const r = new OrderSensitive();
  it('fires on JSON.stringify / Object.keys inside expect()', () => {
    expect(r.Evaluate(ctx(`${imp} expect(JSON.stringify({ a: 1 })).toBe('{"a":1}');`)).Fired).toBe(true);
    expect(r.Evaluate(ctx(`${imp} expect(Object.keys({ a: 1 })).toEqual(['a']);`)).Fired).toBe(true);
    expect(r.Evaluate(ctx(`${imp} expect(\`\${{ a: 1 }}\`).toBe('x');`)).Fired).toBe(true);
  });
  it('does not fire on toEqual of objects', () => { expect(r.Evaluate(ctx(`${imp} expect({ a: 1 }).toEqual({ a: 1 });`)).Fired).toBe(false); });
});
describe('NotImplemented', () => {
  it('fires when head throws "not implemented"', () => {
    expect(new NotImplemented().Evaluate(ctx(`${imp} expect(1).toBe(1);`, { ErrorName: 'Error', Message: 'Error: Method not implemented.', Assertion: null })).Fired).toBe(true);
    expect(new NotImplemented().Evaluate(ctx(`${imp} expect(1).toBe(1);`)).Fired).toBe(false);
  });
});
describe('TestOwnError', () => {
  const r = new TestOwnError();
  it('fires on a ReferenceError/TypeError on a test-file line with no call expression', () => {
    expect(r.Evaluate(ctx(`${imp}\nit('t', () => {\n  const v = undefinedThing;\n  expect(v).toBe(1);\n});`, { ErrorName: 'ReferenceError', Message: 'ReferenceError: undefinedThing is not defined', Assertion: null, StackExcerpt: '❯ src/__tests__/jit/t.jit.test.ts:3:13' })).Fired).toBe(true);
  });
  it('does not fire when the failing line calls into the code under test', () => {
    expect(r.Evaluate(ctx(`${imp}\nit('t', () => {\n  const v = new Svc().Open().toString();\n  expect(v).toBe('3');\n});`, { ErrorName: 'TypeError', Message: 'TypeError: x', Assertion: null, StackExcerpt: '❯ src/__tests__/jit/t.jit.test.ts:3:30' })).Fired).toBe(false);
  });
});
describe('RunnerInfrastructure', () => {
  it('fires on module-not-found, hook timeouts and ports in use', () => {
    for (const m of ["Error: Cannot find module './x'", 'Error: Hook timed out in 10000ms', 'Error: listen EADDRINUSE: address already in use', "ENOENT: no such file or directory, open 'fixtures/a.json'"]) {
      expect(new RunnerInfrastructure().Evaluate(ctx(`${imp} expect(1).toBe(1);`, { ErrorName: 'Error', Message: m, Assertion: null })).Fired).toBe(true);
    }
    expect(new RunnerInfrastructure().Evaluate(ctx(`${imp} expect(1).toBe(1);`)).Fired).toBe(false);
  });
});
