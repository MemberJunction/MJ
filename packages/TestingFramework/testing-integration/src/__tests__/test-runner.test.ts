import { describe, it, expect } from 'vitest';
import { readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
    TestRunner, EmitOutcomes, Assert, AssertEqual, AssertRowShape, AssertKeysInclude, AssertKeysExclude, RowKeys
} from '../test-runner';

describe('TestRunner', () => {
    it('runs tests in registration order and returns 0 failures when all pass', async () => {
        const order: string[] = [];
        const runner = new TestRunner('suite');
        runner.Test('a', async () => { order.push('a'); });
        runner.Test('b', async () => { order.push('b'); });
        const failures = await runner.Run();
        expect(failures).toBe(0);
        expect(order).toEqual(['a', 'b']);
    });

    it('a throwing test fails only itself; later tests still run (no fail-fast)', async () => {
        const runner = new TestRunner('suite');
        let laterRan = false;
        runner.Test('boom', async () => { throw new Error('x'); });
        runner.Test('after', async () => { laterRan = true; });
        const failures = await runner.Run();
        expect(failures).toBe(1);
        expect(laterRan).toBe(true);
    });

    it('LastOutcomes is empty before Run and reflects per-test results after', async () => {
        const runner = new TestRunner('suite');
        expect(runner.LastOutcomes).toHaveLength(0);
        runner.Test('ok', async () => { /* pass */ });
        runner.Test('bad', async () => { throw new Error('nope'); });
        await runner.Run();
        expect(runner.LastOutcomes).toHaveLength(2);
        expect(runner.LastOutcomes[0]).toMatchObject({ Name: 'ok', Passed: true });
        expect(runner.LastOutcomes[1]).toMatchObject({ Name: 'bad', Passed: false, Error: 'nope' });
    });

    it('EmitOutcomes writes the {name,passed,durationMs,error?} golden-diff shape', async () => {
        const runner = new TestRunner('suite');
        runner.Test('S1: ok', async () => { /* pass */ });
        runner.Test('S2: bad', async () => { throw new Error('nope'); });
        await runner.Run();

        const path = join(tmpdir(), `mj-outcomes-${process.pid}.json`);
        try {
            await EmitOutcomes(runner, path);
            const parsed = JSON.parse(await readFile(path, 'utf8'));
            expect(parsed).toHaveLength(2);
            expect(parsed[0]).toMatchObject({ name: 'S1: ok', passed: true });
            expect(typeof parsed[0].durationMs).toBe('number');
            expect(parsed[0].error).toBeUndefined();
            expect(parsed[1]).toMatchObject({ name: 'S2: bad', passed: false, error: 'nope' });
        } finally {
            await rm(path, { force: true });
        }
    });
});

describe('assertion helpers', () => {
    it('Assert throws on false, passes on true', () => {
        expect(() => Assert(false, 'must be true')).toThrow('must be true');
        expect(() => Assert(true, 'must be true')).not.toThrow();
    });

    it('AssertEqual includes both values in the message on mismatch', () => {
        expect(() => AssertEqual(1, 2, 'not equal')).toThrow(/not equal.*expected 2.*got 1/);
    });

    it('RowKeys lowercases and sorts keys', () => {
        expect(RowKeys({ B: 1, a: 2 })).toEqual(['a', 'b']);
    });

    it('AssertRowShape is case- and order-insensitive on the exact key set', () => {
        expect(() => AssertRowShape({ ID: 1, Name: 'x' }, ['name', 'id'], 'm')).not.toThrow();
        expect(() => AssertRowShape({ ID: 1 }, ['id', 'name'], 'm')).toThrow();
        expect(() => AssertRowShape({ ID: 1, Name: 'x', Extra: 2 }, ['id', 'name'], 'm')).toThrow();
    });

    it('AssertKeysInclude / AssertKeysExclude behave as subset / exclusion checks', () => {
        expect(() => AssertKeysInclude({ a: 1, b: 2 }, ['a'], 'm')).not.toThrow();
        expect(() => AssertKeysInclude({ a: 1 }, ['z'], 'm')).toThrow();
        expect(() => AssertKeysExclude({ a: 1 }, ['z'], 'm')).not.toThrow();
        expect(() => AssertKeysExclude({ a: 1 }, ['a'], 'm')).toThrow();
    });
});
