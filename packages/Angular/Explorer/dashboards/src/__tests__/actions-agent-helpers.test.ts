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
import { findByIdOrError } from '../Actions/agent-tool-helpers';

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
