import { describe, it, expect } from 'vitest';
import {
    BuildMailtoURL,
    IsMailtoURLWithinLimit,
    MAILTO_MAX_URL_LENGTH,
    type ComposeEmailCommand,
} from '../ui-commands';

/**
 * Every case here guards a failure that is SILENT in a mail client: a mis-encoded field corrupts
 * the parse without erroring, and an over-long URL opens a draft with the body truncated. Neither
 * surfaces to the user before they hit send.
 */
describe('BuildMailtoURL', () => {
    const cmd = (over: Partial<ComposeEmailCommand>): ComposeEmailCommand => ({
        type: 'compose:email',
        label: 'Open draft in Mail',
        ...over,
    });

    describe('encoding', () => {
        it('encodes the @ in an address', () => {
            expect(BuildMailtoURL(cmd({ to: ['a@x.com'] }))).toBe('mailto:a%40x.com');
        });

        it('encodes & in the subject so it cannot start a new parameter', () => {
            expect(BuildMailtoURL(cmd({ to: ['a@x.com'], subject: 'a&body=evil' })))
                .toContain('subject=a%26body%3Devil');
        });

        it('encodes # in the body so it cannot become a fragment', () => {
            expect(BuildMailtoURL(cmd({ to: ['a@x.com'], body: 'item #1' })))
                .toContain('body=item%20%231');
        });

        it('preserves plus-addressing (a+tag@x.com is an address, not a space)', () => {
            expect(BuildMailtoURL(cmd({ to: ['a+tag@x.com'] }))).toBe('mailto:a%2Btag%40x.com');
        });

        it('encodes newlines rather than emitting raw line breaks', () => {
            expect(BuildMailtoURL(cmd({ to: ['a@x.com'], body: 'one\ntwo' }))).toContain('body=one%0Atwo');
        });
    });

    describe('shape', () => {
        it('comma-joins multiple recipients in the path', () => {
            expect(BuildMailtoURL(cmd({ to: ['a@x.com', 'b@x.com'] }))).toBe('mailto:a%40x.com,b%40x.com');
        });

        it('puts cc and bcc in the query, not the path', () => {
            expect(BuildMailtoURL(cmd({ to: ['a@x.com'], cc: ['c@x.com'], bcc: ['d@x.com'] })))
                .toBe('mailto:a%40x.com?cc=c%40x.com&bcc=d%40x.com');
        });

        it('still builds with no recipient — agents omit `to` rather than guess one', () => {
            expect(BuildMailtoURL(cmd({ subject: 'Hi' }))).toBe('mailto:?subject=Hi');
        });

        it('omits absent and empty fields entirely rather than sending them blank', () => {
            expect(BuildMailtoURL(cmd({ to: ['a@x.com'], cc: [], subject: '', body: '' })))
                .toBe('mailto:a%40x.com');
        });

        it('drops blank and whitespace-only recipients', () => {
            expect(BuildMailtoURL(cmd({ to: ['  ', '', 'a@x.com'] }))).toBe('mailto:a%40x.com');
        });
    });

    describe('length guard', () => {
        it('uses the observed 1800-character floor', () => {
            expect(MAILTO_MAX_URL_LENGTH).toBe(1800);
        });

        it('allows a URL exactly at the limit', () => {
            expect(IsMailtoURLWithinLimit('x'.repeat(MAILTO_MAX_URL_LENGTH))).toBe(true);
        });

        it('refuses one character over', () => {
            expect(IsMailtoURLWithinLimit('x'.repeat(MAILTO_MAX_URL_LENGTH + 1))).toBe(false);
        });

        it('trips on a realistically long body', () => {
            const url = BuildMailtoURL(cmd({ to: ['a@x.com'], body: 'word '.repeat(400) }));
            expect(IsMailtoURLWithinLimit(url)).toBe(false);
        });

        // The reason agents must be given a ceiling near 1,000 rather than near 1,800: encoding
        // inflates the text, so the character count they see is not the one the limit applies to.
        it('shows that encoding inflates well past the raw character count', () => {
            const body = 'This is a sentence of ordinary business prose. '.repeat(22).slice(0, 1000);
            const url = BuildMailtoURL(cmd({ to: ['bob@example.com'], subject: 'Renewal', body }));
            expect(body.length).toBe(1000);
            expect(url.length).toBeGreaterThan(1300);
            expect(IsMailtoURLWithinLimit(url)).toBe(true);
        });
    });
});
