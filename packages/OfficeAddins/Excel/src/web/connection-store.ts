/**
 * Where the pane keeps its connections: the scoped API keys Explorer issued, keyed by each MJ server's
 * normalized `AddinUrl` so switching between MemberJunction environments preserves each connection.
 *
 * `localStorage` is deliberate. This is a device-bound credential store, the sanctioned exception to MJ's
 * "preferences go through UserInfoEngine" rule (.claude/rules/data-access.md): the pane holds no MJ
 * session to save a preference with, and the keys must stay on this device.
 */
import type { ExcelConnectionPayload } from '../handoff';
import { NormalizeAddinUrl, SameAddinUrl } from './pane-config';

const LEGACY_STORAGE_KEY = 'mj.excelAddin.connection.v1';
const MULTI_STORAGE_KEY = 'mj.excelAddin.connections.v2';

export interface StoredConnection {
    APIKey: string;
    GraphQLUrl: string;
    UserName: string;
    UserEmail: string;
    ExpiresAt: string | null;
    /** The add-in base URL the key was issued for. */
    AddinUrl: string;
}

type StoredConnectionMap = Record<string, Partial<StoredConnection>>;

/** The saved connection for `addinUrl`, or null when there is none or it expired. */
export function LoadConnection(addinUrl: string, now: Date = new Date()): StoredConnection | null {
    const key = NormalizeAddinUrl(addinUrl);
    if (!key) {
        return null;
    }
    const all = readAllConnections();
    const candidate = all[key];
    if (!candidate) {
        return null;
    }
    if (!candidate.APIKey || !candidate.GraphQLUrl || !candidate.AddinUrl || !SameAddinUrl(candidate.AddinUrl, addinUrl)) {
        ForgetConnection(addinUrl);
        return null;
    }
    if (candidate.ExpiresAt && Date.parse(candidate.ExpiresAt) <= now.getTime()) {
        ForgetConnection(addinUrl);
        return null;
    }
    return {
        APIKey: candidate.APIKey,
        GraphQLUrl: candidate.GraphQLUrl,
        UserName: candidate.UserName ?? '',
        UserEmail: candidate.UserEmail ?? '',
        ExpiresAt: candidate.ExpiresAt ?? null,
        AddinUrl: candidate.AddinUrl,
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
    const key = NormalizeAddinUrl(addinUrl);
    const all = readAllConnections();
    all[key] = connection;
    writeAllConnections(all);
    return connection;
}

/** Forgets the connection for `addinUrl` (or all stored connections when omitted). */
export function ForgetConnection(addinUrl?: string): void {
    try {
        if (!addinUrl) {
            window.localStorage.removeItem(MULTI_STORAGE_KEY);
            window.localStorage.removeItem(LEGACY_STORAGE_KEY);
            return;
        }
        const key = NormalizeAddinUrl(addinUrl);
        const all = readAllConnections();
        delete all[key];
        writeAllConnections(all);
        window.localStorage.removeItem(LEGACY_STORAGE_KEY);
    } catch {
        // Nothing stored, or storage blocked: either way there is nothing left to forget.
    }
}

function readAllConnections(): StoredConnectionMap {
    const map: StoredConnectionMap = {};
    try {
        const legacyRaw = window.localStorage.getItem(LEGACY_STORAGE_KEY);
        if (legacyRaw) {
            const legacy = JSON.parse(legacyRaw) as Partial<StoredConnection>;
            if (legacy && typeof legacy.AddinUrl === 'string' && legacy.AddinUrl.trim().length > 0) {
                map[NormalizeAddinUrl(legacy.AddinUrl)] = legacy;
            }
        }
    } catch {
        // Ignore damaged legacy entry.
    }
    try {
        const multiRaw = window.localStorage.getItem(MULTI_STORAGE_KEY);
        if (multiRaw) {
            const parsed = JSON.parse(multiRaw) as StoredConnectionMap;
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                for (const [k, v] of Object.entries(parsed)) {
                    if (v && typeof v === 'object') {
                        map[NormalizeAddinUrl(k)] = v;
                    }
                }
            }
        }
    } catch {
        // Ignore damaged multi-server map.
    }
    return map;
}

function writeAllConnections(all: StoredConnectionMap): void {
    try {
        if (Object.keys(all).length === 0) {
            window.localStorage.removeItem(MULTI_STORAGE_KEY);
        } else {
            window.localStorage.setItem(MULTI_STORAGE_KEY, JSON.stringify(all));
        }
        window.localStorage.removeItem(LEGACY_STORAGE_KEY);
    } catch {
        // Storage can be blocked (private windows, strict policies). The connection still works for
        // this pane session; the person signs in again next time.
    }
}
