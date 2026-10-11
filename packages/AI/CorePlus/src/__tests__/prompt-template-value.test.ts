/**
 * ToPromptTemplateValue: one value a prompt template can read by field, `| dump`, and print whole.
 *
 * The task-graph dispatcher handed Flow prompt templates `_CURRENT_PAYLOAD` as a JSON string, so
 * `{{ _CURRENT_PAYLOAD.field }}` rendered empty and `| dump` double-encoded; the in-run executor handed
 * them an object, so `{{ _CURRENT_PAYLOAD }}` rendered `[object Object]`. These pin the shape that
 * serves all three.
 */
import { describe, it, expect } from 'vitest';
import { ToPromptTemplateValue } from '../prompt-template-value';

const PAYLOAD = {
    assessment: { score: 7, notes: ['clear', 'concise'] },
    title: 'Quarterly update',
    items: [{ name: 'a' }, { name: 'b' }],
};

describe('ToPromptTemplateValue', () => {
    it('keeps every field readable as an ordinary object', () => {
        const value = ToPromptTemplateValue(PAYLOAD);

        expect(value.title).toBe('Quarterly update');
        expect(value.assessment.score).toBe(7);
        expect(value.items[1].name).toBe('b');
        expect(Object.keys(value)).toEqual(['assessment', 'title', 'items']);
    });

    it('prints whole as two-space JSON, not [object Object]', () => {
        const value = ToPromptTemplateValue(PAYLOAD);

        expect(String(value)).toBe(JSON.stringify(PAYLOAD, null, 2));
        expect(`${value}`).toBe(JSON.stringify(PAYLOAD, null, 2));
    });

    it('prints nested objects and arrays as JSON too', () => {
        const value = ToPromptTemplateValue(PAYLOAD);

        expect(String(value.assessment)).toBe(JSON.stringify(PAYLOAD.assessment, null, 2));
        expect(String(value.items)).toBe(JSON.stringify(PAYLOAD.items, null, 2));
    });

    it('serializes exactly like the original, so | dump is single-encoded', () => {
        const value = ToPromptTemplateValue(PAYLOAD);

        expect(JSON.stringify(value)).toBe(JSON.stringify(PAYLOAD));
    });

    it('round-trips through JSON.parse, which is what the jsonparse filter does', () => {
        const value = ToPromptTemplateValue(PAYLOAD);

        expect(JSON.parse(String(value))).toEqual(PAYLOAD);
    });

    it('never mutates its input', () => {
        const input = { nested: { a: 1 } };
        const value = ToPromptTemplateValue(input);

        expect(value).not.toBe(input);
        expect(value.nested).not.toBe(input.nested);
        expect(Object.prototype.hasOwnProperty.call(input, 'toString')).toBe(false);
        expect(Object.prototype.hasOwnProperty.call(input.nested, 'toString')).toBe(false);
    });

    it('returns scalars, null and non-plain objects unchanged', () => {
        const when = new Date('2026-10-08T00:00:00Z');

        expect(ToPromptTemplateValue('text')).toBe('text');
        expect(ToPromptTemplateValue(42)).toBe(42);
        expect(ToPromptTemplateValue(null)).toBeNull();
        expect(ToPromptTemplateValue(undefined)).toBeUndefined();
        expect(ToPromptTemplateValue(when)).toBe(when);
    });

    it('keeps a payload field named toString instead of overwriting it', () => {
        const value = ToPromptTemplateValue({ toString: 'a field' });

        expect(JSON.stringify(value)).toBe('{"toString":"a field"}');
    });

    it('survives a cyclic value: field access works and printing reports the cycle instead of throwing', () => {
        const cyclic: { name: string; self?: object } = { name: 'loop' };
        cyclic.self = cyclic;

        const value = ToPromptTemplateValue(cyclic);

        expect(value.name).toBe('loop');
        expect(value.self).toBe(value);
        expect(String(value)).toMatch(/^\[value could not be rendered as JSON: /);
    });
});
