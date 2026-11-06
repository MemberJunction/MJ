import { z } from 'zod';
import type { ExecutionResult, ExecutionStatus, FailureDetail, RevisionKind } from '../types';

export interface ReportMapping { FilePathToTestID: Record<string, string>; Revision: RevisionKind; RunIndex: number; }
const ErrSchema = z.object({ Name: z.string().nullable(), Message: z.string(), Expected: z.string().nullable(), Actual: z.string().nullable(), Diff: z.string().nullable(), Frame: z.string().nullable(), Timeout: z.boolean() });
const JitReportSchema = z.object({
    Tests: z.array(z.object({ File: z.string(), Name: z.string(), State: z.string(), DurationMs: z.number(), Errors: z.array(ErrSchema) })),
    ModuleErrors: z.array(z.object({ File: z.string(), Errors: z.array(ErrSchema) })),
});
type JitError = z.infer<typeof ErrSchema>;
const JsonReportSchema = z.object({ testResults: z.array(z.object({ name: z.string(), status: z.string(), assertionResults: z.array(z.object({ fullName: z.string(), status: z.string(), duration: z.number().nullable().optional(), failureMessages: z.array(z.string()).optional() })) })) });

/** Results from the custom reporter's JIT_REPORT line; null when stdout has none. */
export function ParseJitReport(stdout: string, mapping: ReportMapping): ExecutionResult[] | null {
    const line = stdout.split('\n').reverse().find((l) => l.startsWith('JIT_REPORT '));
    if (!line) return null;
    const parsed = JitReportSchema.safeParse(safeJson(line.slice('JIT_REPORT '.length)));
    if (!parsed.success) return allRunnerErrors(mapping, 'unreadable JIT_REPORT line');
    return Object.entries(mapping.FilePathToTestID).map(([path, id]) => {
        const moduleError = parsed.data.ModuleErrors.find((m) => m.File.endsWith(path))?.Errors[0];
        if (moduleError) return { ...RunnerErrorResult([id], mapping.Revision, mapping.RunIndex, '')[0], Failure: fromJitError(moduleError) };
        const tests = parsed.data.Tests.filter((t) => t.File.endsWith(path));
        if (tests.length === 0) return RunnerErrorResult([id], mapping.Revision, mapping.RunIndex, 'file missing from the vitest report')[0];
        const duration = tests.reduce((s, t) => s + t.DurationMs, 0);
        const failing = tests.find((t) => t.State === 'failed');
        if (!failing) return { CandidateTestID: id, Revision: mapping.Revision, RunIndex: mapping.RunIndex, Status: 'Pass', TestName: tests[0].Name, Failure: null, DurationMs: duration };
        const e = failing.Errors[0];
        const status: ExecutionStatus = e?.Timeout ? 'Timeout' : 'Fail';
        return { CandidateTestID: id, Revision: mapping.Revision, RunIndex: mapping.RunIndex, Status: status, TestName: failing.Name, Failure: e ? fromJitError(e) : ParseFailureMessage('failed with no error'), DurationMs: duration };
    });
}

function fromJitError(e: JitError): FailureDetail {
    const text = `${e.Name ?? 'Error'}: ${e.Message}`;
    return { Assertion: e.Name === 'AssertionError' ? e.Message.split('\n')[0] : null, Expected: e.Expected, Actual: e.Actual, Message: text.split('\n').slice(0, 3).join('\n').slice(0, 2000), StackExcerpt: e.Frame, ErrorName: e.Name };
}

/** Fallback for `--reporter=json` output. Limits: no expected/actual; a test timeout and a hook timeout look the same. */
export function ParseVitestJson(json: string, mapping: ReportMapping): ExecutionResult[] {
    const parsed = JsonReportSchema.safeParse(safeJson(json));
    if (!parsed.success) return allRunnerErrors(mapping, 'vitest produced no JSON report');
    return Object.entries(mapping.FilePathToTestID).map(([path, id]) => {
        const file = parsed.data.testResults.find((f) => f.name.endsWith(path));
        if (!file) return RunnerErrorResult([id], mapping.Revision, mapping.RunIndex, 'file missing from the vitest report')[0];
        const duration = file.assertionResults.reduce((s, a) => s + (a.duration ?? 0), 0);
        const failing = file.assertionResults.find((a) => a.status === 'failed');
        if (!failing) return { CandidateTestID: id, Revision: mapping.Revision, RunIndex: mapping.RunIndex, Status: 'Pass', TestName: file.assertionResults[0]?.fullName ?? null, Failure: null, DurationMs: duration };
        const message = failing.failureMessages?.[0] ?? 'failed with no message';
        const status: ExecutionStatus = message.split('\n')[0] === 'Error: STACK_TRACE_ERROR' ? 'Timeout' : 'Fail';
        return { CandidateTestID: id, Revision: mapping.Revision, RunIndex: mapping.RunIndex, Status: status, TestName: failing.fullName, Failure: ParseFailureMessage(message), DurationMs: duration };
    });
}

export function ParseVitestOutput(stdout: string, mapping: ReportMapping): ExecutionResult[] {
    return ParseJitReport(stdout, mapping) ?? ParseVitestJson(extractJson(stdout), mapping);
}

/** Splits one `failureMessages` string (an `error.stack`) into error name, assertion and the first frame outside node_modules. */
export function ParseFailureMessage(message: string): FailureDetail {
    const lines = message.split('\n');
    const head = /^([A-Za-z]*Error[A-Za-z]*): (.*)$/.exec(lines[0] ?? '');
    const errorName = head?.[1] ?? null;
    const frame = lines.find((l) => /^\s+at\s/.test(l) && !l.includes('node_modules')) ?? null;
    return { Assertion: errorName === 'AssertionError' ? (head?.[2] ?? null) : null, Expected: null, Actual: null, Message: lines.slice(0, 3).join('\n').slice(0, 2000), StackExcerpt: frame?.trim() ?? null, ErrorName: errorName };
}

export function RunnerErrorResult(testIds: string[], revision: RevisionKind, runIndex: number, message: string): ExecutionResult[] {
    return testIds.map((id) => ({ CandidateTestID: id, Revision: revision, RunIndex: runIndex, Status: 'RunnerError', TestName: null, Failure: { Assertion: null, Expected: null, Actual: null, Message: message, StackExcerpt: null, ErrorName: null }, DurationMs: 0 }));
}
function allRunnerErrors(mapping: ReportMapping, message: string): ExecutionResult[] { return RunnerErrorResult(Object.values(mapping.FilePathToTestID), mapping.Revision, mapping.RunIndex, message); }
/** vitest prints its JSON report last; anything before it (turbo or pnpm chatter) is skipped. */
function extractJson(stdout: string): string { const i = stdout.indexOf('{"'); return i >= 0 ? stdout.slice(i) : stdout; }
function safeJson(text: string): unknown { try { return JSON.parse(text); } catch { return null; } }
