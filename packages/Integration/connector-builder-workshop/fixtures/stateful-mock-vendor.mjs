/**
 * A STATEFUL credential-free mock vendor — the highest-leverage gap in credential-free testing.
 *
 * Why this exists (the category cassette-replay.mjs cannot reach):
 *   `cassette-replay.mjs` matches a request to a pre-recorded response. Each match is independent — a
 *   POST that "creates" a record changes NOTHING, so the next GET returns the same canned page. That makes
 *   the entire WRITE family unprovable without a live credential: a connector's Create/Update/Delete +
 *   bidirectional conflict + idempotent-replay can only be asserted against a vendor that actually HOLDS
 *   STATE — where a create reflects in the next read, an update mutates the row, a delete removes it.
 *
 *   This module is that vendor: an in-memory, mutable record store + a thin HTTP wrapper. It lets the
 *   credential-free tiers prove the full round-trip:
 *     create → read-back shows it · update → read-back shows the change · delete → read-back 404s ·
 *     replay the same create (same idempotency key) → no duplicate · incremental `since` → only changed rows.
 *
 * Split of concerns (so the logic is unit-testable with zero sockets):
 *   - `VendorStore` is PURE STATE: a Map<object, Map<id, record>>. All the interesting behavior
 *     (identity assignment, watermark bump, pagination window, idempotency dedup, soft-delete + tombstone
 *     for delta-delete detection) lives here and is driven directly by the unit test.
 *   - `createStatefulVendorServer` is a thin `node:http` adapter that maps REST verbs onto the store and
 *     adds the two transport-only behaviors a store can't model: a once-only 429 (rate-limit cell) and
 *     undeclared "custom" fields on emitted rows (custom-column-capture cell).
 *
 * Determinism: the store takes an injectable monotonic `clock()` (default: a counter, NOT Date.now) so a
 * test sees stable, ordered `modifiedDate` watermarks. The Workflow-script Date ban does not apply here —
 * this is a plain node module — but a counter clock keeps tests reproducible regardless.
 */

import { createServer } from 'node:http';

/** Default ISO watermark from a monotonic tick — stable + ordered, no wall-clock dependence. */
function tickToIso(tick) {
    // Base epoch 2026-01-01T00:00:00Z + tick seconds. Strictly increasing, human-readable, deterministic.
    const base = Date.parse('2026-01-01T00:00:00Z');
    return new Date(base + tick * 1000).toISOString();
}

/**
 * The pure, mutable vendor record store. No I/O. This is what the write/bidirectional/delete/idempotency
 * cells drive directly.
 */
export class VendorStore {
    /**
     * @param {{ clock?: () => number, pkField?: string, watermarkField?: string, customFields?: (obj: string, rec: Record<string, unknown>) => Record<string, unknown> }} [opts]
     */
    constructor(opts = {}) {
        /** @type {Map<string, Map<string, Record<string, unknown>>>} live records per object */
        this.objects = new Map();
        /** @type {Map<string, Map<string, string>>} tombstones (id → deletedAt watermark) per object, for delta-delete */
        this.tombstones = new Map();
        /** @type {Map<string, string>} idempotency-key → assigned id, for replay dedup */
        this.idempotency = new Map();
        this.pkField = opts.pkField ?? 'id';
        this.watermarkField = opts.watermarkField ?? 'modifiedDate';
        this.customFields = opts.customFields ?? null;
        this._tick = 0;
        this._clock = opts.clock ?? (() => ++this._tick);
        this._autoId = 0;
    }

    _bucket(object) {
        if (!this.objects.has(object)) this.objects.set(object, new Map());
        return this.objects.get(object);
    }
    _tombBucket(object) {
        if (!this.tombstones.has(object)) this.tombstones.set(object, new Map());
        return this.tombstones.get(object);
    }
    _stampWatermark(rec) {
        return { ...rec, [this.watermarkField]: tickToIso(this._clock()) };
    }
    _decorate(object, rec) {
        // Attach undeclared "custom" fields so the custom-column-capture cell has something to capture.
        if (!this.customFields) return rec;
        const extra = this.customFields(object, rec) ?? {};
        return { ...rec, ...extra };
    }

    /** Pre-load records (test setup). Records keep/get a PK and a watermark. */
    seed(object, records) {
        const b = this._bucket(object);
        for (const r of records) {
            const id = String(r[this.pkField] ?? `${object}-${++this._autoId}`);
            b.set(id, this._stampWatermark({ ...r, [this.pkField]: id }));
        }
        return this.count(object);
    }

    count(object) {
        return this._bucket(object).size;
    }

    /**
     * List with pagination + optional incremental `since` watermark filter. Returns rows in watermark order
     * (stable), excluding deleted rows. `since` is exclusive (strictly-greater), matching real cursor semantics.
     * @returns {{ rows: Record<string, unknown>[], total: number, hasMore: boolean }}
     */
    list(object, { page = 1, pageSize = 50, since = null } = {}) {
        let rows = [...this._bucket(object).values()];
        if (since != null) rows = rows.filter((r) => String(r[this.watermarkField]) > String(since));
        rows.sort((a, b) => String(a[this.watermarkField]).localeCompare(String(b[this.watermarkField])));
        const total = rows.length;
        const start = (Math.max(1, page) - 1) * pageSize;
        const window = rows.slice(start, start + pageSize).map((r) => this._decorate(object, r));
        return { rows: window, total, hasMore: start + pageSize < total };
    }

