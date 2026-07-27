/**
 * Unit tests for AddressUtils — RFC 5322 address-list header parsing.
 */
import { describe, it, expect } from 'vitest';
import { parseEmailAddressList } from '../AddressUtils';

describe('parseEmailAddressList', () => {
    describe('empty and absent input', () => {
        it('returns [] for undefined', () => {
            expect(parseEmailAddressList(undefined)).toEqual([]);
        });

        it('returns [] for null', () => {
            expect(parseEmailAddressList(null)).toEqual([]);
        });

        it('returns [] for an empty string', () => {
            expect(parseEmailAddressList('')).toEqual([]);
        });

        it('returns [] for whitespace-only input', () => {
            expect(parseEmailAddressList('   ')).toEqual([]);
        });
    });

    describe('bare addresses', () => {
        it('parses a single bare address', () => {
            expect(parseEmailAddressList('jane@example.com')).toEqual(['jane@example.com']);
        });

        it('parses multiple comma-separated bare addresses', () => {
            expect(parseEmailAddressList('a@x.com, b@y.com,c@z.com')).toEqual(['a@x.com', 'b@y.com', 'c@z.com']);
        });

        it('trims surrounding whitespace', () => {
            expect(parseEmailAddressList('  a@x.com  ,   b@y.com ')).toEqual(['a@x.com', 'b@y.com']);
        });
    });

    describe('display-name forms', () => {
        it('extracts the address from an unquoted display name with angle brackets', () => {
            expect(parseEmailAddressList('Jane Doe <jane@example.com>')).toEqual(['jane@example.com']);
        });

        it('extracts the address from a quoted display name', () => {
            expect(parseEmailAddressList('"Jane Doe" <jane@example.com>')).toEqual(['jane@example.com']);
        });

        it('keeps quoted display names containing commas intact', () => {
            expect(parseEmailAddressList('"Doe, Jane" <jane@example.com>, bob@example.com')).toEqual([
                'jane@example.com',
                'bob@example.com'
            ]);
        });

        it('handles multiple quoted-comma names in one list', () => {
            expect(
                parseEmailAddressList('"Doe, Jane" <jane@x.com>, "Smith, Bob" <bob@y.com>, plain@z.com')
            ).toEqual(['jane@x.com', 'bob@y.com', 'plain@z.com']);
        });

        it('handles a display name containing an @ by preferring the angle-bracket address', () => {
            expect(parseEmailAddressList('"jane@old.example" <jane@new.example>')).toEqual(['jane@new.example']);
        });
    });

    describe('mixed and malformed entries', () => {
        it('parses a mix of bare, named, and quoted forms preserving order', () => {
            expect(
                parseEmailAddressList('first@x.com, Second Person <second@y.com>, "Third, Person" <third@z.com>')
            ).toEqual(['first@x.com', 'second@y.com', 'third@z.com']);
        });

        it('drops entries with no plausible address', () => {
            expect(parseEmailAddressList('undisclosed-recipients:;, real@example.com')).toEqual(['real@example.com']);
        });

        it('drops empty segments from trailing or doubled commas', () => {
            expect(parseEmailAddressList('a@x.com,, b@y.com,')).toEqual(['a@x.com', 'b@y.com']);
        });

        it('drops an angle-bracket entry whose address part has no @', () => {
            expect(parseEmailAddressList('Broken <not-an-address>, ok@example.com')).toEqual(['ok@example.com']);
        });
    });
});
