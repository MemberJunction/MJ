import { RichTextSanitizeProfile } from '../../lib/rich-text-editor.types';

/**
 * The fidelity corpus.
 *
 * These are the documents the editor promises not to damage. They are deliberately drawn
 * from the messy end of the real world — Outlook reply chains, Word paste, Gmail composer
 * output — because clean hand-written HTML proves nothing about an editor whose entire
 * reason for existing is surviving markup it did not author.
 *
 * Several of them have **no in-repo consumer today**. They are here anyway: the fixture
 * suite is now the only evidence the fidelity thesis holds, so it has to cover the hard
 * cases before a consumer arrives that depends on them.
 */

/** One document under test. */
export interface RoundTripFixture {
    /** Short identifier used in test names. */
    Name: string;
    /** Why this document is interesting — what would break without the guarantee. */
    Rationale: string;
    /** The markup to load. */
    Html: string;
    /** Which profile this fixture is meaningful under. */
    Profile: RichTextSanitizeProfile;
    /**
     * What the round trip is expected to produce, when that differs from {@link Html}
     * because the sanitizer removes something even on the trusted path.
     *
     * Setting this is a deliberate, reviewable act: it records a known limit of the
     * fidelity guarantee rather than letting the loss pass unnoticed. Always explain the
     * reason in {@link Rationale}.
     */
    ExpectedHtml?: string;
}

export const ROUND_TRIP_FIXTURES: readonly RoundTripFixture[] = [
    {
        Name: 'outlook-reply-chain',
        Rationale:
            'Conditional comments, <o:p> spacers and MsoNormal classes are what every ' +
            'schema-based editor silently deletes. This is the headline case.',
        Profile: 'email',
        Html:
            '<div>My reply.</div>' +
            '<div><br></div>' +
            '<!--[if mso]>spacer<![endif]-->' +
            '<div style="border-top:1px solid #ccc">' +
            '<p class="MsoNormal">From: Someone<o:p></o:p></p>' +
            '<p class="MsoNormal" style="margin:0;mso-spacerun:yes">Original message body.<o:p></o:p></p>' +
            '</div>',
    },
    {
        Name: 'outlook-conditional-wrapping-markup',
        Rationale:
            'A KNOWN LIMIT, recorded rather than hidden. DOMPurify\'s SAFE_FOR_XML guard ' +
            '(a cure53 mXSS defence) removes any comment whose body contains markup, and ' +
            'real <!--[if mso]--> blocks usually wrap a table or div. Text-only conditionals ' +
            'survive; markup-bearing ones do not. Disabling the guard would trade a real ' +
            'mXSS defence for fidelity, so the default keeps the guard. A host that has ' +
            'audited its own path can supply SanitizeToDOMFragment to override the stage ' +
            'entirely.',
        Profile: 'email',
        Html:
            '<div>Reply</div>' +
            '<!--[if mso]><table><tr><td>spacer</td></tr></table><![endif]-->' +
            '<div>Quoted</div>',
        ExpectedHtml: '<div>Reply</div><div>Quoted</div>',
    },
    {
        Name: 'nested-layout-tables',
        Rationale:
            'Triple-nested tables with inline styles are how HTML email does layout. An ' +
            'editor that reflows or reparents them destroys the message.',
        Profile: 'email',
        Html:
            '<table width="100%" cellpadding="0" cellspacing="0"><tbody><tr><td style="padding:10px">' +
            '<table width="600"><tbody><tr><td style="background:#f5f5f5">' +
            '<table><tbody><tr><td style="font-size:12px">Deeply nested cell</td></tr></tbody></table>' +
            '</td></tr></tbody></table>' +
            '</td></tr></tbody></table>',
    },
    {
        Name: 'consecutive-blank-lines',
        Rationale:
            'The blank-line guarantee. Each empty block must keep its filler <br> or the ' +
            'line collapses to zero height in every mail client.',
        Profile: 'email',
        Html: '<div>One</div><div><br></div><div><br></div><div><br></div><div>Two</div>',
    },
    {
        Name: 'style-block-in-quoted-region',
        Rationale:
            'A <style> block inside quoted mail. DOMPurify drops these unless the parse is ' +
            'forced into body context, which is why the email profile sets FORCE_BODY.',
        Profile: 'email',
        Html: '<div>Reply</div><style>.quoted { color: #666; }</style><div class="quoted">Quoted</div>',
    },
    {
        Name: 'gmail-quote',
        Rationale:
            'Gmail composer output: <div><br></div> soup wrapped in a gmail_quote blockquote. ' +
            'The most common real-world reply shape.',
        Profile: 'email',
        Html:
            '<div dir="ltr">My answer.</div><div><br></div>' +
            '<blockquote class="gmail_quote" style="margin:0 0 0 .8ex;border-left:1px solid #ccc;padding-left:1ex">' +
            '<div dir="ltr"><div>Line one</div><div><br></div><div>Line two</div></div>' +
            '</blockquote>',
    },
    {
        Name: 'ai-drafted-reply',
        Rationale: 'The primary authoring shape: plain semantic blocks with light inline formatting.',
        Profile: 'strict',
        Html:
            '<div>Hi Dana,</div><div><br></div>' +
            '<div>Thanks for flagging this. We&#39;ve <b>shipped the fix</b> and it is live now.</div>' +
            '<div><br></div><div>Best,</div><div>Sam</div>',
    },
    {
        Name: 'deep-list-nesting',
        Rationale:
            'Valid nested lists (<ul> inside <li>). Round-tripping these unchanged is the ' +
            'precondition for the list commands not corrupting them later.',
        Profile: 'strict',
        Html:
            '<ul><li>One<ul><li>One A<ul><li>One A i</li></ul></li><li>One B</li></ul></li>' +
            '<li>Two</li></ul><ol start="3"><li>Three</li></ol>',
    },
    {
        Name: 'preformatted-block',
        Rationale: 'Whitespace inside <pre> is content. The whitespace pruner must never reach it.',
        Profile: 'strict',
        Html: '<pre>function f() {\n    return 1;\n}</pre><div>After</div>',
    },
    {
        Name: 'inline-image-cid',
        Rationale:
            'cid: is the inline-image scheme quoted mail relies on. Verified present in ' +
            "DOMPurify's default ALLOWED_URI_REGEXP, so no URI relaxation is needed.",
        Profile: 'email',
        Html: '<div>See below.</div><div><img src="cid:image001.png@01D9" width="200" alt="chart"></div>',
    },
    {
        Name: 'mixed-semantic-tags',
        Rationale:
            'Loaded <strong>/<em> must NOT be rewritten to <b>/<i>. Rewriting on load is ' +
            'the fidelity violation this editor refuses to make.',
        Profile: 'strict',
        Html: '<div><strong>Bold</strong> and <em>italic</em> and <b>also bold</b>.</div>',
    },
];
