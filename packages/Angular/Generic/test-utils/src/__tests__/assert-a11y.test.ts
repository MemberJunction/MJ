// @vitest-environment jsdom
//
// Unit tests for ExpectNoAxeViolations. The package-level vitest config runs on the
// node preset; this file opts into jsdom via the pragma above because axe-core needs
// a document to scan. No Angular here — the helper only reads `fixture.nativeElement`,
// so a minimal fixture stand-in over a real jsdom element exercises the full contract
// (violation detection, message formatting, the jsdom-safe preset, and per-call
// debt disables) without paying the Angular AOT-compile cost.
import { describe, it, expect, afterEach } from 'vitest';
import { ComponentFixture } from '@angular/core/testing';
import { ExpectNoAxeViolations, JSDOM_UNSUPPORTED_AXE_RULES } from '../lib/assert-a11y.js';

/** Mount `html` into the document and wrap it in the one shape the helper reads. */
function fixtureFor(html: string): ComponentFixture<unknown> {
  const host = document.createElement('div');
  host.innerHTML = html;
  document.body.appendChild(host);
  const standIn: Pick<ComponentFixture<unknown>, 'nativeElement'> = { nativeElement: host };
  return standIn as ComponentFixture<unknown>;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('ExpectNoAxeViolations', () => {
  it('resolves for an accessible fragment', async () => {
    const fixture = fixtureFor(`<button type="button">Save</button><img src="x.png" alt="Preview" />`);
    await expect(ExpectNoAxeViolations(fixture)).resolves.toBeUndefined();
  });

  it('rejects with the rule id and impacted node when a violation exists', async () => {
    // An <img> with no alt/aria-label violates the image-alt rule (WCAG 1.1.1).
    const fixture = fixtureFor(`<img id="broken-img" src="x.png" />`);
    await expect(ExpectNoAxeViolations(fixture)).rejects.toThrowError(/image-alt/);
    await expect(ExpectNoAxeViolations(fixture)).rejects.toThrowError(/#broken-img/);
  });

  it('honors per-call disableRules (the A11Y-DEBT escape hatch) without widening the preset', async () => {
    const fixture = fixtureFor(`<img src="x.png" />`);
    await expect(ExpectNoAxeViolations(fixture, { disableRules: ['image-alt'] })).resolves.toBeUndefined();
  });

  it('keeps unrelated rules gating while a debt rule is disabled', async () => {
    // image-alt is waived, but the unlabeled <input> must still fail (label rule).
    const fixture = fixtureFor(`<img src="x.png" /><input type="text" />`);
    await expect(ExpectNoAxeViolations(fixture, { disableRules: ['image-alt'] })).rejects.toThrowError(/label/);
  });

  it('publishes the jsdom-unsupported preset (layout + page-level rules)', () => {
    expect(JSDOM_UNSUPPORTED_AXE_RULES).toContain('color-contrast');
    expect(JSDOM_UNSUPPORTED_AXE_RULES).toContain('region');
  });
});
