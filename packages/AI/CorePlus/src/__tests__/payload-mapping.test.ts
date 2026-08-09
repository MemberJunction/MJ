/**
 * The mapping dialect both engines must agree on (plan §5.2).
 *
 * These rules are the only route data takes between the steps of a workflow, and every branch
 * condition downstream reads what they wrote. The failure they guard against is not a crash: an
 * output mapping that silently maps nothing leaves the payload without the field a condition tests,
 * and an undefined property is merely falsy — so the workflow takes the *other* branch, completes,
 * and reports success. Nothing in the logs disagrees.
 *
 * That is why the case-insensitivity, the `*` wildcard, the `static:` prefix and the literal default
 * each get their own test: every one of them, if implemented slightly differently by the dispatcher
 * than by the flow walker, produces exactly that silent divergence.
 */
import { describe, it, expect } from 'vitest';
import {
    ApplyOutputMapping,
    BuildMappedInput,
    GetValueFromPath,
    ResolveMappedInput,
    ResolveMappedOutput,
    SetMappedValue,
} from '../task-graph/payload-mapping';

describe('GetValueFromPath', () => {
    const obj = { a: { b: { c: 42 } }, list: [{ x: 1 }, { x: 2 }] };

    it('walks a dotted path', () => {
        expect(GetValueFromPath(obj, 'a.b.c')).toBe(42);
    });

    it('indexes into an array', () => {
        expect(GetValueFromPath(obj, 'list[1].x')).toBe(2);
    });

    it('returns undefined rather than throwing on a path that does not resolve', () => {
        // A branching workflow legitimately reads fields an untaken branch never produced.
        expect(GetValueFromPath(obj, 'a.nope.c')).toBeUndefined();
        expect(GetValueFromPath(obj, 'list[9].x')).toBeUndefined();
    });
});

describe('ResolveMappedInput', () => {
    const ctx = { payload: { stockPrice: 512 }, data: { region: 'NA' }, context: { apiKey: 'k' } };

    it('treats an unprefixed string as a LITERAL', () => {
        // The common case: {"ticker": "NVDA"}. Reading it as a path would turn every authored
        // literal into undefined — which is the whole mapping silently doing nothing.
        expect(ResolveMappedInput('NVDA', ctx)).toBe('NVDA');
    });

    it('reads payload., data. and context. prefixes', () => {
        expect(ResolveMappedInput('payload.stockPrice', ctx)).toBe(512);
        expect(ResolveMappedInput('data.region', ctx)).toBe('NA');
        expect(ResolveMappedInput('context.apiKey', ctx)).toBe('k');
    });

    it('strips the static: prefix', () => {
        expect(ResolveMappedInput('static:[1,2,3]', ctx)).toBe('[1,2,3]');
    });

    it('matches prefixes case-insensitively, because stored mappings vary', () => {
        expect(ResolveMappedInput('Payload.stockPrice', ctx)).toBe(512);
        expect(ResolveMappedInput('STATIC:hello', ctx)).toBe('hello');
    });

    it('recurses through objects and arrays', () => {
        expect(ResolveMappedInput({ a: 'payload.stockPrice', b: ['x', 'payload.stockPrice'] }, ctx))
            .toEqual({ a: 512, b: ['x', 512] });
    });

    it('leaves a conversation reference alone when no resolver is supplied', () => {
        // A dispatched workflow runs with no conversation attached. Returning the literal is the
        // honest outcome; throwing would make an unrelated workflow undeployable.
        expect(ResolveMappedInput('conversation[0].content', ctx)).toBe('conversation[0].content');
    });
});

