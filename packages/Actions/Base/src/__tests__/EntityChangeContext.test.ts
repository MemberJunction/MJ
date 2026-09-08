/**
 * Tests for the change contract that makes transition filters possible.
 *
 * The distinction this whole module exists to draw is **state vs transition**: "Status is Approved"
 * is true on every save after the approval, while "Status became Approved" is true exactly once.
 * Every test here is really about keeping that line sharp, because the failure mode on the wrong
 * side of it is a workflow that runs an agent on every subsequent save of the record — expensive,
 * and invisible until someone reads a bill.
 */
import { describe, it, expect } from 'vitest';
import {
    BuildEntityChangeContext,
    DidFieldChange,
    DidFieldChangeToValue,
    LooseEquals,
    ReadFieldValue,
    type ChangeTrackedEntity,
} from '../EntityChangeContext';

/** A stand-in for the parts of BaseEntity the builder reads. */
const entity = (
    IsSaved: boolean,
    fields: Array<{ Name: string; Value: unknown; OldValue: unknown }>,
): ChangeTrackedEntity => ({ IsSaved, Fields: fields });

describe('BuildEntityChangeContext', () => {
    it('reports only the fields whose value actually differs', () => {
        const change = BuildEntityChangeContext(entity(true, [
            { Name: 'Status', Value: 'Approved', OldValue: 'Pending' },
            { Name: 'Amount', Value: 100, OldValue: 100 },
        ]));
        expect(change.ChangedFields).toEqual(['Status']);
    });

    it('does NOT report a field re-assigned its existing value', () => {
        // The dirty flag would say yes here — assigning a field its current value still marks it
        // dirty — and a filter firing on that reports a change that did not happen.
        const change = BuildEntityChangeContext(entity(true, [
            { Name: 'Status', Value: 'Approved', OldValue: 'Approved' },
        ]));
        expect(change.ChangedFields).toEqual([]);
    });

    it('treats a create as having no before, so nothing "changed"', () => {
        // A record whose Status started at Approved did not BECOME approved. Saying otherwise would
        // fire every "when Status becomes X" trigger on every insert.
        const change = BuildEntityChangeContext(entity(false, [
            { Name: 'Status', Value: 'Approved', OldValue: null },
        ]));
        expect(change.IsCreate).toBe(true);
        expect(change.ChangedFields).toEqual([]);
        expect(change.OldValues).toEqual({});
        expect(change.NewValues).toEqual({ Status: 'Approved' });
    });

    it('carries both sides for an update', () => {
        const change = BuildEntityChangeContext(entity(true, [
            { Name: 'Status', Value: 'Approved', OldValue: 'Pending' },
        ]));
        expect(change.OldValues).toEqual({ Status: 'Pending' });
        expect(change.NewValues).toEqual({ Status: 'Approved' });
    });

    it('counts a transition into null as a change', () => {
        const change = BuildEntityChangeContext(entity(true, [
            { Name: 'OwnerID', Value: null, OldValue: 'user-1' },
        ]));
        expect(change.ChangedFields).toEqual(['OwnerID']);
    });

    it('does not count null becoming undefined — both are absence', () => {
        const change = BuildEntityChangeContext(entity(true, [
            { Name: 'OwnerID', Value: undefined, OldValue: null },
        ]));
        expect(change.ChangedFields).toEqual([]);
    });
});

describe('DidFieldChange', () => {
    const change = BuildEntityChangeContext(entity(true, [
        { Name: 'Status', Value: 'Approved', OldValue: 'Pending' },
    ]));

    it('matches regardless of case, as field names do everywhere else in MJ', () => {
        expect(DidFieldChange(change, 'status')).toBe(true);
        expect(DidFieldChange(change, '  Status ')).toBe(true);
    });

    it('is false for a field that did not change', () => {
        expect(DidFieldChange(change, 'Amount')).toBe(false);
    });

    it('is false when there is no change context at all', () => {
        // A direct invocation or a View fan-out has no save behind it. "I cannot tell" must read as
        // false, because filters gate execution — the alternative is firing on a question nobody
        // could answer.
        expect(DidFieldChange(undefined, 'Status')).toBe(false);
    });
});

describe('DidFieldChangeToValue', () => {
    const toApproved = BuildEntityChangeContext(entity(true, [
        { Name: 'Status', Value: 'Approved', OldValue: 'Pending' },
    ]));

    it('is true only when the field changed AND landed on the value', () => {
        expect(DidFieldChangeToValue(toApproved, 'Status', 'Approved')).toBe(true);
        expect(DidFieldChangeToValue(toApproved, 'Status', 'Rejected')).toBe(false);
    });

    it('is false when the field already held the value — that is state, not transition', () => {
        const stillApproved = BuildEntityChangeContext(entity(true, [
            { Name: 'Status', Value: 'Approved', OldValue: 'Approved' },
        ]));
        expect(DidFieldChangeToValue(stillApproved, 'Status', 'Approved')).toBe(false);
    });

    it('is false on a create, even though the new value matches', () => {
        const created = BuildEntityChangeContext(entity(false, [
            { Name: 'Status', Value: 'Approved', OldValue: null },
        ]));
        expect(DidFieldChangeToValue(created, 'Status', 'Approved')).toBe(false);
    });
});

describe('LooseEquals — comparing across the string boundary metadata forces', () => {
    it('matches a number against its string form', () => {
        // A filter's configured value arrives as text; the field holds a number. Comparing strictly
        // would make the filter silently never match, which reads as "my automation is broken".
        expect(LooseEquals(1, '1')).toBe(true);
    });

    it('matches booleans written the several ways a database produces them', () => {
        expect(LooseEquals(true, 'true')).toBe(true);
        expect(LooseEquals(true, 1)).toBe(true);
        expect(LooseEquals(false, '0')).toBe(true);
        expect(LooseEquals(true, 'no')).toBe(false);
    });

    it('matches dates against their serialized form', () => {
        const d = new Date('2026-01-01T00:00:00.000Z');
        expect(LooseEquals(d, '2026-01-01T00:00:00.000Z')).toBe(true);
    });

    it('treats null and undefined as the same absence', () => {
        expect(LooseEquals(null, undefined)).toBe(true);
        expect(LooseEquals(null, '')).toBe(false);
    });

    it('ignores surrounding whitespace and case for strings', () => {
        expect(LooseEquals(' Approved ', 'approved')).toBe(true);
    });
});

describe('ReadFieldValue', () => {
    it('reads case-insensitively', () => {
        expect(ReadFieldValue({ Status: 'Approved' }, 'status')).toBe('Approved');
    });

    it('returns undefined for a field the record does not have', () => {
        expect(ReadFieldValue({ Status: 'Approved' }, 'Nope')).toBeUndefined();
    });
});
