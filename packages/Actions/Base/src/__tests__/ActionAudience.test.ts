import { describe, it, expect } from 'vitest';
import type { UserInfo } from '@memberjunction/core';
import { ActionAudienceAddsReader, ActionAudienceReaders, AUDIENCE_UNSUPPORTED_RESULT_CODE } from '../ActionAudience';

/** A hydrated-looking reader: the helpers read only `ID`. */
const user = (ID: string): UserInfo => ({ ID, Name: `User ${ID}`, UserRoles: [] }) as unknown as UserInfo;
const caller = user('CALLER-1');

describe('ActionAudienceReaders', () => {
    it('is empty without an audience', () => {
        expect(ActionAudienceReaders(undefined, caller)).toEqual([]);
    });

    it('leaves out the caller (case-insensitively) and keeps each other reader once', () => {
        const a = user('reader-a');
        const b = user('reader-b');
        const readers = ActionAudienceReaders({ Readers: [user('caller-1'), a, user('READER-A'), b] }, caller);
        expect(readers).toEqual([a, b]);
    });

    it('is empty when the only reader is the caller', () => {
        expect(ActionAudienceReaders({ Readers: [user('caller-1')] }, caller)).toEqual([]);
        expect(ActionAudienceReaders({ Readers: [] }, caller)).toEqual([]);
    });

    it('keeps every reader when there is no caller to leave out', () => {
        expect(ActionAudienceReaders({ Readers: [user('a')] }, undefined)).toHaveLength(1);
    });

    it.each([
        ['null', null],
        ['Readers missing', {}],
        ['Readers not an array', { Readers: 'everyone' }],
        ['a null reader', { Readers: [null] }],
        ['a reader with no ID', { Readers: [{ Name: 'x' }] }],
        ['a reader with a blank ID', { Readers: [{ ID: '  ' }] }],
    ])('is null (malformed) for %s', (_label, audience) => {
        expect(ActionAudienceReaders(audience, caller)).toBeNull();
    });
});

describe('ActionAudienceAddsReader', () => {
    it('is false without an audience, or when it adds nobody beyond the caller', () => {
        expect(ActionAudienceAddsReader(undefined, caller)).toBe(false);
        expect(ActionAudienceAddsReader({ Readers: [user('Caller-1')] }, caller)).toBe(false);
    });

    it('is true when a reader besides the caller is present', () => {
        expect(ActionAudienceAddsReader({ Readers: [user('Caller-1'), user('other')] }, caller)).toBe(true);
    });

    it('is true for a malformed audience (fails closed)', () => {
        expect(ActionAudienceAddsReader({ Readers: 'everyone' }, caller)).toBe(true);
        expect(ActionAudienceAddsReader(null, caller)).toBe(true);
    });
});

describe('AUDIENCE_UNSUPPORTED_RESULT_CODE', () => {
    it('is the code agents lock an action out on', () => {
        expect(AUDIENCE_UNSUPPORTED_RESULT_CODE).toBe('AUDIENCE_UNSUPPORTED');
    });
});
