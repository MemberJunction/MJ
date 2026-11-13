/**
 * Where the pane keeps its connections: the scoped API keys Explorer issued, keyed by each MJ server's
 * normalized `AddinUrl` so switching between MemberJunction environments preserves each connection.
 *
 * `localStorage` and `OfficeRuntime.storage` are deliberate. This is a device-bound credential store,
 * the sanctioned exception to MJ's "preferences go through UserInfoEngine" rule (.claude/rules/data-access.md):
 * the pane holds no MJ session to save a preference with, and the keys must stay on this device.
 */
import type { ExcelConnectionPayload } from '../handoff';
import { NormalizeAddinUrl, SameAddinUrl } from './pane-config';

const LEGACY_STORAGE_KEY = 'mj.excelAddin.connection.v1';
const MULTI_STORAGE_KEY = 'mj.excelAddin.connections.v2';

interface OfficeRuntimeStorageLike {
    getItem(key: string): Promise<string | null>;
    setItem(key: string, value: string): Promise<void>;
    removeItem(key: string): Promise<void>;
}

const memoryStorageMirror = new Map<string, string>();
const connectionChangeListeners = new Set<() => void>();

function getLocalStorageSafe(): Storage | null {
    try {
        const g = globalThis as { localStorage?: Storage; window?: { localStorage?: Storage } };
        return g.localStorage ?? g.window?.localStorage ?? null;
    } catch {
        return null;
    }
}

function getOfficeRuntimeStorageSafe(): OfficeRuntimeStorageLike | null {
    try {
        const g = globalThis as { OfficeRuntime?: { storage?: OfficeRuntimeStorageLike } };
        return g.OfficeRuntime?.storage ?? null;
    } catch {
        return null;
    }
}

function getStorageItem(key: string): string | null {
    const ls = getLocalStorageSafe();
    if (ls) {
        try {
            const val = ls.getItem(key);
            if (val !== null) {
                memoryStorageMirror.set(key, val);
                return val;
            }
        } catch {
            // Fall through to memory mirror
        }
    }
    return memoryStorageMirror.get(key) ?? null;
}

function setStorageItem(key: string, value: string): void {
    memoryStorageMirror.set(key, value);
    const ls = getLocalStorageSafe();
    if (ls) {
        try {
            ls.setItem(key, value);
        } catch {
            // Ignore blocked localStorage
        }
    }
    const officeStorage = getOfficeRuntimeStorageSafe();
    if (officeStorage) {
        void officeStorage.setItem(key, value).catch(() => undefined);
    }
}

function removeStorageItem(key: string): void {
    memoryStorageMirror.delete(key);
    const ls = getLocalStorageSafe();
    if (ls) {
        try {
            ls.removeItem(key);
        } catch {
            // Ignore blocked localStorage
        }
    }
    const officeStorage = getOfficeRuntimeStorageSafe();
    if (officeStorage) {
        void officeStorage.removeItem(key).catch(() => undefined);
    }
}

/** Hydrates the in-memory connection mirror from `OfficeRuntime.storage` when running in an isolated CustomFunctions worker. */
export async function HydrateConnectionsFromOfficeStorage(): Promise<void> {
    const officeStorage = getOfficeRuntimeStorageSafe();
    if (!officeStorage) return;
    try {
        const [legacyRaw, multiRaw] = await Promise.all([
            officeStorage.getItem(LEGACY_STORAGE_KEY).catch(() => null),
            officeStorage.getItem(MULTI_STORAGE_KEY).catch(() => null),
        ]);
        if (legacyRaw) memoryStorageMirror.set(LEGACY_STORAGE_KEY, legacyRaw);
        if (multiRaw) memoryStorageMirror.set(MULTI_STORAGE_KEY, multiRaw);
    } catch {
        // Ignore OfficeRuntime storage errors
    }
}

/** Registers a listener invoked whenever connections are saved or forgotten (used to clear the custom function cache). */
export function OnConnectionChanged(listener: () => void): () => void {
    connectionChangeListeners.add(listener);
    return () => {
        connectionChangeListeners.delete(listener);
    };
}

function notifyConnectionChanged(): void {
    for (const listener of connectionChangeListeners) {
        try {
            listener();
        } catch {
            // Never fail connection storage on listener error
        }
    }
}

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

/** Returns the first valid, non-expired stored connection when the host URL has not yet been resolved. */
export function FindFirstStoredConnection(now: Date = new Date()): StoredConnection | null {
    const all = readAllConnections();
    for (const candidate of Object.values(all)) {
        if (candidate && typeof candidate.AddinUrl === 'string' && candidate.AddinUrl.trim().length > 0) {
            const loaded = LoadConnection(candidate.AddinUrl, now);
            if (loaded) {
                return loaded;
            }
        }
    }
    return null;
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
    notifyConnectionChanged();
    return connection;
}

/** Forgets the connection for `addinUrl` (or all stored connections when omitted). */
export function ForgetConnection(addinUrl?: string): void {
    try {
        if (!addinUrl) {
            removeStorageItem(MULTI_STORAGE_KEY);
            removeStorageItem(LEGACY_STORAGE_KEY);
            notifyConnectionChanged();
            return;
        }
        const key = NormalizeAddinUrl(addinUrl);
        const all = readAllConnections();
        delete all[key];
        writeAllConnections(all);
        removeStorageItem(LEGACY_STORAGE_KEY);
        notifyConnectionChanged();
    } catch {
        // Nothing stored, or storage blocked: either way there is nothing left to forget.
    }
}

function readAllConnections(): StoredConnectionMap {
    const map: StoredConnectionMap = {};
    try {
        const legacyRaw = getStorageItem(LEGACY_STORAGE_KEY);
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
        const multiRaw = getStorageItem(MULTI_STORAGE_KEY);
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
            removeStorageItem(MULTI_STORAGE_KEY);
        } else {
            setStorageItem(MULTI_STORAGE_KEY, JSON.stringify(all));
        }
        removeStorageItem(LEGACY_STORAGE_KEY);
    } catch {
        // Storage can be blocked (private windows, strict policies). The connection still works for
        // this pane session; the person signs in again next time.
    }
}
