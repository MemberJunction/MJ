/**
 * @fileoverview Pure, framework-free helpers for a MemberJunction host app's `/office/connect` sign-in page.
 *
 * Kept in `@memberjunction/excel-addin` so any frontend host (MJ Explorer, a custom Angular app using
 * `@memberjunction/ng-export-service`'s `<mj-office-connect-panel>`, or a custom portal) shares the exact
 * RSA public-key request validation, post-login return options, and fragment-based handoff URL builder.
 *
 * The connect page is reached from the Excel add-in's sign-in window with the pane's one-time public key
 * (`pk`) and `state`; it never navigates anywhere taken from its own URL — the only place it returns to is
 * the `ConnectedPageUrl` reported by the MemberJunction server itself.
 */
import { DecodeBase64Url, IsHandoffToken } from './handoff';

/** Query-parameter map shape accepted by {@link ReadOfficeConnectRequest} (compatible with Angular `Params`). */
export type OfficeConnectQueryParams = Record<string, string | string[] | null | undefined>;

/** What the add-in's sign-in window sends the connect page. */
export interface OfficeConnectRequest {
    /** The pane's public key, base64url JSON Web Key text. */
    PublicKey: string;
    /** The pane's random state, echoed back so the pane accepts only this answer. */
    State: string;
}

/** The parts of a user the connect page shows. */
export interface OfficeConnectUser {
    Name?: string | null;
    FirstName?: string | null;
    LastName?: string | null;
    Email?: string | null;
}

/** Options object compatible with `MJAuthBase.login()` across Auth0 (`appState.target`) and Okta (`targetUrl`). */
export type OfficeSignInRedirectOptions = {
    appState: { target: string };
    targetUrl: string;
};

/** How the connect page leaves: with the sealed key, or cancelled. */
export type OfficeHandoffOutcome = { Sealed: string } | 'cancelled';

/** The connect page's standard route path, without a leading slash. */
export const OFFICE_CONNECT_ROUTE_PATH = 'office/connect';

/**
 * Reads the request from the page's query parameters. Returns `null` when either value is missing or
 * malformed, including a `pk` that isn't an RSA public key, so a bad link is refused before a key
 * is ever created.
 */
export function ReadOfficeConnectRequest(params: OfficeConnectQueryParams | null | undefined): OfficeConnectRequest | null {
    if (!params) {
        return null;
    }
    const publicKey = typeof params['pk'] === 'string' ? params['pk'] : null;
    const state = typeof params['state'] === 'string' ? params['state'] : null;
    if (!IsHandoffToken(publicKey) || !IsHandoffToken(state) || !isRsaPublicKey(publicKey)) {
        return null;
    }
    return { PublicKey: publicKey, State: state };
}

/**
 * The add-in page to return to, carrying the outcome in the URL fragment (never sent to a server).
 * Returns `null` when the host's own URL isn't an absolute `http(s)` URL.
 */
export function BuildOfficeHandoffUrl(connectedPageUrl: string, outcome: OfficeHandoffOutcome): string | null {
    let url: URL;
    try {
        url = new URL(connectedPageUrl);
    } catch {
        return null;
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
        return null;
    }
    url.hash = outcome === 'cancelled' ? 'cancelled=1' : `h=${outcome.Sealed}`;
    return url.toString();
}

/**
 * Options for `MJAuthBase.login()` (or a custom OIDC login) asking the provider to return to `target`
 * (this page's own path and query) after sign-in. Refuses anything except a same-origin relative path.
 */
export function BuildOfficeSignInOptions(target: string): OfficeSignInRedirectOptions {
    const path = target.startsWith('/') && !target.startsWith('//') ? target : `/${OFFICE_CONNECT_ROUTE_PATH}`;
    return { appState: { target: path }, targetUrl: path };
}

/** The name to show for the signed-in user: first and last name, else the user name, else the email. */
export function DisplayNameForUser(user: OfficeConnectUser | null | undefined): string {
    if (!user) {
        return '';
    }
    const full = [user.FirstName, user.LastName]
        .filter((p): p is string => typeof p === 'string' && p.trim().length > 0)
        .join(' ')
        .trim();
    return full || user.Name?.trim() || user.Email?.trim() || '';
}

interface ParsedJwkCandidate {
    kty?: string;
    n?: string;
    e?: string;
    d?: string;
}

function isRsaPublicKey(publicKeyText: string): boolean {
    try {
        const jwk = JSON.parse(new TextDecoder().decode(DecodeBase64Url(publicKeyText))) as ParsedJwkCandidate;
        return jwk.kty === 'RSA' && typeof jwk.n === 'string' && typeof jwk.e === 'string' && !('d' in jwk);
    } catch {
        return false;
    }
}
