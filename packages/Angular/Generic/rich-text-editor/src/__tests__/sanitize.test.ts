import { describe, it, expect } from 'vitest';
import { sanitizeToFragment } from '../lib/engine/clean/sanitize';

/** Sanitize and serialize, so assertions read as HTML. */
function clean(html: string, profile: 'email' | 'strict', source: 'load' | 'paste'): string {
    const fragment = sanitizeToFragment(html, { Profile: profile, Source: source });
    const host = document.createElement('div');
    host.appendChild(fragment);
    return host.innerHTML;
}

describe('sanitize', () => {
    describe('security — invariant across every profile and source', () => {
        const everyMode: ReadonlyArray<['email' | 'strict', 'load' | 'paste']> = [
            ['email', 'load'],
            ['email', 'paste'],
            ['strict', 'load'],
            ['strict', 'paste'],
        ];

        it.each(everyMode)('strips <script> in %s/%s', (profile, source) => {
            expect(clean('<p>a</p><script>alert(1)</script>', profile, source)).toBe('<p>a</p>');
        });

        it.each(everyMode)('strips event handlers in %s/%s', (profile, source) => {
            expect(clean('<img src="x" onerror="alert(1)">', profile, source)).not.toContain('onerror');
        });

        it.each(everyMode)('blocks javascript: URLs in %s/%s', (profile, source) => {
            expect(clean('<a href="javascript:alert(1)">x</a>', profile, source)).not.toContain('javascript:');
        });

        it.each(everyMode)('allows cid: URLs in %s/%s without any config widening', (profile, source) => {
            // Verified against DOMPurify 3.x: cid: is already in the default
            // ALLOWED_URI_REGEXP, so inline mail images need no relaxation of URI checking.
            expect(clean('<img src="cid:part1@mail">', profile, source)).toContain('cid:part1@mail');
        });

        it('never keeps comments on the paste path, even under the email profile', () => {
            // Comment retention is a documented mXSS vector; the clipboard is the untrusted
            // channel that makes it exploitable.
            expect(clean('<p>a</p><!--[if mso]>x<![endif]-->', 'email', 'paste')).toBe('<p>a</p>');
        });

        it('never allow-lists a namespaced tag whose name hints at script semantics', () => {
            expect(clean('<o:script>x</o:script>', 'email', 'load')).not.toContain('o:script');
        });
    });

    describe('email profile on the trusted load path', () => {
        it('preserves Outlook conditional comments', () => {
            expect(clean('<p>a</p><!--[if mso]>x<![endif]-->', 'email', 'load')).toBe(
                '<p>a</p><!--[if mso]>x<![endif]-->',
            );
        });

        it('cannot preserve a comment that wraps markup — a documented limit', () => {
            // DOMPurify's SAFE_FOR_XML guard (a cure53 mXSS defence) removes any comment
            // whose body contains markup, and real <!--[if mso]--> blocks usually wrap a
            // table. Turning the guard off would buy fidelity with a genuine security
            // regression, so the default keeps it. Hosts needing the markup preserved must
            // supply their own audited SanitizeToDOMFragment.
            expect(clean('<p>a</p><!--[if mso]><table></table><![endif]-->', 'email', 'load')).toBe('<p>a</p>');
        });

        it('preserves <style> blocks from a quoted region', () => {
            expect(clean('<style>p{color:red}</style><p>a</p>', 'email', 'load')).toBe(
                '<style>p{color:red}</style><p>a</p>',
            );
        });

        it('preserves Office namespaced elements', () => {
            const out = clean('<p class="MsoNormal">hi<o:p></o:p></p>', 'email', 'load');
            expect(out).toContain('<o:p>');
            expect(out).toContain('MsoNormal');
        });

        it('preserves inline styles including mso declarations', () => {
            expect(clean('<p style="margin:0;mso-x:1">a</p>', 'email', 'load')).toContain('mso-x:1');
        });
    });

    describe('strict profile', () => {
        it('drops comments', () => {
            expect(clean('<p>a</p><!-- note -->', 'strict', 'load')).toBe('<p>a</p>');
        });

        it('drops <style> blocks', () => {
            expect(clean('<style>p{color:red}</style><p>a</p>', 'strict', 'load')).toBe('<p>a</p>');
        });

        it('drops Office namespaced elements', () => {
            expect(clean('<p>hi<o:p></o:p></p>', 'strict', 'load')).toBe('<p>hi</p>');
        });
    });

    describe('structure', () => {
        it('returns a DocumentFragment, not a string', () => {
            const fragment = sanitizeToFragment('<p>a</p>', { Profile: 'strict', Source: 'load' });
            expect(fragment.nodeType).toBe(Node.DOCUMENT_FRAGMENT_NODE);
        });

        it('handles null and undefined input', () => {
            expect(clean('', 'strict', 'load')).toBe('');
            const fragment = sanitizeToFragment(null, { Profile: 'strict', Source: 'load' });
            expect(fragment.childNodes).toHaveLength(0);
        });

        it('preserves tables and their inline styles', () => {
            const out = clean('<table><tr><td style="width:1px">c</td></tr></table>', 'email', 'load');
            expect(out).toContain('<td style="width:1px">c</td>');
        });

        it('defers entirely to a host-supplied override', () => {
            const marker = document.createDocumentFragment();
            marker.appendChild(document.createElement('hr'));
            const result = sanitizeToFragment('<p>ignored</p>', {
                Profile: 'strict',
                Source: 'load',
                Override: () => marker,
            });
            expect(result).toBe(marker);
        });
    });
});
