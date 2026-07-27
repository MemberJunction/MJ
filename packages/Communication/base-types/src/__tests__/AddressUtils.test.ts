/**
 * Unit tests for AddressUtils — RFC 5322 address-list header parsing.
 */
import { describe, it, expect } from 'vitest';
import { ParseEmailAddressList } from '../AddressUtils';

describe('ParseEmailAddressList', () => {
    describe('empty and absent input', () => {
        it('returns [] for undefined', () => {
            expect(ParseEmailAddressList(undefined)).toEqual([]);
        });

        it('returns [] for null', () => {
            expect(ParseEmailAddressList(null)).toEqual([]);
        });

        it('returns [] for an empty string', () => {
            expect(ParseEmailAddressList('')).toEqual([]);
        });

        it('returns [] for whitespace-only input', () => {
            expect(ParseEmailAddressList('   ')).toEqual([]);
        });
    });

    describe('bare addresses', () => {
        it('parses a single bare address', () => {
            expect(ParseEmailAddressList('jane@example.com')).toEqual(['jane@example.com']);
        });

        it('parses multiple comma-separated bare addresses', () => {
            expect(ParseEmailAddressList('a@x.com, b@y.com,c@z.com')).toEqual(['a@x.com', 'b@y.com', 'c@z.com']);
        });

        it('trims surrounding whitespace', () => {
            expect(ParseEmailAddressList('  a@x.com  ,   b@y.com ')).toEqual(['a@x.com', 'b@y.com']);
        });
    });

    describe('display-name forms', () => {
        it('extracts the address from an unquoted display name with angle brackets', () => {
            expect(ParseEmailAddressList('Jane Doe <jane@example.com>')).toEqual(['jane@example.com']);
        });

        it('extracts the address from a quoted display name', () => {
            expect(ParseEmailAddressList('"Jane Doe" <jane@example.com>')).toEqual(['jane@example.com']);
        });

        it('keeps quoted display names containing commas intact', () => {
            expect(ParseEmailAddressList('"Doe, Jane" <jane@example.com>, bob@example.com')).toEqual([
                'jane@example.com',
                'bob@example.com'
            ]);
        });

        it('handles multiple quoted-comma names in one list', () => {
            expect(
                ParseEmailAddressList('"Doe, Jane" <jane@x.com>, "Smith, Bob" <bob@y.com>, plain@z.com')
            ).toEqual(['jane@x.com', 'bob@y.com', 'plain@z.com']);
        });

        it('handles a display name containing an @ by preferring the angle-bracket address', () => {
            expect(ParseEmailAddressList('"jane@old.example" <jane@new.example>')).toEqual(['jane@new.example']);
        });
    });

    describe('mixed and malformed entries', () => {
        it('parses a mix of bare, named, and quoted forms preserving order', () => {
            expect(
                ParseEmailAddressList('first@x.com, Second Person <second@y.com>, "Third, Person" <third@z.com>')
            ).toEqual(['first@x.com', 'second@y.com', 'third@z.com']);
        });

        it('drops entries with no plausible address', () => {
            expect(ParseEmailAddressList('undisclosed-recipients:;, real@example.com')).toEqual(['real@example.com']);
        });

        it('drops empty segments from trailing or doubled commas', () => {
            expect(ParseEmailAddressList('a@x.com,, b@y.com,')).toEqual(['a@x.com', 'b@y.com']);
        });

        it('drops an angle-bracket entry whose address part has no @', () => {
            expect(ParseEmailAddressList('Broken <not-an-address>, ok@example.com')).toEqual(['ok@example.com']);
        });
    });
});
