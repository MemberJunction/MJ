import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { rm, mkdir, readdir } from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { ComputerUseTrace, TraceStep } from '@memberjunction/computer-use';
import {
    traceFileName,
    deserializeTrace,
    loadTrace,
    persistCandidateTrace,
    resolveTraceDir,
    resolveTraceOutDir,
} from '../test-driver/trace-store.js';

function sampleTrace(testId = 'ABC-123'): ComputerUseTrace {
    const t = new ComputerUseTrace();
    t.TestId = testId;
    t.GoalHash = 'deadbeef';
    t.AppBuildHash = 'sha:gen:snap';
    const step = new TraceStep();
    step.Instruction = 'click Save';
    t.Steps = [step];
    return t;
}

describe('traceFileName (RI-B2)', () => {
    it('uses the human-readable T### name prefix when present', () => {
        expect(traceFileName({ ID: 'uuid-1', Name: 'T053 - Discard Unsaved Edit' })).toBe('T053.trace.json');
        expect(traceFileName({ ID: 'uuid-1', Name: 'T001 - Login Smoke' })).toBe('T001.trace.json');
    });

    it('falls back to the test ID when the name has no T### prefix', () => {
        expect(traceFileName({ ID: 'uuid-9', Name: 'Login Smoke' })).toBe('uuid-9.trace.json');
        expect(traceFileName({ ID: 'uuid-9', Name: '' })).toBe('uuid-9.trace.json');
        expect(traceFileName({ ID: 'uuid-9', Name: null })).toBe('uuid-9.trace.json');
        expect(traceFileName({ ID: 'uuid-9' })).toBe('uuid-9.trace.json');
    });

    it('does not treat a T-prefixed word without digits as a numbered test', () => {
        expect(traceFileName({ ID: 'uuid-2', Name: 'Toolbar renders' })).toBe('uuid-2.trace.json');
    });
});

describe('deserializeTrace (RI-B2)', () => {
    it('round-trips a serialized trace', () => {
        const json = JSON.stringify(sampleTrace('T007'));
        const back = deserializeTrace(json);
        expect(back).not.toBeNull();
        expect(back!.TestId).toBe('T007');
        expect(back!.GoalHash).toBe('deadbeef');
        expect(back!.Steps).toHaveLength(1);
        expect(back!.Steps[0].Instruction).toBe('click Save');
    });

    it('returns null on malformed JSON rather than throwing', () => {
        expect(deserializeTrace('{not json')).toBeNull();
        expect(deserializeTrace('')).toBeNull();
    });

    it('returns null when the shape is not a trace (missing TestId / Steps)', () => {
        expect(deserializeTrace('{"foo":1}')).toBeNull();
        expect(deserializeTrace('{"TestId":"x"}')).toBeNull(); // no Steps array
        expect(deserializeTrace('{"Steps":[]}')).toBeNull(); // no TestId
        expect(deserializeTrace('null')).toBeNull();
        expect(deserializeTrace('42')).toBeNull();
    });
});

describe('resolveTraceDir / resolveTraceOutDir (RI-B2)', () => {
    const saved = { dir: process.env.CU_TRACE_DIR, out: process.env.CU_TRACE_OUT_DIR };
    afterEach(() => {
        process.env.CU_TRACE_DIR = saved.dir;
        process.env.CU_TRACE_OUT_DIR = saved.out;
    });

    it('honors the env override when set', () => {
        process.env.CU_TRACE_DIR = '/mnt/ro/traces';
        process.env.CU_TRACE_OUT_DIR = '/run/out';
        expect(resolveTraceDir()).toBe('/mnt/ro/traces');
        expect(resolveTraceOutDir()).toBe('/run/out');
    });

    it('falls back to a CWD-relative default when unset', () => {
        delete process.env.CU_TRACE_DIR;
        delete process.env.CU_TRACE_OUT_DIR;
        expect(resolveTraceDir()).toBe(path.join(process.cwd(), 'metadata-optional/regression-test/tests/regression/traces'));
        expect(resolveTraceOutDir()).toBe(path.join(process.cwd(), 'test-results/traces-out'));
    });
});

describe('persistCandidateTrace + loadTrace round-trip (RI-B2)', () => {
    let dir: string;
    beforeEach(async () => {
        dir = path.join(os.tmpdir(), `mj-trace-store-test-${process.pid}`);
        await rm(dir, { recursive: true, force: true });
        await mkdir(dir, { recursive: true });
    });
    afterEach(async () => {
        await rm(dir, { recursive: true, force: true });
    });

    it('persists atomically and loads back an equal trace', async () => {
        const trace = sampleTrace('T042');
        const written = await persistCandidateTrace(trace, 'T042.trace.json', dir);
        expect(written).toBe(path.join(dir, 'T042.trace.json'));
        // No leftover .tmp file
        const files = await readdir(dir);
        expect(files).toEqual(['T042.trace.json']);

        const loaded = await loadTrace('T042.trace.json', dir);
        expect(loaded).not.toBeNull();
        expect(loaded!.TestId).toBe('T042');
        expect(loaded!.Steps[0].Instruction).toBe('click Save');
    });

    it('loadTrace returns null for a missing file (→ LLM tier)', async () => {
        expect(await loadTrace('does-not-exist.trace.json', dir)).toBeNull();
    });

    it('creates the out dir if it does not exist', async () => {
        const nested = path.join(dir, 'a', 'b');
        await persistCandidateTrace(sampleTrace(), 'T001.trace.json', nested);
        expect(await loadTrace('T001.trace.json', nested)).not.toBeNull();
    });
});
