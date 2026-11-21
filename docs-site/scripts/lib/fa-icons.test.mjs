import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveFontAwesome } from './fa-icons.mjs';

test('resolveFontAwesome: the class lists Open App manifests use', () => {
  const invoice = resolveFontAwesome('fa-solid fa-file-invoice-dollar');
  assert.equal(invoice.viewBox, '0 0 384 512');
  assert.match(invoice.path, /^M/);
  // A bare name with no style is solid in Font Awesome 6 (skip-client's "fa-robot").
  assert.ok(resolveFontAwesome('fa-robot'));
  // Old-style prefixes and modifiers.
  assert.deepEqual(resolveFontAwesome('fas fa-cheese fa-fw'), resolveFontAwesome('fa-solid fa-cheese'));
  assert.ok(resolveFontAwesome('fa-regular fa-bell'));
  assert.ok(resolveFontAwesome('fa-brands fa-github'));
});

test('resolveFontAwesome: aliases resolve to their icon', () => {
  assert.deepEqual(resolveFontAwesome('fa-solid fa-vote-yea'), resolveFontAwesome('fa-solid fa-check-to-slot'));
});

test('resolveFontAwesome: unknown or empty is null', () => {
  assert.equal(resolveFontAwesome('fa-solid fa-not-an-icon'), null);
  assert.equal(resolveFontAwesome('fa-solid'), null);
  assert.equal(resolveFontAwesome(''), null);
  assert.equal(resolveFontAwesome(null), null);
});
