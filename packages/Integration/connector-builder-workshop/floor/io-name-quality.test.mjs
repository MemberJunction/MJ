/**
 * Tests for io-name-quality.mjs — the IO-name catalog-quality floor gate.
 * Run: node --test io-name-quality.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyIOName, gradeIONames } from './io-name-quality.mjs';

const ctx = (pks = []) => ({
    pkFieldNamesLower: new Set(pks.map((s) => s.toLowerCase())),
});

test('clean entity names pass', () => {
    for (const n of ['Contact', 'Membership', 'EventSession', 'Sites', 'Drives', 'Account']) {
        assert.equal(classifyIOName(n, ctx()), null, `${n} should be clean`);
    }
});

test('filename leaked as object is rejected', () => {
    for (const n of ['available-time.json', 'bulk-result.json', 'campaign-data.json']) {
        const v = classifyIOName(n, ctx());
        assert.ok(v && v.reason === 'file-extension', `${n} should be file-extension`);
    }
});

test('filename with trailing digit (user-group.json1) is rejected', () => {
    const v = classifyIOName('user-group.json1', ctx());
    assert.ok(v && v.reason === 'file-extension');
});

test('kebab-case response/status schema titles are rejected', () => {
    for (const n of ['audience-segment-response', 'event-async-status', 'contact-obfuscation-status', 'transaction-item-response']) {
        const v = classifyIOName(n, ctx());
        assert.ok(v && v.reason === 'response-wrapper', `${n} should be response-wrapper`);
    }
});

test('PascalCase OrderStatus is NOT flagged as a response wrapper (no hyphen)', () => {
    assert.equal(classifyIOName('OrderStatus', ctx()), null);
});

test('legitimate versioned/ordinal names ending in a digit are NOT flagged (Salesforce regression)', () => {
    // Salesforce ships real objects named Territory2/Employee2/CaseHistory2 that coexist with a
    // de-numbered sibling — a numbered-duplicate rule would WRONGLY block a legit build. We dropped it.
    for (const n of ['Territory2', 'Employee2', 'CaseHistory2', 'AddressLine2', 'AgendaItem1']) {
        assert.equal(classifyIOName(n, ctx()), null, `${n} must not be flagged`);
    }
});

test('field-name-as-object flagged only when it matches a declared PK field', () => {
    assert.ok(classifyIOName('ExhibitorId', ctx(['ExhibitorId'])), 'matches a PK field name');
    assert.equal(classifyIOName('ExhibitorId', ctx([])), null, 'no matching PK field → left alone');
    // a real object ending in Id with no PK-field collision is not flagged
    assert.equal(classifyIOName('Grid', ctx([])), null);
});

test('empty name is rejected', () => {
    assert.ok(classifyIOName('', ctx()));
    assert.ok(classifyIOName('   ', ctx()));
});

test('gradeIONames over a mixed doc: clean pass, garbage fail with counts', () => {
    const doc = {
        fields: { Name: 'Demo' },
        relatedEntities: {
            'MJ: Integration Objects': [
                { fields: { Name: 'Contact' }, relatedEntities: { 'MJ: Integration Object Fields': [{ fields: { Name: 'ContactId', IsPrimaryKey: true } }] } },
                { fields: { Name: 'AgendaItem' } },
                { fields: { Name: 'AgendaItem1' } },                 // legit ordinal — NOT flagged
                { fields: { Name: 'bulk-result.json' } },            // filename
                { fields: { Name: 'event-async-status' } },          // response wrapper
                { fields: { Name: 'ContactId' } },                   // field-as-object (matches PK above)
            ],
        },
    };
    const v = gradeIONames(doc);
    assert.equal(v.pass, false);
    assert.equal(v.total, 6);
    assert.equal(v.garbage, 3);
    const reasons = v.violations.map((x) => x.reason).sort();
    assert.deepEqual(reasons, ['field-as-object', 'file-extension', 'response-wrapper']);
});

test('an all-clean doc passes', () => {
    const doc = {
        fields: { Name: 'ORCID' },
        relatedEntities: {
            'MJ: Integration Objects': [
                { fields: { Name: 'Works' } },
                { fields: { Name: 'Employments' } },
                { fields: { Name: 'Educations' } },
            ],
        },
    };
    const v = gradeIONames(doc);
    assert.equal(v.pass, true);
    assert.equal(v.garbage, 0);
});
