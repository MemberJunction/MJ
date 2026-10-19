/**
 * PayloadManager merges copy their inputs instead of sharing them.
 *
 * DeepMerge and MergeUpstreamPayload clone with fastCloneDeep (plain objects and arrays by hand,
 * anything else through lodash) instead of cloning the destination and then every value again.
 * These tests pin the contract that change must keep: inputs are never modified, the result
 * shares no object with them, key order follows the destination, and only plain objects are
 * merged key by key.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PayloadManager } from '../PayloadManager';

vi.mock('@memberjunction/core', () => ({
    LogError: vi.fn(),
    LogStatus: vi.fn(),
}));

describe('PayloadManager.DeepMerge copies', () => {
    let pm: PayloadManager;
    beforeEach(() => {
        pm = new PayloadManager();
    });

    it('leaves both inputs unchanged', () => {
        const destination = { a: 1, nested: { keep: true, list: [1, 2] } };
        const source = { b: 2, nested: { added: 'x' } };
        const destinationBefore = structuredClone(destination);
        const sourceBefore = structuredClone(source);

        pm.DeepMerge<Record<string, unknown>>(destination, source);

        expect(destination).toEqual(destinationBefore);
        expect(source).toEqual(sourceBefore);
    });

    it('returns a result that shares no object with either input', () => {
        type Merged = { untouched: { deep: { n: number } }; list: Array<{ id: number }>; fromSource: { deep: { n: number } } };
        const destination: Partial<Merged> = { untouched: { deep: { n: 1 } }, list: [{ id: 1 }] };
        const source: Partial<Merged> = { fromSource: { deep: { n: 2 } } };

        const result = pm.DeepMerge<Partial<Merged>>(destination, source);
        result.untouched!.deep.n = 99;
        result.list![0].id = 99;
        result.fromSource!.deep.n = 99;

        expect(destination.untouched!.deep.n).toBe(1);
        expect(destination.list![0].id).toBe(1);
        expect(source.fromSource!.deep.n).toBe(2);
    });

    it('keeps the destination key order, with new source keys after it', () => {
        const result = pm.DeepMerge<Record<string, number>>({ first: 1, second: 2, third: 3 }, { second: 20, fourth: 4 });
        expect(Object.keys(result)).toEqual(['first', 'second', 'third', 'fourth']);
        expect(result).toEqual({ first: 1, second: 20, third: 3, fourth: 4 });
    });

    it('replaces a Date instead of merging it into an empty object', () => {
        const result = pm.DeepMerge({ when: new Date('2020-01-01T00:00:00Z') }, { when: new Date('2026-10-19T00:00:00Z') });
        expect(result.when).toBeInstanceOf(Date);
        expect(result.when.toISOString()).toBe('2026-10-19T00:00:00.000Z');
    });

    it('copies a source Date rather than sharing it', () => {
        const when = new Date('2026-10-19T00:00:00Z');
        const result = pm.DeepMerge<{ when?: Date }>({}, { when });
        expect(result.when).toEqual(when);
        expect(result.when).not.toBe(when);
    });

    it('replaces arrays instead of merging them', () => {
        expect(pm.DeepMerge({ list: [1, 2, 3] }, { list: [9] })).toEqual({ list: [9] });
    });

    it('keeps a source key whose value is undefined, as before', () => {
        const result = pm.DeepMerge<{ a?: number }>({ a: 1 }, { a: undefined });
        expect(Object.prototype.hasOwnProperty.call(result, 'a')).toBe(true);
        expect(result.a).toBeUndefined();
    });
});

describe('PayloadManager.MergeUpstreamPayload copies', () => {
    let pm: PayloadManager;
    beforeEach(() => {
        pm = new PayloadManager();
    });

    it('wildcard: returns a new object and leaves the parent payload unchanged', () => {
        const parent = { plan: { steps: ['a'] }, keep: 1 };
        const before = structuredClone(parent);

        const { result } = pm.MergeUpstreamPayload('Sub', parent, { plan: { steps: ['a', 'b'] } }, ['*']);

        expect(result).not.toBe(parent);
        expect(result).toEqual({ plan: { steps: ['a', 'b'] }, keep: 1 });
        expect(parent).toEqual(before);
    });

    it('allowed paths: the merged value is a copy of the sub-agent value', () => {
        const sub = { findings: { items: [{ id: 1 }] } };
        const { result } = pm.MergeUpstreamPayload<Record<string, unknown>>('Sub', { other: true }, sub, ['findings.*']);
        const findings = result!['findings'] as { items: Array<{ id: number }> };
        findings.items[0].id = 99;

        expect(sub.findings.items[0].id).toBe(1);
    });

    it('gives the same answers for the same path patterns on repeated merges (cached patterns)', () => {
        const patterns = ['analysis.*', 'results.**.score', 'items[*]'];
        const sub = { analysis: { summary: 'ok' }, results: { a: { b: { score: 3 } } }, items: [1], blocked: 'no' };

        const first = pm.MergeUpstreamPayload<Record<string, unknown>>('Sub', {}, sub, patterns, false);
        const second = pm.MergeUpstreamPayload<Record<string, unknown>>('Sub', {}, sub, patterns, false);

        expect(second.result).toEqual(first.result);
        expect(first.result).toHaveProperty('analysis.summary', 'ok');
        expect(first.result).not.toHaveProperty('blocked');

        const narrower = pm.MergeUpstreamPayload<Record<string, unknown>>('Sub', {}, sub, ['analysis.*'], false);
        expect(narrower.result).not.toHaveProperty('results');
    });
});
