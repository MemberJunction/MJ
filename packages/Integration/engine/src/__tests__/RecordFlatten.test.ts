import { describe, it, expect } from 'vitest';
import { flattenRecord, hasNestedObject } from '../RecordFlatten.js';

describe('flattenRecord', () => {
    it('passes a flat record through unchanged (no-op for existing flat connectors)', () => {
        const flat = { id: '5', name: 'Alice', active: true, score: 3.5 };
        expect(flattenRecord(flat)).toEqual(flat);
    });

    it('flattens a PropFuel-shaped nested record into scalar columns', () => {
        const raw = {
            checkin_question: { id: 158134388, checkin_id: 153708244, rating: null, response: null },
            contact: { id: 42, email: 'a@example.com' },
            question: { id: 7, text: 'How was it?' },
            campaign: { id: 99, name: 'Q2' },
        };
        expect(flattenRecord(raw)).toEqual({
            checkin_question_id: 158134388,
            checkin_question_checkin_id: 153708244,
            checkin_question_rating: null,
            checkin_question_response: null,
            contact_id: 42,
            contact_email: 'a@example.com',
            question_id: 7,
            question_text: 'How was it?',
            campaign_id: 99,
            campaign_name: 'Q2',
        });
    });

    it('THE dupe proof: the same logical record across two files yields ONE stable scalar id, even when a mutable field changes', () => {
        // Same checkin_question.id (158134388) appearing in an EARLIER file (unanswered) and a LATER
        // file (answered → rating filled). The OLD object-valued PK = the whole `checkin_question` blob,
        // which DIFFERS between the two (rating null vs 5) → two identities → two rows (the dupe).
        // After flatten, the PK is the scalar `checkin_question_id`, IDENTICAL across both → one row.
        const fileA = { checkin_question: { id: 158134388, rating: null }, contact: { id: 42 } };
        const fileB = { checkin_question: { id: 158134388, rating: 5 }, contact: { id: 42 } };

        const a = flattenRecord(fileA);
        const b = flattenRecord(fileB);

        // Identity is stable per logical record …
        expect(a.checkin_question_id).toBe(158134388);
        expect(b.checkin_question_id).toBe(158134388);
        expect(a.checkin_question_id).toBe(b.checkin_question_id);
        // … while the change-detection content (rating) still differs, so the engine correctly UPDATES
        // (one row → latest), rather than CREATING a duplicate.
        expect(a.checkin_question_rating).toBe(null);
        expect(b.checkin_question_rating).toBe(5);
    });

    it('keeps arrays, Dates, and null as leaf values (not column-flattenable)', () => {
        const d = new Date('2026-04-30T13:31:56.000Z');
        const raw = { tags: ['x', 'y'], when: d, note: null, meta: { a: 1 } };
        const out = flattenRecord(raw);
        expect(out.tags).toEqual(['x', 'y']);
        expect(out.when).toBe(d);
        expect(out.note).toBe(null);
        expect(out.meta_a).toBe(1);
    });

    it('bounds recursion at MaxDepth — an object at the limit is kept as a leaf blob', () => {
        const raw = { a: { b: { c: { d: { e: 1 } } } } };
        // MaxDepth 2: a (d0) → a_b (d1) → a_b_c kept as a blob (would be d2's children, depth limit hit).
        const out = flattenRecord(raw, { MaxDepth: 2 });
        expect(out).toEqual({ 'a_b_c': { d: { e: 1 } } });
    });

    it('honors a custom separator', () => {
        expect(flattenRecord({ a: { b: 1 } }, { Separator: '.' })).toEqual({ 'a.b': 1 });
    });

    it('on key collision keeps the first value and reports it', () => {
        const collisions: string[] = [];
        // pre-existing `a_b` collides with the flattened `a.b`
        const out = flattenRecord({ a_b: 'first', a: { b: 'second' } }, { onCollision: k => collisions.push(k) });
        expect(out.a_b).toBe('first');
        expect(collisions).toContain('a_b');
    });
});

describe('hasNestedObject', () => {
    it('is false for a flat record', () => {
        expect(hasNestedObject({ id: 1, name: 'x', tags: ['a'], when: new Date() })).toBe(false);
    });
    it('is true when any value is a plain object', () => {
        expect(hasNestedObject({ id: 1, checkin_question: { id: 2 } })).toBe(true);
    });
});
