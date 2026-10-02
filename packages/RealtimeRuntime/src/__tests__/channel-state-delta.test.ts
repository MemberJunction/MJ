import { describe, it, expect } from 'vitest';
import { ComputeStateDelta, FormatChannelNote, ListChangedPaths } from '../channels/channel-state-delta';
import { FormatParameterList } from '../channels/channel-schema-format';

describe('ComputeStateDelta', () => {
    it('returns null when nothing changed', () => {
        expect(ComputeStateDelta({ a: 1, b: { c: [1, 2] } }, { a: 1, b: { c: [1, 2] } })).toBeNull();
    });

    it('reports changed and added scalars as a nested partial of the new state', () => {
        const delta = ComputeStateDelta({ a: 1, b: { c: 2, d: 3 } }, { a: 1, b: { c: 9, d: 3 }, e: 'new' });
        expect(delta).toEqual({ Changed: { b: { c: 9 }, e: 'new' }, Removed: [] });
    });

    it('replaces arrays whole instead of patching them element-wise', () => {
        const delta = ComputeStateDelta({ list: [1, 2, 3] }, { list: [1, 2, 4] });
        expect(delta?.Changed).toEqual({ list: [1, 2, 4] });
    });

    it('reports removed keys as dotted paths, including nested ones', () => {
        const delta = ComputeStateDelta({ a: 1, b: { c: 2, d: 3 } }, { b: { c: 2 } });
        expect(delta?.Changed).toEqual({});
        expect([...(delta?.Removed ?? [])].sort()).toEqual(['a', 'b.d']);
    });

    it('treats a type change from object to scalar as a change, not a removal', () => {
        const delta = ComputeStateDelta({ a: { x: 1 } }, { a: 5 });
        expect(delta).toEqual({ Changed: { a: 5 }, Removed: [] });
    });
});

describe('ListChangedPaths', () => {
    it('lists paths to a bounded depth and de-duplicates', () => {
        const paths = ListChangedPaths({ Changed: { a: { b: { c: 1 }, d: 2 }, e: 3 }, Removed: ['x.y.z'] });
        expect(paths.sort()).toEqual(['a.b', 'a.d', 'e', 'x.y'].sort());
    });

    it('honors a custom depth', () => {
        expect(ListChangedPaths({ Changed: { a: { b: { c: 1 } } }, Removed: [] }, 3)).toEqual(['a.b.c']);
    });
});

describe('FormatChannelNote', () => {
    it('formats the structured one-liner with a payload', () => {
        expect(FormatChannelNote('Whiteboard', '1', 'state_changed', { n: 1 })).toBe('[channel:Whiteboard#1] state_changed {"n":1}');
    });

    it('omits the payload when there is none', () => {
        expect(FormatChannelNote('Form', '2', 'completed')).toBe('[channel:Form#2] completed');
    });
});

describe('FormatParameterList', () => {
    it('renders names, types and optionality', () => {
        expect(
            FormatParameterList({
                type: 'object',
                properties: { row: { type: 'integer' }, note: { type: 'string' }, mode: { enum: ['a', 'b'] }, any: {} },
                required: ['row'],
            }),
        ).toBe('row:integer, note?:string, mode?:a|b, any?:any');
    });

    it('renders union types and tolerates schemas with no properties', () => {
        expect(FormatParameterList({ properties: { v: { type: ['string', 'null'] } } })).toBe('v?:string|null');
        expect(FormatParameterList({ type: 'object' })).toBe('');
        expect(FormatParameterList(undefined)).toBe('');
    });
});
