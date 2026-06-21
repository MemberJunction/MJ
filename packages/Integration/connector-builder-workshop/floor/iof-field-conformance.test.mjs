/**
 * Tests for the schema-conformance gate — pins the netFORUM build-against-wrong-schema hole.
 *
 * The defect: an extractor emits a column (`IsForeignKey`, `ForeignKeyTarget`, `Source`, `SupportsCreate`...)
 * that does NOT exist on the target's deployed schema; mj-sync silently no-ops it; the value never persists.
 * This gate must FAIL loudly on any emitted column absent from the deployed column set — and must NEVER flag
 * structural mj-sync keys (primaryKey/sync/relatedEntities) or a column that legitimately exists.
 *
 * Run: `node --test packages/Integration/connector-builder-workshop/floor/`
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { unknownColumnsInRow, walkMetadata, gradeConformance, STRUCTURAL_KEYS } from './iof-field-conformance.mjs';

// ── unknownColumnsInRow ─────────────────────────────────────────────────────────────────────────
test('flags a column absent from the deployed set', () => {
    const u = unknownColumnsInRow({ Name: 'x', IsForeignKey: true }, new Set(['name', 'type']));
    assert.deepEqual(u, ['IsForeignKey']);
});

test('is case-insensitive (deployed NAME matches emitted Name)', () => {
    const u = unknownColumnsInRow({ Name: 'x' }, new Set(['name']));
    assert.deepEqual(u, []);
});

test('never flags structural mj-sync keys', () => {
    const u = unknownColumnsInRow({ primaryKey: {}, sync: {}, relatedEntities: {}, Name: 'x' }, new Set(['name']));
    assert.deepEqual(u, [], 'structural keys + known column all pass');
    for (const k of ['primarykey', 'sync', 'relatedentities']) assert.ok(STRUCTURAL_KEYS.has(k));
});

// ── walkMetadata ─────────────────────────────────────────────────────────────────────────────────
test('walks a nested mj-sync doc into integration/io/iof buckets', () => {
    const doc = {
        fields: { Name: 'Acme' },
        relatedEntities: {
            'MJ: Integration Objects': [
                {
                    fields: { Name: 'contacts', APIPath: '/contacts' },
                    relatedEntities: {
                        'MJ: Integration Object Fields': [{ fields: { Name: 'id', Type: 'string' } }],
                    },
                },
            ],
        },
    };
    const { integration, ios, iofs } = walkMetadata(doc);
    assert.equal(integration.length, 1);
    assert.equal(ios.length, 1);
    assert.equal(iofs.length, 1);
    assert.equal(iofs[0].label, 'contacts.id');
});

// ── gradeConformance: the netFORUM case ───────────────────────────────────────────────────────────
test('BLOCKS when an IOF emits IsForeignKey/ForeignKeyTarget absent from the deployed schema', () => {
    const doc = {
        fields: { Name: 'Acme' },
        relatedEntities: {
            'MJ: Integration Objects': [
                {
                    fields: { Name: 'contacts' },
                    relatedEntities: {
                        'MJ: Integration Object Fields': [
                            { fields: { Name: 'accountId', Type: 'string', IsForeignKey: true, ForeignKeyTarget: 'accounts' } },
                        ],
                    },
                },
            ],
        },
    };
    const allowed = {
        integration: ['Name'],
        io: ['Name'],
        iof: ['Name', 'Type', 'IsPrimaryKey', 'IsRequired', 'IsReadOnly', 'IsUniqueKey', 'RelatedIntegrationObjectID', 'Status'],
    };
    const v = gradeConformance(doc, allowed);
    assert.equal(v.pass, false);
    assert.equal(v.violations.length, 1);
    assert.equal(v.violations[0].kind, 'iof');
    assert.deepEqual(v.violations[0].unknownColumns.sort(), ['ForeignKeyTarget', 'IsForeignKey']);
});

test('PASSES a clean doc whose every column exists on the deployed schema', () => {
    const doc = {
        fields: { Name: 'Acme', Description: 'd' },
        relatedEntities: {
            'MJ: Integration Objects': [
                {
                    fields: { Name: 'contacts', APIPath: '/contacts' },
                    relatedEntities: {
                        'MJ: Integration Object Fields': [{ fields: { Name: 'id', Type: 'string', IsPrimaryKey: true } }],
                    },
                },
            ],
        },
    };
    const allowed = {
        integration: ['Name', 'Description'],
        io: ['Name', 'APIPath'],
        iof: ['Name', 'Type', 'IsPrimaryKey'],
    };
    assert.equal(gradeConformance(doc, allowed).pass, true);
});

test('flags the ideal-but-unmigrated IO columns (Source vs MetadataSource, SupportsCreate)', () => {
    const doc = {
        fields: { Name: 'Acme' },
        relatedEntities: {
            'MJ: Integration Objects': [{ fields: { Name: 'contacts', Source: 'Declared', SupportsCreate: true } }],
        },
    };
    const allowed = { integration: ['Name'], io: ['Name', 'MetadataSource'], iof: [] };
    const v = gradeConformance(doc, allowed);
    assert.equal(v.pass, false);
    assert.deepEqual(v.violations[0].unknownColumns.sort(), ['Source', 'SupportsCreate']);
});
