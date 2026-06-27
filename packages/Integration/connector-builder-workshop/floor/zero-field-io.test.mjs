/**
 * Tests for zero-field-io.mjs — the readable-IO-must-have-fields floor gate.
 * Run: node --test zero-field-io.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ioIsReadable, gradeZeroFieldIOs } from './zero-field-io.mjs';

const iofs = (...names) => ({
    'MJ: Integration Object Fields': names.map((n) => ({ fields: { Name: n } })),
});

test('a readable IO with fields passes', () => {
    const doc = {
        fields: { Name: 'Demo' },
        relatedEntities: {
            'MJ: Integration Objects': [
                { fields: { Name: 'Contact' }, relatedEntities: iofs('Id', 'Name', 'Email') },
            ],
        },
    };
    const v = gradeZeroFieldIOs(doc);
    assert.equal(v.pass, true);
    assert.equal(v.empty, 0);
    assert.equal(v.totalReadable, 1);
});

test('a readable IO with ZERO fields is rejected (the netFORUM SOAP-stub class)', () => {
    const doc = {
        fields: { Name: 'netFORUM' },
        relatedEntities: {
            'MJ: Integration Objects': [
                { fields: { Name: 'Chapter' }, relatedEntities: iofs('chp_key', 'chp_name') },
                { fields: { Name: 'Committee' } },                 // SOAP stub — no IOFs
                { fields: { Name: 'FundraisingGift' } },           // SOAP stub — no IOFs
            ],
        },
    };
    const v = gradeZeroFieldIOs(doc);
    assert.equal(v.pass, false);
    assert.equal(v.empty, 2);
    assert.deepEqual(v.violations.map((x) => x.io).sort(), ['Committee', 'FundraisingGift']);
});

test('a write-only DTO (SupportsRead=false) with no fields is NOT flagged', () => {
    assert.equal(ioIsReadable({ SupportsRead: false }), false);
    const doc = {
        fields: { Name: 'Demo' },
        relatedEntities: {
            'MJ: Integration Objects': [
                { fields: { Name: 'AddressAdd', SupportsRead: false } },  // create-only DTO, no read fields
                { fields: { Name: 'Contact' }, relatedEntities: iofs('Id') },
            ],
        },
    };
    const v = gradeZeroFieldIOs(doc);
    assert.equal(v.pass, true);
    assert.equal(v.totalReadable, 1);     // AddressAdd is not counted (write-only)
});

test('SupportsRead tolerates the string "false" (mj-sync metadata varies)', () => {
    assert.equal(ioIsReadable({ SupportsRead: 'false' }), false);
    assert.equal(ioIsReadable({ SupportsRead: 'true' }), true);
    assert.equal(ioIsReadable({}), true);                 // default readable
});

test('explicit AllowZeroFields opt-out excludes a deliberately structureless object', () => {
    assert.equal(ioIsReadable({ AllowZeroFields: true }), false);
    const doc = {
        fields: { Name: 'Demo' },
        relatedEntities: {
            'MJ: Integration Objects': [
                { fields: { Name: 'Ping', AllowZeroFields: true } },  // conscious, auditable exception
            ],
        },
    };
    assert.equal(gradeZeroFieldIOs(doc).pass, true);
});

test('an all-clean multi-object doc passes', () => {
    const doc = {
        fields: { Name: 'ORCID' },
        relatedEntities: {
            'MJ: Integration Objects': [
                { fields: { Name: 'Works' }, relatedEntities: iofs('put-code', 'title') },
                { fields: { Name: 'Employments' }, relatedEntities: iofs('put-code', 'org') },
            ],
        },
    };
    const v = gradeZeroFieldIOs(doc);
    assert.equal(v.pass, true);
    assert.equal(v.totalReadable, 2);
    assert.equal(v.empty, 0);
});
