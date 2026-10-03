import { beforeAll, describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM, VirtualConsole } from 'jsdom';

/**
 * The shipped one-script embed, exercised as a page would: the BUILT bundle, loaded by the static sample
 * page, in a window whose `eval` and `Function` constructor throw (what a CSP without `unsafe-eval` does).
 * It proves four things unit tests cannot: the Angular linker ran (no `ɵɵngDeclare` left, so no JIT),
 * the element defines and renders, string-keyed `@RegisterClass` registrations survived minification, and
 * the sample page is CSP-clean.
 *
 * Needs `pnpm run build` first (`test` depends on `build` in turbo). A missing bundle FAILS rather than
 * skips: a skipped gate reads as a passing one.
 */
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const bundlePath = resolve(root, 'dist/element/mj-realtime-widget.js');
const samplePath = resolve(root, 'sample/index.html');

describe('mj-realtime-widget element bundle', () => {
  let bundle = '';
  beforeAll(() => {
    if (!existsSync(bundlePath)) {
      throw new Error(`Bundle not built: ${bundlePath}. Run \`pnpm run build\` in packages/Angular/Generic/realtime-widget first.`);
    }
    bundle = readFileSync(bundlePath, 'utf8');
  });

  it('was linked ahead of time: no partial declarations remain, so no JIT compiler is needed', () => {
    expect(bundle).not.toContain('ɵɵngDeclare');
    expect(bundle).not.toMatch(/ɵɵngDeclare[A-Z]/);
  });

  it('keeps the string-keyed channel registration the ClassFactory resolves at runtime', () => {
    expect(bundle).toContain('IdentityVerificationChannel');
    expect(bundle).toContain('IdentityVerification');
  });

  it('guards the element definition so a second bundle on the page is a no-op', () => {
    expect(bundle).toContain('mj-realtime-widget');
    expect(bundle).toMatch(/customElements\.get\(/);
  });

  describe('booted from the static sample page under a no-eval window', () => {
    let dom: JSDOM;
    let errors: string[];

    beforeAll(async () => {
      errors = [];
      const virtualConsole = new VirtualConsole();
      virtualConsole.on('jsdomError', (e) => errors.push(e.message));
      dom = await JSDOM.fromFile(samplePath, {
        runScripts: 'dangerously',
        resources: 'usable',
        pretendToBeVisual: true,
        virtualConsole,
        beforeParse(window) {
          const blocked = () => {
            throw new EvalError('Refused to evaluate a string as JavaScript (unsafe-eval is blocked)');
          };
          // Wrapping, not replacing, keeps `Function.prototype` reachable for libraries that read it.
          window.Function = new Proxy(window.Function, { construct: blocked, apply: blocked });
          window.eval = blocked;
        }
      });
      await new Promise<void>((resolveLoaded) => {
        const deadline = Date.now() + 20000;
        const tick = () => {
          if (dom.window.document.body.getAttribute('data-widget-defined') === 'true' || Date.now() > deadline) {
            resolveLoaded();
          } else {
            setTimeout(tick, 50);
          }
        };
        tick();
      });
      await new Promise((r) => setTimeout(r, 300));
    }, 40000);

    it('defines <mj-realtime-widget> and raises no script errors', () => {
      expect(dom.window.document.body.getAttribute('data-widget-defined')).toBe('true');
      expect(errors).toEqual([]);
    });

    it('renders the idle widget with the agent named and the page attributes applied', () => {
      const el = dom.window.document.getElementById('widget') as HTMLElement & Record<string, unknown>;
      expect(el.getAttribute('data-phase')).toBe('idle');
      expect(el.querySelector('.mjw-start')?.textContent).toContain('Talk to Sage');
      expect(el['apiUrl']).toBe('https://api.example.com');
      expect(el['widgetKey']).toBe('pk_live_replace_me');
      expect(el['channels']).toEqual(['IdentityVerification']);
    });

    it('exposes every method on the element', () => {
      const el = dom.window.document.getElementById('widget') as HTMLElement & Record<string, unknown>;
      for (const method of ['start', 'end', 'openChannel', 'sendContextNote', 'requestSpokenResponse', 'registerChannel']) {
        expect(typeof el[method], method).toBe('function');
      }
    });

    it('reports mj-ready to the sample page log', () => {
      const lines = Array.from(dom.window.document.querySelectorAll('#log li')).map((li) => li.textContent ?? '');
      expect(lines.some((l) => l.startsWith('mj-ready'))).toBe(true);
    });

    it('carries the widget\'s default style layer into the page', () => {
      const css = Array.from(dom.window.document.querySelectorAll('style')).map((s) => s.textContent ?? '').join('\n');
      expect(css).toContain('mj-realtime-widget-defaults');
    });

    it('is CSP-clean itself: strict policy, no inline script, no eval allowance', () => {
      const document = dom.window.document;
      const policy = document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute('content') ?? '';
      expect(policy).toContain("script-src 'self'");
      expect(policy).not.toContain('unsafe-eval');
      expect(policy).not.toMatch(/script-src[^;]*unsafe-inline/);
      expect(Array.from(document.querySelectorAll('script:not([src])'))).toHaveLength(0);
    });
  });
});
