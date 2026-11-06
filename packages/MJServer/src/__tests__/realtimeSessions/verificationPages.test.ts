import { describe, it, expect } from 'vitest';
import {
    BuildVerificationEmail,
    BuildVerifyConfirmHtml,
    BuildVerifyErrorHtml,
    BuildVerifyFailureHtml,
    BuildVerifySuccessHtml,
} from '../../realtimeSessions/verificationPages.js';

describe('BuildVerificationEmail', () => {
    const input = { Name: 'Pat', Code: '123456', LinkUrl: 'https://api.example.com/realtime/verify/mj_rv_abc', TtlMinutes: 30 };

    it('carries the link and the code in both bodies', () => {
        const email = BuildVerificationEmail(input);
        for (const body of [email.Text, email.Html]) {
            expect(body).toContain('123456');
            expect(body).toContain('https://api.example.com/realtime/verify/mj_rv_abc');
            expect(body).toContain('30 minutes');
        }
    });

    it('keeps the name and the code out of the subject (subjects show on lock screens)', () => {
        const email = BuildVerificationEmail(input);
        expect(email.Subject).not.toContain('Pat');
        expect(email.Subject).not.toContain('123456');
    });

    it('HTML-escapes the name, the link and the code', () => {
        const email = BuildVerificationEmail({ ...input, Name: '<script>alert(1)</script>', LinkUrl: 'https://x.test/?a=1&b="2"', Code: '<b>' });
        expect(email.Html).not.toContain('<script>');
        expect(email.Html).toContain('&lt;script&gt;');
        expect(email.Html).toContain('a=1&amp;b=&quot;2&quot;');
        expect(email.Html).not.toContain('<b>');
    });

    it('reduces the name to one line in the text body (no header-injection newlines)', () => {
        const email = BuildVerificationEmail({ ...input, Name: 'Pat\nBcc: x@y.z' });
        expect(email.Text.split('\n')[0]).toBe('Hi Pat Bcc: x@y.z,');
    });

    it('falls back to a bare greeting and pluralises the TTL', () => {
        expect(BuildVerificationEmail({ ...input, Name: '  ', TtlMinutes: 1 }).Text).toMatch(/^Hi,\n/);
        expect(BuildVerificationEmail({ ...input, TtlMinutes: 1 }).Text).toContain('1 minute.');
    });

    it('tells the reader it is safe to ignore', () => {
        expect(BuildVerificationEmail(input).Text).toContain('ignore this email');
    });
});

describe('verify pages', () => {
    it('the confirm page is a POST form with the token in a hidden field, not in the action URL', () => {
        const html = BuildVerifyConfirmHtml('mj_rv_token', '/realtime/verify');
        expect(html).toContain('<form method="POST" action="/realtime/verify">');
        expect(html).toContain('<input type="hidden" name="token" value="mj_rv_token">');
        expect(html).not.toContain('action="/realtime/verify/mj_rv_token"');
    });

    it('escapes a hostile token in the confirm page', () => {
        const html = BuildVerifyConfirmHtml('"><script>alert(1)</script>', '/realtime/verify');
        expect(html).not.toContain('<script>');
    });

    it('the success page confirms and leaks nothing about the session', () => {
        const html = BuildVerifySuccessHtml();
        expect(html).toContain("You're verified");
        expect(html.toLowerCase()).toContain('return to your conversation');
        expect(html).not.toMatch(/@|mj_rv_|session|agent/i);
    });

    it('the failure page is one uniform page that names no cause', () => {
        const html = BuildVerifyFailureHtml();
        expect(html).toContain('no longer valid');
        expect(html).not.toMatch(/expired:|unknown|not found|already used:/i);
        expect(BuildVerifyFailureHtml()).toBe(html);
    });

    it('every page is noindex and self-contained (no external resources)', () => {
        for (const html of [BuildVerifyConfirmHtml('t', '/p'), BuildVerifySuccessHtml(), BuildVerifyFailureHtml(), BuildVerifyErrorHtml()]) {
            expect(html).toContain('noindex');
            expect(html).not.toMatch(/<script|<link|<img|src=|href=/i);
        }
    });
});
