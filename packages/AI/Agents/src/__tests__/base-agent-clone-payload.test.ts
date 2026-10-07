/**
 * cloneSubAgentPayload — payload isolation when the payload holds a Proxy.
 *
 * `structuredClone` throws DataCloneError on a Proxy (e.g. a live JSONType `<Field>Object` view).
 * The clone used to swallow that and return the ORIGINAL object, so a "parallel sub-agent's private
 * copy" was the caller's live, persisting object. The fallback must be a JSON clone, not the original.
 */
import { describe, it, expect } from 'vitest';
import { JSONFieldBinding } from '@memberjunction/core';
import { BaseAgent } from '../base-agent';

type Cloner = { cloneSubAgentPayload<T>(payload: T): T };
const clone = <T>(payload: T): T => (BaseAgent.prototype as unknown as Cloner).cloneSubAgentPayload(payload);

describe('BaseAgent.cloneSubAgentPayload', () => {
    it('deep-copies ordinary payloads', () => {
        const payload = { a: { b: [1, 2, { c: 3 }] } };
        const copy = clone(payload);
        expect(copy).toEqual(payload);
        expect(copy.a).not.toBe(payload.a);
    });

    it('passes primitives, null and undefined through', () => {
        expect(clone(5)).toBe(5);
        expect(clone(null)).toBeNull();
        expect(clone(undefined)).toBeUndefined();
    });

    it('returns an independent copy (not the original) for a live JSONType view', () => {
        let raw: string | null = JSON.stringify({ list: [{ n: 1 }] });
        const binding = new JSONFieldBinding<{ list: Array<{ n: number }> }>('Payload', () => raw, (next) => { raw = next; });
        const live = binding.GetValue()!;
        expect(() => structuredClone(live)).toThrow(); // the premise: structuredClone cannot clone it

        const copy = clone(live);
        expect(copy).not.toBe(live);
        copy.list[0].n = 99;
        copy.list.push({ n: 2 });
        expect(raw).toBe(JSON.stringify({ list: [{ n: 1 }] })); // the entity's raw value is untouched
        expect(live.list[0].n).toBe(1);
    });
});