describe('BuildMappedInput', () => {
    it('builds parameters from the authored mapping', () => {
        const { params, errors } = BuildMappedInput('{"ticker":"NVDA","price":"payload.p"}', { payload: { p: 7 } });
        expect(params).toEqual({ ticker: 'NVDA', price: 7 });
        expect(errors).toEqual([]);
    });

    it('reports malformed JSON instead of throwing', () => {
        const { params, errors } = BuildMappedInput('{not json', {});
        expect(params).toEqual({});
        expect(errors[0]).toContain('not valid JSON');
    });

    it('treats an absent mapping as no parameters', () => {
        expect(BuildMappedInput(null, {}).params).toEqual({});
    });
});

describe('ResolveMappedOutput', () => {
    const result = { CurrentPrice: 512, Nested: { Inner: 'v' } };

    it('matches a field case-insensitively', () => {
        // An action's declared output casing and the author's typing rarely agree; a case-sensitive
        // miss maps nothing and says nothing.
        expect(ResolveMappedOutput(result, 'currentprice')).toBe(512);
    });

    it('walks a dotted key, case-insensitively at every level', () => {
        expect(ResolveMappedOutput(result, 'nested.inner')).toBe('v');
    });

    it('returns the whole result for *', () => {
        expect(ResolveMappedOutput(result, '*')).toEqual(result);
    });
});

describe('SetMappedValue', () => {
    it('assigns a plain key', () => {
        const t: Record<string, unknown> = {};
        SetMappedValue(t, 'x', 1);
        expect(t).toEqual({ x: 1 });
    });

    it('appends and auto-creates for a [] key', () => {
        const t: Record<string, unknown> = {};
        SetMappedValue(t, 'items[]', 'a');
        SetMappedValue(t, 'items[]', 'b');
        expect(t).toEqual({ items: ['a', 'b'] });
    });

    it('refuses to append onto a non-list rather than overwriting it', () => {
        // Append and assign mean opposite things; quietly picking one loses data the author
        // expected to accumulate.
        const t: Record<string, unknown> = { items: 'oops' };
        expect(() => SetMappedValue(t, 'items[]', 'a')).toThrow(/not a list/);
    });
});

describe('ApplyOutputMapping', () => {
    it('produces the payload update a branch condition depends on', () => {
        // The Demo workflow's first step. Without this, `payload.stockPrice > 500` reads undefined,
        // which is falsy — so the workflow takes the wrong branch and still reports success.
        const { updates } = ApplyOutputMapping({ CurrentPrice: 512 }, '{"CurrentPrice":"stockPrice"}');
        expect(updates).toEqual({ stockPrice: 512 });
    });

    it('builds nested payload paths', () => {
        const { updates } = ApplyOutputMapping({ v: 1 }, '{"v":"a.b.c"}');
        expect(updates).toEqual({ a: { b: { c: 1 } } });
    });

    it('routes $-prefixed targets away from the payload', () => {
        const { updates, specialFields } = ApplyOutputMapping(
            { msg: 'hi', conf: 0.9 },
            '{"msg":"$message","conf":"$confidence"}',
        );
        expect(updates).toEqual({});
        expect(specialFields).toEqual({ message: 'hi', confidence: 0.9 });
    });

    it('reports an unknown special field without discarding the rest of the mapping', () => {
        const { updates, errors } = ApplyOutputMapping({ a: 1, b: 2 }, '{"a":"$bogus","b":"kept"}');
        expect(updates).toEqual({ kept: 2 });
        expect(errors[0]).toContain('$bogus');
    });

    it('SKIPS a field the step did not produce rather than writing undefined over the payload', () => {
        const { updates } = ApplyOutputMapping({ a: 1 }, '{"a":"x","missing":"y"}');
        expect(updates).toEqual({ x: 1 });
        expect('y' in updates).toBe(false);
    });

    it('treats an absent mapping as no updates', () => {
        expect(ApplyOutputMapping({ a: 1 }, null).updates).toEqual({});
    });

    it('reports malformed JSON instead of throwing', () => {
        expect(ApplyOutputMapping({ a: 1 }, '{oops').errors[0]).toContain('not valid JSON');
    });
});
