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
        it('leaves @ readable in the path but encodes everything else', () => {
            // `@` is legal in an addr-spec (RFC 6068); a protocol handler that does not decode the
            // path would otherwise show the user a literal `a%40x.com` in their To field.
            expect(BuildMailtoURL(cmd({ to: ['a@x.com'] })).url).toBe('mailto:a@x.com');
        });

        it('encodes & in the subject so it cannot start a new parameter', () => {
            expect(BuildMailtoURL(cmd({ to: ['a@x.com'], subject: 'a&body=evil' })).url)
                .toContain('subject=a%26body%3Devil');
        });

        it('encodes # in the body so it cannot become a fragment', () => {
            expect(BuildMailtoURL(cmd({ to: ['a@x.com'], body: 'item #1' })).url)
                .toContain('body=item%20%231');
        });

        it('preserves plus-addressing (a+tag@x.com is an address, not a space)', () => {
            expect(BuildMailtoURL(cmd({ to: ['a+tag@x.com'] })).url).toBe('mailto:a%2Btag@x.com');
        });

        it('encodes newlines rather than emitting raw line breaks', () => {
            expect(BuildMailtoURL(cmd({ to: ['a@x.com'], body: 'one\ntwo' })).url).toContain('body=one%0Atwo');
        });
    });

    describe('shape', () => {
        it('comma-joins multiple recipients in the path', () => {
            expect(BuildMailtoURL(cmd({ to: ['a@x.com', 'b@x.com'] })).url).toBe('mailto:a@x.com,b@x.com');
        });

        it('puts cc and bcc in the query, not the path', () => {
            expect(BuildMailtoURL(cmd({ to: ['a@x.com'], cc: ['c@x.com'], bcc: ['d@x.com'] })).url)
                .toBe('mailto:a@x.com?cc=c%40x.com&bcc=d%40x.com');
        });

        it('still builds with no recipient — agents omit `to` rather than guess one', () => {
            expect(BuildMailtoURL(cmd({ subject: 'Hi' })).url).toBe('mailto:?subject=Hi');
        });

        it('omits absent and empty fields entirely rather than sending them blank', () => {
            expect(BuildMailtoURL(cmd({ to: ['a@x.com'], cc: [], subject: '', body: '' })).url)
                .toBe('mailto:a@x.com');
        });

        it('drops blank and whitespace-only recipients', () => {
            expect(BuildMailtoURL(cmd({ to: ['  ', '', 'a@x.com'] })).url).toBe('mailto:a@x.com');
        });
    });

    describe('length guard', () => {
        it('reports the verdict alongside the URL so a caller cannot skip the check', () => {
            expect(BuildMailtoURL(cmd({ to: ['a@x.com'] })).withinLimit).toBe(true);
            expect(BuildMailtoURL(cmd({ to: ['a@x.com'], body: 'word '.repeat(500) })).withinLimit).toBe(false);
        });

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
            const url = BuildMailtoURL(cmd({ to: ['a@x.com'], body: 'word '.repeat(400) })).url;
            expect(IsMailtoURLWithinLimit(url)).toBe(false);
        });

        // The reason agents must be given a ceiling near 1,000 rather than near 1,800: encoding
        // inflates the text, so the character count they see is not the one the limit applies to.
        it('shows that encoding inflates well past the raw character count', () => {
            const body = 'This is a sentence of ordinary business prose. '.repeat(22).slice(0, 1000);
            const url = BuildMailtoURL(cmd({ to: ['bob@example.com'], subject: 'Renewal', body })).url;
            expect(body.length).toBe(1000);
            expect(url.length).toBeGreaterThan(1300);
            expect(IsMailtoURLWithinLimit(url)).toBe(true);
        });
    });
});
