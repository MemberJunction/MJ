/**
 * @fileoverview Pure builders for the two pieces of content identity verification puts in front of a
 * person: the verification EMAIL and the self-contained HTML PAGES the verify link lands on. No DB, no
 * network, no MJ runtime — deterministic strings in, strings out.
 *
 * ## What the pages never contain
 *
 * Nothing about the session: no agent name, no conversation, no email address, no name, no hint that a
 * session with this id exists. The page for an unknown token, an expired token and a used token is the
 * **same page**, so the link cannot be used to probe which sessions exist or what state they are in.
 *
 * ## Why GET does not redeem
 *
 * Mail security scanners, link previewers and browser prefetchers issue GET requests for every URL in a
 * message. A GET that consumed the single-use token would let a scanner burn it before the human clicks
 * — the person would then see "already used". So the link opens a page with one button ({@link
 * BuildVerifyConfirmHtml}) and only the human's POST redeems. The magic-link redeem endpoint made the
 * same choice for the same reason.
 *
 * @module @memberjunction/server/realtimeSessions
 */

import { EscapeHtml } from '../auth/magicLink/redeemLanding.js';

/** Inputs to {@link BuildVerificationEmail}. */
export interface VerificationEmailInput {
    /** The person's sanitised name. */
    Name: string;
    /** The typed code (fallback for opening the email on another device). */
    Code: string;
    /** The full link that opens the confirmation page. */
    LinkUrl: string;
    /** Minutes the link and code stay valid. */
    TtlMinutes: number;
}

/** A ready-to-send email. */
export interface VerificationEmail {
    Subject: string;
    Text: string;
    Html: string;
}

/**
 * Builds the verification email.
 *
 * The subject never carries the name or the code (subjects surface on lock screens and in notification
 * previews). The name is HTML-escaped in the HTML body and reduced to a single line in the text body.
 */
export function BuildVerificationEmail(input: VerificationEmailInput): VerificationEmail {
    const name = input.Name.replace(/\s+/g, ' ').trim();
    const greeting = name ? `Hi ${name},` : 'Hi,';
    const ttl = `${input.TtlMinutes} minute${input.TtlMinutes === 1 ? '' : 's'}`;
    const text =
        `${greeting}\n\n` +
        `Confirm your email address to continue your conversation. Open this link:\n\n${input.LinkUrl}\n\n` +
        `Or, if you opened this email on a different device, type this code into your conversation:\n\n${input.Code}\n\n` +
        `The link and the code work once and expire in ${ttl}.\n\n` +
        `If you did not ask for this, you can ignore this email — nothing happens unless the link is opened or the code is entered.`;
    const html =
        `<p>${EscapeHtml(greeting)}</p>` +
        `<p>Confirm your email address to continue your conversation.</p>` +
        `<p><a href="${EscapeHtml(input.LinkUrl)}">Confirm my email address</a></p>` +
        `<p>Or, if you opened this email on a different device, type this code into your conversation:</p>` +
        `<p style="font-size:1.5em;letter-spacing:.15em"><strong>${EscapeHtml(input.Code)}</strong></p>` +
        `<p>The link and the code work once and expire in ${EscapeHtml(ttl)}.</p>` +
        `<p>If you did not ask for this, you can ignore this email — nothing happens unless the link is opened or the code is entered.</p>`;
    return { Subject: 'Confirm your email address', Text: text, Html: html };
}

/** Shared document shell for the verify pages. Hardcoded colours are intentional: standalone server-rendered HTML, not Angular CSS. */
function page(title: string, bodyInner: string): string {
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<meta name="referrer" content="no-referrer">
<title>${EscapeHtml(title)}</title>
<style>
  body { font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; background:#f5f5f5; margin:0; display:flex; min-height:100vh; align-items:center; justify-content:center; }
  .card { background:#fff; padding:2.5rem; border-radius:12px; box-shadow:0 1px 4px rgba(0,0,0,.12); max-width:24rem; text-align:center; margin:1rem; }
  h1 { font-size:1.25rem; margin:0 0 .5rem; color:#1f2937; }
  p { color:#4b5563; margin:0 0 1.5rem; font-size:.95rem; }
  p:last-child { margin-bottom:0; }
  button { background:#264FAF; color:#fff; border:0; border-radius:8px; padding:.75rem 1.5rem; font-size:1rem; cursor:pointer; width:100%; }
  button:hover { background:#1e3f8c; }
</style>
</head>
<body>
  <div class="card">
${bodyInner}
  </div>
</body>
</html>`;
}

/**
 * The page a verify link opens. Side-effect free: it renders a single confirmation button whose POST
 * performs the redemption (see the module header for why GET must not).
 *
 * @param token - the raw token, embedded in a hidden form field (never in the POST URL)
 * @param actionPath - the same-origin path the form POSTs to
 */
export function BuildVerifyConfirmHtml(token: string, actionPath: string): string {
    return page(
        'Confirm your email',
        `    <h1>Confirm your email address</h1>
    <p>Press the button to confirm. Then return to your conversation.</p>
    <form method="POST" action="${EscapeHtml(actionPath)}">
      <input type="hidden" name="token" value="${EscapeHtml(token)}">
      <button type="submit">Confirm my email address</button>
    </form>`,
    );
}

/** The page shown after a successful redemption. Says nothing about the session. */
export function BuildVerifySuccessHtml(): string {
    return page(
        "You're verified",
        `    <h1>You're verified</h1>
    <p>Return to your conversation — it will carry on from where you left off. You can close this tab.</p>`,
    );
}

/**
 * The page shown for EVERY failed redemption — unknown, malformed, expired, used, or voided token alike —
 * so the response cannot be used to learn anything about a session.
 */
export function BuildVerifyFailureHtml(): string {
    return page(
        'Link not valid',
        `    <h1>This link is no longer valid</h1>
    <p>It may have expired or already been used. Return to your conversation to request a new one.</p>`,
    );
}

/**
 * The page shown when the server hit a fault while recording a verification (the link was valid but
 * nothing was saved, so trying the link again is correct). Only a holder of a valid token can reach it.
 */
export function BuildVerifyErrorHtml(): string {
    return page(
        'Something went wrong',
        `    <h1>We could not complete this just now</h1>
    <p>Please open the link from your email again in a moment.</p>`,
    );
}