    /** Tombstones changed since a watermark — lets a delta cell prove delete-detection. */
    deletedSince(object, since = null) {
        const out = [];
        for (const [id, at] of this._tombBucket(object).entries()) {
            if (since == null || String(at) > String(since)) out.push({ [this.pkField]: id, deletedAt: at });
        }
        return out;
    }

    get(object, id) {
        return this._bucket(object).get(String(id)) ?? null;
    }

    /**
     * Create. If `idempotencyKey` was seen before, returns the SAME existing record (no duplicate) — this is
     * what makes the idempotent-replay cell pass against a real, stateful surface.
     * @returns {{ record: Record<string, unknown>, created: boolean }}
     */
    create(object, record, { idempotencyKey = null } = {}) {
        if (idempotencyKey != null && this.idempotency.has(idempotencyKey)) {
            const existingId = this.idempotency.get(idempotencyKey);
            return { record: this.get(object, existingId), created: false };
        }
        const b = this._bucket(object);
        const id = String(record[this.pkField] ?? `${object}-${++this._autoId}`);
        const stored = this._stampWatermark({ ...record, [this.pkField]: id });
        b.set(id, stored);
        // A re-created id clears its tombstone (it's live again).
        this._tombBucket(object).delete(id);
        if (idempotencyKey != null) this.idempotency.set(idempotencyKey, id);
        return { record: stored, created: true };
    }

    /** Update (merge patch). Bumps the watermark. Returns null if the id doesn't exist. */
    update(object, id, patch) {
        const b = this._bucket(object);
        const cur = b.get(String(id));
        if (!cur) return null;
        const merged = this._stampWatermark({ ...cur, ...patch, [this.pkField]: String(id) });
        b.set(String(id), merged);
        return merged;
    }

    /** Delete. Records a tombstone (with watermark) so delta-delete is detectable. Returns true if removed. */
    del(object, id) {
        const b = this._bucket(object);
        if (!b.has(String(id))) return false;
        b.delete(String(id));
        this._tombBucket(object).set(String(id), tickToIso(this._clock()));
        return true;
    }
}

/**
 * Thin HTTP adapter over a VendorStore. Maps a conventional REST surface onto the store and adds the two
 * transport-only behaviors (once-only 429, undeclared custom fields are already added by the store's decorator).
 *
 * Routes (object = last non-id path segment, or `?objectType=`):
 *   GET    /<object>                 → list (page/pageSize/since query params)
 *   GET    /<object>/<id>            → get (404 if absent)
 *   POST   /<object>                 → create (Idempotency-Key header honored)
 *   PATCH  /<object>/<id>            → update (404 if absent)
 *   PUT    /<object>/<id>            → update
 *   DELETE /<object>/<id>            → del (404 if absent)
 *
 * @param {{ store: VendorStore, rateLimitOnceOn?: string[], pageParam?: string, sizeParam?: string, sinceParam?: string }} cfg
 * @returns {import('node:http').Server}
 */
export function createStatefulVendorServer(cfg) {
    const store = cfg.store;
    const rateLimitOnceOn = new Set(cfg.rateLimitOnceOn ?? []);
    const firedRateLimit = new Set();
    const pageParam = cfg.pageParam ?? 'page';
    const sizeParam = cfg.sizeParam ?? 'pageSize';
    const sinceParam = cfg.sinceParam ?? 'since';

    const readBody = (req) =>
        new Promise((resolve) => {
            let raw = '';
            req.on('data', (c) => (raw += c));
            req.on('end', () => {
                try {
                    resolve(raw ? JSON.parse(raw) : {});
                } catch {
                    resolve({});
                }
            });
        });

    return createServer(async (req, res) => {
        const url = new URL(req.url, 'http://localhost');
        const segs = url.pathname.split('/').filter(Boolean);
        const send = (code, obj) => {
            res.writeHead(code, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(obj));
        };

        // last segment is an id when the segment before it is the object and there are >= 2 segments
        const hasId = segs.length >= 2;
        const object = url.searchParams.get('objectType') ?? (hasId ? segs[segs.length - 2] : segs[segs.length - 1]) ?? 'unknown';
        const id = hasId ? segs[segs.length - 1] : null;

        // Transport-only: once-only 429 on the named objects (rate-limit cell).
        if (rateLimitOnceOn.has(object) && !firedRateLimit.has(object)) {
            firedRateLimit.add(object);
            res.writeHead(429, { 'Retry-After': '1', 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: 'rate_limited' }));
        }

        try {
            if (req.method === 'GET' && id) {
                const rec = store.get(object, id);
                return rec ? send(200, rec) : send(404, { error: 'not_found' });
            }
            if (req.method === 'GET') {
                const page = Number(url.searchParams.get(pageParam) ?? 1);
                const pageSize = Number(url.searchParams.get(sizeParam) ?? 50);
                const since = url.searchParams.get(sinceParam);
                return send(200, store.list(object, { page, pageSize, since }));
            }
            if (req.method === 'POST') {
                const body = await readBody(req);
                const idempotencyKey = req.headers['idempotency-key'] ?? null;
                const { record, created } = store.create(object, body, { idempotencyKey });
                return send(created ? 201 : 200, record);
            }
            if ((req.method === 'PATCH' || req.method === 'PUT') && id) {
                const body = await readBody(req);
                const rec = store.update(object, id, body);
                return rec ? send(200, rec) : send(404, { error: 'not_found' });
            }
            if (req.method === 'DELETE' && id) {
                return store.del(object, id) ? send(204, {}) : send(404, { error: 'not_found' });
            }
            return send(405, { error: 'method_not_allowed' });
        } catch (e) {
            return send(500, { error: String(e && e.message ? e.message : e) });
        }
    });
}
