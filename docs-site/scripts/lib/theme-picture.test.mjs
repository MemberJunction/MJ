import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rewriteThemePictureHtml } from './theme-picture.mjs';

const README_PICTURE = `<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="MJ_logo_wide_dark.png">
    <source media="(prefers-color-scheme: light)" srcset="MJ_logo_wide.png">
    <img alt="MemberJunction" src="MJ_logo_wide.png" width="420">
  </picture>
</p>`;

test('unrolls a theme-swap picture into a data-theme-swappable img pair', () => {
  const out = rewriteThemePictureHtml(README_PICTURE);
  assert.ok(!out.includes('<picture'), 'picture element removed');
  assert.ok(!out.includes('prefers-color-scheme'), 'no OS media query left behind');
  assert.ok(
    out.includes('<img class="mjd-themed-img mjd-themed-img--on-light" src="MJ_logo_wide.png" alt="MemberJunction" width="420">'),
  );
  assert.ok(
    out.includes('<img class="mjd-themed-img mjd-themed-img--on-dark" src="MJ_logo_wide_dark.png" alt="" aria-hidden="true" width="420">'),
  );
  assert.ok(out.startsWith('<p align="center">'), 'surrounding markup preserved');
});

test('falls back to the img src for a missing theme source', () => {
  const out = rewriteThemePictureHtml(
    '<picture><source media="(prefers-color-scheme: dark)" srcset="d.png"><img src="l.png" alt="x"></picture>',
  );
  assert.ok(out.includes('mjd-themed-img--on-light" src="l.png"'));
  assert.ok(out.includes('mjd-themed-img--on-dark" src="d.png"'));
});

test('takes the first candidate from a multi-density srcset', () => {
  const out = rewriteThemePictureHtml(
    '<picture><source media="(prefers-color-scheme: dark)" srcset="d.png 1x, d@2x.png 2x"><img src="l.png"></picture>',
  );
  assert.ok(out.includes('mjd-themed-img--on-dark" src="d.png"'));
});

test('leaves non-theme pictures untouched', () => {
  const viewportArt = '<picture><source media="(min-width: 50rem)" srcset="wide.png"><img src="narrow.png"></picture>';
  assert.equal(rewriteThemePictureHtml(viewportArt), viewportArt);
});

test('leaves a picture with no img untouched', () => {
  const broken = '<picture><source media="(prefers-color-scheme: dark)" srcset="d.png"></picture>';
  assert.equal(rewriteThemePictureHtml(broken), broken);
});

test('leaves plain html untouched', () => {
  const plain = '<p align="center"><img src="a.png" alt="a"></p>';
  assert.equal(rewriteThemePictureHtml(plain), plain);
});

test('handles multiple pictures in one html block', () => {
  const two = `${README_PICTURE}\n${README_PICTURE}`;
  const out = rewriteThemePictureHtml(two);
  assert.equal(out.match(/mjd-themed-img--on-dark/g)?.length, 2);
});
