import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const JIT_REPORTER_MOUNT = '/jit-reporter';
export const JIT_REPORTER_ARG = `--reporter=${JIT_REPORTER_MOUNT}/jit-reporter.mjs`;

/** vitest reporter source. It runs inside the sandbox, in vitest's process, and prints one JIT_REPORT line at the end. */
const SOURCE = `const strip = (s) => (typeof s === 'string' ? s.replace(/\\u001b\\[[0-9;]*m/g, '') : null);
const frame = (e) => (e.stacks && e.stacks[0] ? e.stacks[0].file + ':' + e.stacks[0].line + ':' + e.stacks[0].column : null);
const err = (e) => ({ Name: e.name ?? null, Message: String(e.message ?? ''), Expected: typeof e.expected === 'string' ? e.expected : null,
  Actual: typeof e.actual === 'string' ? e.actual : null, Diff: strip(e.diff), Frame: frame(e), Timeout: /^Test timed out in \\d+ms/.test(String(e.message ?? '')) });
export default class JitReporter {
  constructor() { this.tests = []; this.moduleErrors = []; }
  onTestCaseResult(tc) { const r = tc.result(); this.tests.push({ File: tc.module.moduleId, Name: tc.fullName, State: r.state, DurationMs: tc.diagnostic()?.duration ?? 0, Errors: (r.errors ?? []).map(err) }); }
  onTestModuleEnd(m) { const e = m.errors(); if (e.length) this.moduleErrors.push({ File: m.moduleId, Errors: e.map(err) }); }
  onTestRunEnd() { process.stdout.write('\\nJIT_REPORT ' + JSON.stringify({ Tests: this.tests, ModuleErrors: this.moduleErrors }) + '\\n'); }
}
`;

/** Writes the reporter into `dir` on the host, for a read-only mount at JIT_REPORTER_MOUNT. */
export function WriteJitReporter(dir: string): string {
    mkdirSync(dir, { recursive: true }); writeFileSync(join(dir, 'jit-reporter.mjs'), SOURCE); return dir;
}
