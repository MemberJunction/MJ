import { describe, it, expect } from 'vitest';
import { ParseJitReport, ParseVitestJson, ParseVitestOutput } from '../target/VitestReport';

const A = 'packages/MJCore/src/__tests__/jit/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.jit.test.ts';
const B = 'packages/MJCore/src/__tests__/jit/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb.jit.test.ts';
const C = 'packages/MJCore/src/__tests__/jit/cccccccc-cccc-cccc-cccc-cccccccccccc.jit.test.ts';
const D = 'packages/MJCore/src/__tests__/jit/dddddddd-dddd-dddd-dddd-dddddddddddd.jit.test.ts';
const mapping = { FilePathToTestID: { [A]: 'tA', [B]: 'tB', [C]: 'tC', [D]: 'tD' }, Revision: 'Head' as const, RunIndex: 1 };
const noErr = { Expected: null, Actual: null, Diff: null };
const report = { Tests: [
  { File: `/work/${A}`, Name: 'A ok', State: 'passed', DurationMs: 4, Errors: [] },
  { File: `/work/${B}`, Name: 'B first', State: 'passed', DurationMs: 1, Errors: [] },
  { File: `/work/${B}`, Name: 'B canRead gives per-user answers', State: 'failed', DurationMs: 2, Errors: [{ Name: 'AssertionError', Message: 'expected true to be false // Object.is equality', Expected: 'false', Actual: 'true', Diff: '- Expected\n+ Received\n\n- false\n+ true', Frame: `/work/${B}:12:31`, Timeout: false }] },
  { File: `/work/${C}`, Name: 'C slow', State: 'failed', DurationMs: 50, Errors: [{ Name: 'Error', Message: 'Test timed out in 50ms.', ...noErr, Frame: `/work/${C}:3:3`, Timeout: true }] },
], ModuleErrors: [{ File: `/work/${D}`, Errors: [{ Name: 'SyntaxError', Message: "Unexpected token '}'", ...noErr, Frame: null, Timeout: false }] }] };
const out = (o: object) => `RUN v4.0.18 /work/packages/MJCore\nJIT_REPORT ${JSON.stringify(o)}\n`;

describe('ParseJitReport', () => {
  const results = ParseJitReport(out(report), mapping) ?? [];
  it('gives one result per file keyed by candidate test ID', () => {
    expect(results.map((r) => [r.CandidateTestID, r.Status])).toEqual([['tA', 'Pass'], ['tB', 'Fail'], ['tC', 'Timeout'], ['tD', 'RunnerError']]);
    expect(results[1]).toMatchObject({ Revision: 'Head', RunIndex: 1, TestName: 'B canRead gives per-user answers' });
  });
  it('takes assertion, expected, actual and the first frame from the reporter fields', () => {
    expect(results[1].Failure).toMatchObject({ ErrorName: 'AssertionError', Assertion: 'expected true to be false // Object.is equality', Expected: 'false', Actual: 'true', StackExcerpt: `/work/${B}:12:31` });
  });
  it('reports a module error as RunnerError with the error text', () => {
    expect(results[3].Failure?.Message).toContain("SyntaxError: Unexpected token '}'");
  });
  it('marks a file missing from the report as RunnerError, and returns null when stdout has no JIT_REPORT line', () => {
    expect((ParseJitReport(out({ Tests: [], ModuleErrors: [] }), mapping) ?? []).every((x) => x.Status === 'RunnerError')).toBe(true);
    expect(ParseJitReport('{"testResults":[]}', mapping)).toBeNull();
  });
});

describe('ParseVitestJson (fallback)', () => {
  const runner = 'file:///work/node_modules/.pnpm/@vitest+runner@4.0.18/node_modules/@vitest/runner/dist/index.js';
  const json = JSON.stringify({ testResults: [
    { name: `/work/${B}`, status: 'failed', assertionResults: [{ fullName: 'B mismatch', status: 'failed', duration: 2, failureMessages: [`AssertionError: expected { a: 1 } to deeply equal { a: 2 }\n    at /work/${B}:5:33\n    at ${runner}:145:11`] }] },
    { name: `/work/${C}`, status: 'failed', assertionResults: [{ fullName: 'C slow', status: 'failed', duration: 51, failureMessages: [`Error: STACK_TRACE_ERROR\n    at task (${runner}:796:27)\n    at /work/${C}:11:3`] }] },
  ] });
  const r = ParseVitestJson(json, { ...mapping, FilePathToTestID: { [B]: 'tB', [C]: 'tC' } });
  it('reads the assertion from the first line and the first frame outside node_modules; expected and actual stay null', () => {
    expect(r[0].Status).toBe('Fail');
    expect(r[0].Failure).toMatchObject({ ErrorName: 'AssertionError', Assertion: 'expected { a: 1 } to deeply equal { a: 2 }', Expected: null, Actual: null, StackExcerpt: `at /work/${B}:5:33` });
  });
  it('treats a first line of Error: STACK_TRACE_ERROR as a timeout', () => {
    expect(r[1].Status).toBe('Timeout'); expect(r[1].Failure?.StackExcerpt).toBe(`at /work/${C}:11:3`);
  });
  it('is what ParseVitestOutput uses when there is no JIT_REPORT line', () => {
    expect(ParseVitestOutput(`chatter\n${json}`, { ...mapping, FilePathToTestID: { [B]: 'tB' } })[0].Status).toBe('Fail');
  });
});
