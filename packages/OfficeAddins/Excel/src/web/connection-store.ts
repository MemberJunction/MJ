/**
 * Where the pane keeps its connection: the scoped API key Explorer issued, and where to use it.
 *
 * `localStorage` is deliberate. This is a credential, the sanctioned exception to MJ's
 * "preferences go through UserInfoEngine" rule (.claude/rules/data-access.md): the pane holds no MJ
 * session to save a preference with, and the key must stay on this device. The storage belongs to
 * the add-in's own origin, which only this host's pane loads from.
 */
import type { ExcelConnectionPayload } from '../handoff';

const STORAGE_KEY = 'mj.excelAddin.connection.v1';

export interface StoredConnection {
    APIKey: string;
    GraphQLUrl: string;
    UserName: string;
    UserEmail: string;
    ExpiresAt: string | null;
    /** The add-in base URL the key was issued for. */
    AddinUrl: string;
}

/** The saved connection, or null when there is none, it expired, or it was for another host. */
export function LoadConnection(addinUrl: string, now: Date = new Date()): StoredConnection | null {
    const raw = readStorage();
    if (!raw) {
        return null;
    }
    let parsed: Partial<StoredConnection>;
    try {
        parsed = JSON.parse(raw) as Partial<StoredConnection>;
    } catch {
        ForgetConnection();
        return null;
    }
    if (!parsed.APIKey || !parsed.GraphQLUrl || parsed.AddinUrl !== addinUrl) {
        return null;
    }
    if (parsed.ExpiresAt && Date.parse(parsed.ExpiresAt) <= now.getTime()) {
        ForgetConnection();
        return null;
    }
    return {
        APIKey: parsed.APIKey,
        GraphQLUrl: parsed.GraphQLUrl,
        UserName: parsed.UserName ?? '',
        UserEmail: parsed.UserEmail ?? '',
        ExpiresAt: parsed.ExpiresAt ?? null,
        AddinUrl: parsed.AddinUrl,
    };
}

export function SaveConnection(payload: ExcelConnectionPayload, addinUrl: string): StoredConnection {
    const connection: StoredConnection = {
        APIKey: payload.APIKey,
        GraphQLUrl: payload.GraphQLUrl,
        UserName: payload.UserName,
        UserEmail: payload.UserEmail,
        ExpiresAt: payload.ExpiresAt,
        AddinUrl: addinUrl,
    };
    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(connection));
    } catch {
        // Storage can be blocked (private windows, strict policies). The connection still works for
        // this pane session; the person signs in again next time.
    }
    return connection;
}

export function ForgetConnection(): void {
    try {
        window.localStorage.removeItem(STORAGE_KEY);
    } catch {
        // Nothing stored, or storage blocked: either way there is nothing left to forget.
    }
}

function readStorage(): string | null {
    try {
        return window.localStorage.getItem(STORAGE_KEY);
    } catch {
        return null;
    }
}
