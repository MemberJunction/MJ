/**
 * Shared in-page storage capture/restore helpers for the warm-seed feature
 *. These run in the BROWSER context — Playwright serializes them via
 * `page.evaluate` / `page.addInitScript` — so they are fully self-contained and
 * reference only browser globals (never module scope).
 *
 * Extracted here so BOTH browser adapters delegate
 * to the SAME implementation: `PlaywrightBrowserAdapter` (interactive/CDP path)
 * and `SharedContextBrowserAdapter` (the adapter the regression suite runs on).
 * Previously these lived inline in PBA and SCBA inherited the base no-op, so the
 * warm seed silently did nothing in suite mode — the exact drift class the
 * adapter-parity gate exists to catch.
 */

/** Serializable storage snapshot returned by {@link captureStorageInPage}. */
export interface StorageSnapshot {
    localStorage: { name: string; value: string }[];
    databases: {
        Name: string;
        Version: number;
        Stores: { Name: string; KeyPath: string | string[] | null; AutoIncrement: boolean; Records: { Key?: unknown; Value: unknown }[] }[];
    }[];
}

/**
 * In-page (BROWSER context): read localStorage + all IndexedDB databases into a
 * serializable snapshot. Read-only — never mutates page storage. Fully
 * self-contained; references only browser globals. Closes over each IDBRequest
 * (rather than reading `event.target`) so the DOM types stay precise.
 */
export function captureStorageInPage(): Promise<StorageSnapshot> {
    const snap: StorageSnapshot = { localStorage: [], databases: [] };
    try {
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k != null) {
                snap.localStorage.push({ name: k, value: localStorage.getItem(k) ?? '' });
            }
        }
    } catch { /* localStorage may be blocked — skip */ }

    const readDatabase = (name: string): Promise<StorageSnapshot['databases'][number] | null> =>
        new Promise((resolve) => {
            const open = indexedDB.open(name);
            open.onerror = () => resolve(null);
            open.onsuccess = () => {
                const db = open.result;
                const storeNames = Array.from(db.objectStoreNames);
                if (storeNames.length === 0) {
                    const empty = { Name: db.name, Version: db.version, Stores: [] };
                    db.close();
                    resolve(empty);
                    return;
                }
                const stores: StorageSnapshot['databases'][number]['Stores'] = [];
                const tx = db.transaction(storeNames, 'readonly');
                let remaining = storeNames.length;
                const finish = () => { if (--remaining === 0) { db.close(); resolve({ Name: db.name, Version: db.version, Stores: stores }); } };
                for (const sn of storeNames) {
                    const os = tx.objectStore(sn);
                    const store = { Name: sn, KeyPath: os.keyPath as string | string[] | null, AutoIncrement: os.autoIncrement, Records: [] as { Key?: unknown; Value: unknown }[] };
                    const outOfLine = os.keyPath == null;
                    const cursorReq = os.openCursor();
                    cursorReq.onerror = () => { stores.push(store); finish(); };
                    cursorReq.onsuccess = () => {
                        const cursor = cursorReq.result;
                        if (cursor) {
                            store.Records.push(outOfLine ? { Key: cursor.key, Value: cursor.value } : { Value: cursor.value });
                            cursor.continue();
                        } else {
                            stores.push(store);
                            finish();
                        }
                    };
                }
            };
        });

    return (async () => {
        try {
            const metas = indexedDB.databases ? await indexedDB.databases() : [];
            for (const meta of metas) {
                if (!meta.name) continue;
                const dbSnap = await readDatabase(meta.name);
                if (dbSnap) snap.databases.push(dbSnap);
            }
        } catch { /* IndexedDB unavailable / blocked — return what we have */ }
        return snap;
    })();
}

/**
 * In-page (BROWSER context): restore a {@link StorageSnapshot} into fresh
 * storage BEFORE app scripts run. Cold-boot-safe by contract — any
 * per-database failure DELETES that database so the app cold-boots it clean,
 * never a half-populated (corrupt) cache. Fully self-contained.
 */
export function restoreStorageInPage(snap: StorageSnapshot): void {
    for (const { name, value } of snap.localStorage) {
        try { localStorage.setItem(name, value); } catch { /* skip */ }
    }
    for (const dbSnap of snap.databases) {
        try {
            const open = indexedDB.open(dbSnap.Name, dbSnap.Version);
            const abort = () => { try { indexedDB.deleteDatabase(dbSnap.Name); } catch { /* ignore */ } };
            open.onupgradeneeded = () => {
                const db = open.result;
                for (const store of dbSnap.Stores) {
                    if (!db.objectStoreNames.contains(store.Name)) {
                        db.createObjectStore(store.Name, { keyPath: store.KeyPath ?? undefined, autoIncrement: store.AutoIncrement });
                    }
                }
            };
            open.onerror = abort;
            open.onsuccess = () => {
                const db = open.result;
                const names = dbSnap.Stores.map(s => s.Name).filter(n => db.objectStoreNames.contains(n));
                if (names.length === 0) { db.close(); return; }
                try {
                    const tx = db.transaction(names, 'readwrite');
                    for (const store of dbSnap.Stores) {
                        if (!db.objectStoreNames.contains(store.Name)) continue;
                        const os = tx.objectStore(store.Name);
                        for (const rec of store.Records) {
                            try { if ('Key' in rec) os.put(rec.Value, rec.Key as IDBValidKey); else os.put(rec.Value); } catch { /* skip record */ }
                        }
                    }
                    tx.oncomplete = () => db.close();
                    tx.onerror = () => { db.close(); abort(); };
                } catch { db.close(); abort(); }
            };
        } catch { /* skip database */ }
    }
}
