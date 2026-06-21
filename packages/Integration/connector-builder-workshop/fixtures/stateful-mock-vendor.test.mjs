/**
 * Tests for the STATEFUL mock vendor — pins the credential-free write family that route-replay can't reach.
 *
 * The whole reason this module exists: WRITE / BIDIRECTIONAL / DELETE must be provable WITHOUT a live
 * credential. These tests drive the pure VendorStore (and a live socket round-trip through the HTTP adapter)
 * to assert state actually reflects across operations:
 *   - create → read-back shows it
 *   - update → read-back shows the change (and only the change)
 *   - delete → read-back 404s, and a tombstone is emitted for delta-delete detection
 *   - bidirectional: a vendor-side edit is visible to the next pull; a connector-side write is visible to a re-get
 *   - idempotent replay: the same idempotency key never duplicates
 *   - incremental `since`: only rows changed after the watermark come back
 *   - pagination: a multi-page list advances and terminates
 *
 * Run: `node --test packages/Integration/connector-builder-workshop/fixtures/`
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VendorStore, createStatefulVendorServer } from './stateful-mock-vendor.mjs';

// ── WRITE: create reflects in read-back ───────────────────────────────────────────────────────────
test('create → get returns the created record with an assigned id + watermark', () => {
    const s = new VendorStore();
    const { record, created } = s.create('contacts', { Name: 'Ada' });
    assert.equal(created, true);
    assert.ok(record.id, 'id assigned');
    assert.ok(record.modifiedDate, 'watermark stamped');
    const back = s.get('contacts', record.id);
    assert.equal(back.Name, 'Ada');
});

// ── WRITE: update mutates only the patched fields + bumps the watermark ────────────────────────────
test('update → read-back shows the change and a strictly-greater watermark', () => {
    const s = new VendorStore();
    const { record } = s.create('contacts', { Name: 'Ada', Title: 'Eng' });
    const w0 = record.modifiedDate;
    const upd = s.update('contacts', record.id, { Title: 'Lead' });
    assert.equal(upd.Name, 'Ada', 'untouched field preserved');
    assert.equal(upd.Title, 'Lead', 'patched field changed');
    assert.ok(upd.modifiedDate > w0, 'watermark advanced on update');
    assert.equal(s.get('contacts', record.id).Title, 'Lead');
});

test('update of a missing id returns null (no phantom create)', () => {
    const s = new VendorStore();
    assert.equal(s.update('contacts', 'nope', { x: 1 }), null);
});

// ── DELETE: removes the row, 404s on read-back, and emits a tombstone ──────────────────────────────
test('delete → get is gone, list excludes it, tombstone recorded for delta-delete', () => {
    const s = new VendorStore();
    const { record } = s.create('contacts', { Name: 'Ada' });
    assert.equal(s.del('contacts', record.id), true);
    assert.equal(s.get('contacts', record.id), null, 'gone after delete');
    assert.equal(s.list('contacts').total, 0, 'excluded from list');
    const tombs = s.deletedSince('contacts', null);
    assert.equal(tombs.length, 1);
    assert.equal(tombs[0].id, record.id, 'tombstone carries the deleted id');
});

test('delete of a missing id returns false', () => {
    const s = new VendorStore();
    assert.equal(s.del('contacts', 'nope'), false);
});

// ── BIDIRECTIONAL: vendor-side change visible to next pull; connector-side write visible to re-get ──
test('bidirectional: a vendor-side edit surfaces in the next incremental pull', () => {
    const s = new VendorStore();
    const a = s.create('contacts', { Name: 'A' }).record;
    const watermarkAfterFirstPull = s.list('contacts').rows.at(-1).modifiedDate;
    // vendor mutates a row out-of-band
    s.update('contacts', a.id, { Name: 'A-edited' });
    const delta = s.list('contacts', { since: watermarkAfterFirstPull });
    assert.equal(delta.rows.length, 1, 'only the changed row comes back');
    assert.equal(delta.rows[0].Name, 'A-edited');
});

// ── IDEMPOTENT REPLAY: same key never duplicates ──────────────────────────────────────────────────
test('idempotent replay: re-create with the same idempotency key returns the same row, no duplicate', () => {
    const s = new VendorStore();
    const first = s.create('contacts', { Name: 'Ada' }, { idempotencyKey: 'k1' });
    const second = s.create('contacts', { Name: 'Ada' }, { idempotencyKey: 'k1' });
    assert.equal(second.created, false, 'replay is not a new create');
    assert.equal(second.record.id, first.record.id, 'same row returned');
    assert.equal(s.count('contacts'), 1, 'exactly one row exists');
});

// ── INCREMENTAL: `since` returns only rows changed after the watermark ─────────────────────────────
test('incremental since-watermark returns only newer rows (exclusive)', () => {
    const s = new VendorStore();
    s.create('contacts', { Name: 'old' });
    const cut = s.list('contacts').rows.at(-1).modifiedDate;
    s.create('contacts', { Name: 'new' });
    const delta = s.list('contacts', { since: cut });
    assert.equal(delta.rows.length, 1);
    assert.equal(delta.rows[0].Name, 'new');
});

// ── PAGINATION: a multi-page list advances and terminates ─────────────────────────────────────────
test('pagination windows the set and reports hasMore correctly', () => {
    const s = new VendorStore();
    for (let i = 0; i < 5; i++) s.create('contacts', { Name: `c${i}` });
    const p1 = s.list('contacts', { page: 1, pageSize: 2 });
    const p2 = s.list('contacts', { page: 2, pageSize: 2 });
    const p3 = s.list('contacts', { page: 3, pageSize: 2 });
    assert.equal(p1.rows.length, 2);
    assert.equal(p1.hasMore, true);
    assert.equal(p3.rows.length, 1);
    assert.equal(p3.hasMore, false, 'last page terminates');
});

// ── CUSTOM-COLUMN CAPTURE: undeclared fields ride along on emitted rows ────────────────────────────
test('custom fields decorator attaches undeclared keys for capture cells', () => {
    const s = new VendorStore({ customFields: (obj, rec) => ({ __customFlag: `${obj}-extra` }) });
    s.create('contacts', { Name: 'Ada' });
    const row = s.list('contacts').rows[0];
    assert.equal(row.__customFlag, 'contacts-extra', 'undeclared field present for capture');
});

// ── HTTP ADAPTER: a real socket round-trip proves the create→get→patch→delete chain end-to-end ─────
test('HTTP adapter: full create→get→update→delete round-trip over a live socket', async () => {
    const store = new VendorStore();
    const server = createStatefulVendorServer({ store });
    await new Promise((r) => server.listen(0, r));
    const base = `http://localhost:${server.address().port}`;
    const j = async (m, p, b) => {
        const res = await fetch(base + p, {
            method: m,
            headers: { 'Content-Type': 'application/json' },
            body: b ? JSON.stringify(b) : undefined,
        });
        return { status: res.status, body: res.status === 204 ? null : await res.json() };
    };
    try {
        const created = await j('POST', '/contacts', { Name: 'Ada' });
        assert.equal(created.status, 201);
        const cid = created.body.id;

        const got = await j('GET', `/contacts/${cid}`);
        assert.equal(got.status, 200);
        assert.equal(got.body.Name, 'Ada');

        const patched = await j('PATCH', `/contacts/${cid}`, { Name: 'Ada Lovelace' });
        assert.equal(patched.status, 200);
        assert.equal(patched.body.Name, 'Ada Lovelace');

        const del = await j('DELETE', `/contacts/${cid}`);
        assert.equal(del.status, 204);

        const gone = await j('GET', `/contacts/${cid}`);
        assert.equal(gone.status, 404, 'read-back 404s after delete');
    } finally {
        await new Promise((r) => server.close(r));
    }
});

// ── HTTP ADAPTER: once-only 429 for the rate-limit cell ───────────────────────────────────────────
test('HTTP adapter: 429 fires once then recovers (rate-limit cell)', async () => {
    const store = new VendorStore();
    store.seed('appeals', [{ Name: 'a' }]);
    const server = createStatefulVendorServer({ store, rateLimitOnceOn: ['appeals'] });
    await new Promise((r) => server.listen(0, r));
    const base = `http://localhost:${server.address().port}`;
    try {
        const first = await fetch(base + '/appeals');
        assert.equal(first.status, 429);
        assert.equal(first.headers.get('retry-after'), '1');
        const second = await fetch(base + '/appeals');
        assert.equal(second.status, 200, 'recovers after the single 429');
    } finally {
        await new Promise((r) => server.close(r));
    }
});
