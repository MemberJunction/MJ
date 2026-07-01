/**
 * Tests for the pure helper backing the Actions dashboard's AI-agent client tools.
 * The Overview / Explorer / Monitor components are thin wrappers; the testable
 * logic is the id-resolution extracted into `Actions/agent-tool-helpers.ts`.
 *
 * 🚨 SAFETY NOTE: these helpers only resolve / validate tool input — they have
 * no side effects. The Actions app intentionally never exposes action
 * EXECUTION to the agent.
 */
import { describe, it, expect } from 'vitest';
import { findByIdOrError, findByNameOrError, findByIdOrNameOrError } from '../Actions/agent-tool-helpers';

interface Rec {
    ID: string;
    Name: string;
}

const collection: Rec[] = [
    { ID: 'A1B2C3', Name: 'Send Email' },
    { ID: 'D4E5F6', Name: 'Create Invoice' },
];

describe('findByIdOrError', () => {
    it('resolves a record by exact id', () => {
        const r = findByIdOrError('A1B2C3', collection, 'action');
        expect(r.ok).toBe(true);
        if (r.ok) expect(r.value.Name).toBe('Send Email');
    });

    it('resolves case-insensitively (SQL Server upper vs PG lower)', () => {
        const r = findByIdOrError('a1b2c3', collection, 'action');
        expect(r.ok).toBe(true);
        if (r.ok) expect(r.value.Name).toBe('Send Email');
    });

    it('trims surrounding whitespace before matching', () => {
        const r = findByIdOrError('  D4E5F6  ', collection, 'action');
        expect(r.ok).toBe(true);
        if (r.ok) expect(r.value.Name).toBe('Create Invoice');
    });

    it('returns a typed failure for an unknown id', () => {
        const r = findByIdOrError('ZZZZZZ', collection, 'action');
        expect(r.ok).toBe(false);
        if (!r.ok) {
            expect(r.result.Success).toBe(false);
            expect(r.result.ErrorMessage).toContain('No action found');
            expect(r.result.ErrorMessage).toContain('ZZZZZZ');
        }
    });

    it('returns a typed failure for an empty string id', () => {
        const r = findByIdOrError('', collection, 'execution');
        expect(r.ok).toBe(false);
        if (!r.ok) {
            expect(r.result.Success).toBe(false);
            expect(r.result.ErrorMessage).toContain('non-empty execution id');
        }
    });

    it('returns a typed failure for a non-string id (never throws)', () => {
        const r = findByIdOrError(undefined, collection, 'execution');
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.result.Success).toBe(false);

        const r2 = findByIdOrError(42, collection, 'action');
        expect(r2.ok).toBe(false);
    });

    it('handles records with a missing ID field gracefully', () => {
        const odd = [{ ID: undefined as unknown as string, Name: 'broken' }];
        const r = findByIdOrError('anything', odd, 'action');
        expect(r.ok).toBe(false);
    });
});

describe('findByNameOrError', () => {
    it('resolves a record by exact name (case-insensitive)', () => {
        const r = findByNameOrError('send email', collection, 'action');
        expect(r.ok).toBe(true);
        if (r.ok) expect(r.value.ID).toBe('A1B2C3');
    });

    it('prefers an exact match over a contains match', () => {
        const recs: Rec[] = [
            { ID: '1', Name: 'Invoice Reminder' },
            { ID: '2', Name: 'Invoice' },
        ];
        const r = findByNameOrError('Invoice', recs, 'action');
        expect(r.ok).toBe(true);
        if (r.ok) expect(r.value.ID).toBe('2');
    });

    it('falls back to a case-insensitive contains match', () => {
        const r = findByNameOrError('invoice', collection, 'action');
        expect(r.ok).toBe(true);
        if (r.ok) expect(r.value.Name).toBe('Create Invoice');
    });

    it('trims surrounding whitespace before matching', () => {
        const r = findByNameOrError('  send email  ', collection, 'action');
        expect(r.ok).toBe(true);
        if (r.ok) expect(r.value.ID).toBe('A1B2C3');
    });

    it('returns a typed failure listing sample names on a miss', () => {
        const r = findByNameOrError('No Such Action', collection, 'action');
        expect(r.ok).toBe(false);
        if (!r.ok) {
            expect(r.result.Success).toBe(false);
            expect(r.result.ErrorMessage).toContain('No action found matching');
            expect(r.result.ErrorMessage).toContain('Send Email');
        }
    });

    it('returns a typed failure for empty / non-string input (never throws)', () => {
        expect(findByNameOrError('', collection, 'action').ok).toBe(false);
        expect(findByNameOrError(undefined, collection, 'action').ok).toBe(false);
        expect(findByNameOrError(99, collection, 'action').ok).toBe(false);
    });
});

describe('findByIdOrNameOrError', () => {
    it('resolves by id first when the value is a valid id', () => {
        const r = findByIdOrNameOrError('D4E5F6', collection, 'action');
        expect(r.ok).toBe(true);
        if (r.ok) expect(r.value.Name).toBe('Create Invoice');
    });

    it('falls back to name resolution when the value is not an id', () => {
        const r = findByIdOrNameOrError('Send Email', collection, 'action');
        expect(r.ok).toBe(true);
        if (r.ok) expect(r.value.ID).toBe('A1B2C3');
    });

    it('resolves by name case-insensitively (contains)', () => {
        const r = findByIdOrNameOrError('invoice', collection, 'action');
        expect(r.ok).toBe(true);
        if (r.ok) expect(r.value.ID).toBe('D4E5F6');
    });

    it('returns a typed failure when neither id nor name matches', () => {
        const r = findByIdOrNameOrError('totally-unknown', collection, 'action');
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.result.Success).toBe(false);
    });

    it('returns a typed failure for empty / non-string input (never throws)', () => {
        expect(findByIdOrNameOrError('', collection, 'action').ok).toBe(false);
        expect(findByIdOrNameOrError(undefined, collection, 'action').ok).toBe(false);
    });
});
