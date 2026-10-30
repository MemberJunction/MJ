/**
 * @fileoverview The pure rules behind Explorer's `office/connect` page.
 *
 * Kept out of the component so they can be tested on their own. The page is reached from the Excel
 * add-in's sign-in window with the pane's one-time public key (`pk`) and state; the page never
 * navigates anywhere taken from its own URL — the only place it returns to is the add-in page the
 * MemberJunction host itself reports.
 */
import { DecodeBase64Url, IsHandoffToken } from '@memberjunction/excel-addin';

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

/** How the connect page leaves: with the sealed key, or cancelled. */
export type OfficeHandoffOutcome = { Sealed: string } | 'cancelled';

/**
 * Reads the request from the page's query parameters. Returns null when either value is missing or
 * malformed, including a `pk` that isn't an RSA public key, so a bad link is refused before a key
 * is ever created.
 */
export function ReadOfficeConnectRequest(params: Record<string, unknown>): OfficeConnectRequest | null {
    const publicKey = typeof params['pk'] === 'string' ? params['pk'] : null;
    const state = typeof params['state'] === 'string' ? params['state'] : null;
    if (!IsHandoffToken(publicKey) || !IsHandoffToken(state) || !isRsaPublicKey(publicKey)) {
        return null;
    }
    return { PublicKey: publicKey, State: state };
}

/**
 * The add-in page to return to, carrying the outcome in the URL fragment (never sent to a server).
 * Returns null when the host's own URL isn't an absolute http(s) URL.
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

/** The connect page's route path, without a leading slash. */
export const OFFICE_CONNECT_ROUTE_PATH = 'office/connect';

/**
 * Options for `MJAuthBase.login()` that ask the provider to come back to `target` (this page's own
 * path and query) after sign-in. Providers read different keys: Auth0 navigates to
 * `appState.target`, Okta to `targetUrl`. A provider that reads neither returns to its configured
 * redirect URI. Refuses anything but a same-origin path, so the page can only send itself.
 */
export function BuildOfficeSignInOptions(target: string): Record<string, unknown> {
    const path = target.startsWith('/') && !target.startsWith('//') ? target : `/${OFFICE_CONNECT_ROUTE_PATH}`;
    return { appState: { target: path }, targetUrl: path };
}

/** The name to show for the signed-in user: first and last name, else the user name, else the email. */
export function DisplayNameForUser(user: OfficeConnectUser | null | undefined): string {
    if (!user) {
        return '';
    }
    const full = [user.FirstName, user.LastName].filter(p => typeof p === 'string' && p.trim().length > 0).join(' ').trim();
    return full || user.Name?.trim() || user.Email?.trim() || '';
}

function isRsaPublicKey(publicKeyText: string): boolean {
    try {
        const jwk = JSON.parse(new TextDecoder().decode(DecodeBase64Url(publicKeyText))) as Record<string, unknown>;
        return jwk['kty'] === 'RSA' && typeof jwk['n'] === 'string' && typeof jwk['e'] === 'string' && !('d' in jwk);
    } catch {
        return false;
    }
}
