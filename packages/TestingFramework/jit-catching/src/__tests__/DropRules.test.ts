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
const asts = new Map<string, TestAst>();
function ctx(source: string, failure: Partial<FailureDetail> = {}): CatchContext {
  const ast = asts.get(source) ?? TestAst.Load(source, '/repo', 'packages/X', FILE, { '/repo/packages/X/src/svc.ts': lib });
  asts.set(source, ast);
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

describe('drop rules never drop a regression reached through calls', () => {
  const typeErr = (line: number, col: number): Partial<FailureDetail> => ({ ErrorName: 'TypeError', Message: 'TypeError: x', Assertion: null, StackExcerpt: `❯ src/__tests__/jit/t.jit.test.ts:${line}:${col}` });
  it('TestOwnError does not fire when the first frame is outside the test file', () => {
    const src = `${imp}\nit('t', () => {\n  const v = undefinedThing;\n  expect(v).toBe(1);\n});`;
    expect(new TestOwnError().Evaluate(ctx(src, { ErrorName: 'ReferenceError', Message: 'ReferenceError: x', Assertion: null, StackExcerpt: '❯ src/svc.ts:1:20\n❯ src/__tests__/jit/t.jit.test.ts:3:13' })).Fired).toBe(false);
  });
  it('TestOwnError counts a call on every line it spans', () => {
    const src = `${imp}\nit('t', () => {\n  const v = new Svc()\n    .Open();\n  expect(v).toBe(3);\n});`;
    expect(new TestOwnError().Evaluate(ctx(src, typeErr(4, 6))).Fired).toBe(false);
  });
  it('TestOwnError does not fire on a TypeError over a value the test got from a call', () => {
    const src = `${imp}\nit('t', () => {\n  const r = new Svc().Items();\n  expect(r.length).toBe(1);\n});`;
    expect(new TestOwnError().Evaluate(ctx(src, typeErr(4, 12))).Fired).toBe(false);
  });
  it('OrderSensitive does not fire when the order helper is nested inside another expression', () => {
    const r = new OrderSensitive();
    expect(r.Evaluate(ctx(`${imp} const o = { a: 1 }; expect(Object.keys(o).sort()).toEqual(['a']);`)).Fired).toBe(false);
    expect(r.Evaluate(ctx(`${imp} const o = { a: 1 }; expect(Object.keys(o).length).toBe(1);`)).Fired).toBe(false);
    expect(r.Evaluate(ctx(`${imp} const o = { a: 1 }; expect(JSON.parse(JSON.stringify(o))).toEqual(o);`)).Fired).toBe(false);
  });
  it('InternalCallCounting tells same-named spies apart', () => {
    const src = `${imp}\nit('a', () => { const s = new Svc(); const spy = vi.spyOn(s, 'Open'); expect(spy).toBeDefined(); });\nit('b', () => { const spy = vi.spyOn(mod, 'free'); expect(spy).toHaveBeenCalledTimes(1); });`;
    expect(new InternalCallCounting().Evaluate(ctx(src)).Fired).toBe(false);
  });
  it('InternalCallCounting follows a mock chain and a .not matcher', () => {
    expect(new InternalCallCounting().Evaluate(ctx(`${imp} const s = new Svc(); const spy = vi.spyOn(s, 'Open').mockReturnValue(5); expect(spy).not.toHaveBeenCalledWith();`)).Fired).toBe(true);
  });
  it('NotImplemented does not fire on an assertion message', () => {
    expect(new NotImplemented().Evaluate(ctx(`${imp} expect(1).toBe(1);`, { Message: "AssertionError: expected 'not implemented' to be 'ok'", Assertion: "expected 'not implemented' to be 'ok'" })).Fired).toBe(false);
  });
  it('FailingTestLine does not match a file whose name ends with the test file name', () => {
    const src = `${imp}\nvi.mock('x', () => {\n  throw new Error('boom');\n});\nit('t', () => { expect(1).toBe(1); });`;
    expect(new BrokenMock().Evaluate(ctx(src, { StackExcerpt: '❯ src/__tests__/jit/at.jit.test.ts:3:9', ErrorName: 'Error' })).Fired).toBe(false);
  });
});
describe("drop rules read the reporter's single-frame format", () => {
  it('TestOwnError fires on an `at <path>` frame in the test file', () => {
    expect(new TestOwnError().Evaluate(ctx(`${imp}\nit('t', () => {\n  const v = undefinedThing;\n  expect(v).toBe(1);\n});`, { ErrorName: 'ReferenceError', Message: 'ReferenceError: undefinedThing is not defined', Assertion: null, StackExcerpt: 'at /work/packages/X/src/__tests__/jit/t.jit.test.ts:3:13' })).Fired).toBe(true);
  });
});
