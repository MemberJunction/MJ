// The JIT compiler must load before @angular/platform-browser: its partially-compiled
// declarations (e.g. PlatformLocation) JIT-compile in static initializers at import time.
import '@angular/compiler';
import { describe, it, expect, beforeEach } from 'vitest';
import { Injector, SecurityContext, runInInjectionContext } from '@angular/core';
import { DomSanitizer, SafeHtml, SafeResourceUrl, SafeScript, SafeStyle, SafeUrl, SafeValue } from '@angular/platform-browser';
import { WhiteboardWidgetSrcdocPipe } from '../lib/whiteboard-srcdoc.pipe';
import { InjectWhiteboardSubmitHelper, WHITEBOARD_SUBMIT_HELPER } from '../lib/whiteboard-widget-bridge';
import { WhiteboardHtmlItem, WhiteboardState } from '../lib/whiteboard-state';

/**
 * SANDBOXED HTML-WIDGET `srcdoc` LIFECYCLE — the regression suite for the
 * "SVG chart vanishes after switching whiteboard pages and back" bug.
 *
 * Root cause class under test: the board used to memoize each widget's `SafeHtml` in a
 * COMPONENT-level map keyed by item ID, invalidated from journal ops. That decoupled the
 * trusted document's lifetime from the iframe element's lifetime, so a re-mounted frame
 * could be served a stale instance (no `srcdoc` write ⇒ blank frame) while every
 * `'replace'` op force-reloaded widgets that never changed. The fix moves the memo into
 * the view-scoped `wbWidgetSrcdoc` pure pipe, whose contract is:
 *
 *  - one pipe instance per MOUNTED frame ⇒ every re-mount rebuilds a FRESH document;
 *  - per-instance identity pinning ⇒ a still-mounted widget with unchanged Html never
 *    gets a new binding value (no iframe reload churn);
 *  - the produced document is a PURE function of the Html source — byte-identical on
 *    every call, SVG/script content passed through untouched (the sandbox, not a
 *    sanitizer, is the security boundary).
 */

/** SafeHtml double that exposes the wrapped document for assertions. */
interface StubSafeHtml extends SafeHtml {
  Wrapped: string;
}

/** Minimal DomSanitizer double — records every bypass call so tests can count rebuilds. */
class StubDomSanitizer extends DomSanitizer {
  /** Every document handed to bypassSecurityTrustHtml, in call order. */
  public BypassedDocs: string[] = [];

  public override sanitize(_context: SecurityContext, value: SafeValue | string | null): string | null {
    return typeof value === 'string' ? value : null;
  }

  public override bypassSecurityTrustHtml(value: string): SafeHtml {
    this.BypassedDocs.push(value);
    const wrapped: StubSafeHtml = { Wrapped: value };
    return wrapped;
  }

  public override bypassSecurityTrustStyle(value: string): SafeStyle {
    return { Wrapped: value } as StubSafeHtml;
  }

  public override bypassSecurityTrustScript(value: string): SafeScript {
    return { Wrapped: value } as StubSafeHtml;
  }

  public override bypassSecurityTrustUrl(value: string): SafeUrl {
    return { Wrapped: value } as StubSafeHtml;
  }

  public override bypassSecurityTrustResourceUrl(value: string): SafeResourceUrl {
    return { Wrapped: value } as StubSafeHtml;
  }
}

const SVG_CHART = '<svg viewBox="0 0 200 100"><rect x="10" y="20" width="30" height="70"/><path d="M0 90 L200 10"/></svg>';

function createPipe(sanitizer: StubDomSanitizer): WhiteboardWidgetSrcdocPipe {
  const injector = Injector.create({ providers: [{ provide: DomSanitizer, useValue: sanitizer }] });
  return runInInjectionContext(injector, () => new WhiteboardWidgetSrcdocPipe());
}

function wrappedDoc(safe: SafeHtml): string {
  return (safe as StubSafeHtml).Wrapped;
}

describe('WhiteboardWidgetSrcdocPipe — document construction', () => {
  let sanitizer: StubDomSanitizer;
  let pipe: WhiteboardWidgetSrcdocPipe;

  beforeEach(() => {
    sanitizer = new StubDomSanitizer();
    pipe = createPipe(sanitizer);
  });

  it('produces the helper-injected document with SVG content passed through untouched', () => {
    const doc = wrappedDoc(pipe.transform(SVG_CHART));
    expect(doc.startsWith(WHITEBOARD_SUBMIT_HELPER)).toBe(true);
    expect(doc.endsWith(SVG_CHART)).toBe(true); // no sanitization inside the package — the sandbox is the boundary
    expect(doc).toBe(InjectWhiteboardSubmitHelper(SVG_CHART)); // exactly the bridge builder's output
  });

  it('never duplicates the helper when the source already carries it', () => {
    const doc = wrappedDoc(pipe.transform(WHITEBOARD_SUBMIT_HELPER + SVG_CHART));
    expect(doc.indexOf(WHITEBOARD_SUBMIT_HELPER)).toBe(0);
    expect(doc.indexOf(WHITEBOARD_SUBMIT_HELPER, 1)).toBe(-1);
  });

  it('returns the IDENTICAL SafeHtml instance for an unchanged source (no iframe reload while mounted)', () => {
    const first = pipe.transform(SVG_CHART);
    const second = pipe.transform(SVG_CHART);
    expect(second).toBe(first); // identity-stable ⇒ Angular never rewrites srcdoc ⇒ no reload
    expect(sanitizer.BypassedDocs).toHaveLength(1); // built exactly once per (instance, source)
  });

  it('rebuilds when the source changes — and again when it changes back (no cross-value cache)', () => {
    const v1 = pipe.transform('<p>one</p>');
    const v2 = pipe.transform('<p>two</p>');
    const v3 = pipe.transform('<p>one</p>');
    expect(wrappedDoc(v2)).toContain('<p>two</p>');
    expect(v2).not.toBe(v1);
    expect(v3).not.toBe(v1); // last-value memo only — content correctness beats instance reuse
    expect(wrappedDoc(v3)).toBe(wrappedDoc(v1)); // …but the DOCUMENT is byte-identical
    expect(sanitizer.BypassedDocs).toHaveLength(3);
  });
});

describe('WhiteboardWidgetSrcdocPipe — per-mount lifecycle (the page-switch regression)', () => {
  it('a fresh pipe instance (re-mounted frame) rebuilds a byte-identical document as a NEW SafeHtml instance', () => {
    // Mount 1 (first render of the widget) and mount 2 (page switched away and back):
    // Angular instantiates a NEW pure pipe for the re-created embedded view.
    const sanitizer = new StubDomSanitizer();
    const mount1 = createPipe(sanitizer).transform(SVG_CHART);
    const mount2 = createPipe(sanitizer).transform(SVG_CHART);
    // New instance ⇒ the re-mounted iframe's first binding pass always has a fresh value to write…
    expect(mount2).not.toBe(mount1);
    // …and what it writes is EXACTLY what the first mount rendered — SVG intact.
    expect(wrappedDoc(mount2)).toBe(wrappedDoc(mount1));
    expect(wrappedDoc(mount2)).toContain('<svg');
  });

  it('repeated mounts are deterministic: N mounts ⇒ N identical documents', () => {
    const sanitizer = new StubDomSanitizer();
    for (let mount = 0; mount < 4; mount++) {
      createPipe(sanitizer).transform(SVG_CHART);
    }
    expect(sanitizer.BypassedDocs).toHaveLength(4);
    expect(new Set(sanitizer.BypassedDocs).size).toBe(1);
  });
});

describe('WhiteboardState — page switches cannot alter what a re-mounted widget renders', () => {
  let state: WhiteboardState;

  beforeEach(() => {
    state = new WhiteboardState();
  });

  function chartHtml(): string {
    return `<!doctype html><html><body>${SVG_CHART}</body></html>`;
  }

  it('SwitchPage round-trip journals replace ops but leaves the widget Html byte-identical', () => {
    const html = chartHtml();
    const widget = state.AddItem({ Kind: 'html', X: 10, Y: 10, W: 360, H: 240, Html: html, Title: 'Chart' }, 'agent') as WhiteboardHtmlItem;
    const page1 = state.ActivePageID;

    const replaces: number[] = [];
    state.Changed$.subscribe((c) => {
      if (c.Op === 'replace') {
        replaces.push(c.Seq);
      }
    });

    state.AddPage('Page 2', 'user');           // switches to the new page
    expect(state.GetItem(widget.ID)).toBeUndefined(); // unmounted: not on the active page
    expect(state.SwitchPage(page1, 'user')).toBe(true);

    expect(replaces.length).toBe(2); // AddPage + SwitchPage both journal 'replace'
    const remounted = state.GetItem(widget.ID) as WhiteboardHtmlItem;
    expect(remounted).toBeDefined();
    expect(remounted.Html).toBe(html); // byte-identical source ⇒ identical srcdoc on re-mount
  });

  it('a JSON persistence round trip preserves the SVG-bearing Html source exactly', () => {
    const html = chartHtml();
    const widget = state.AddItem({ Kind: 'html', X: 0, Y: 0, W: 360, H: 240, Html: html }, 'agent') as WhiteboardHtmlItem;
    const restored = WhiteboardState.FromJSON(state.ToJSON());
    const item = restored.GetItem(widget.ID) as WhiteboardHtmlItem;
    expect(item.Html).toBe(html);
  });

  it('an unrelated undo (replace op) keeps the still-mounted widget srcdoc identity stable — no reload', () => {
    const html = chartHtml();
    const widget = state.AddItem({ Kind: 'html', X: 0, Y: 0, W: 360, H: 240, Html: html }, 'agent') as WhiteboardHtmlItem;
    state.AddItem({ Kind: 'sticky', X: 500, Y: 500, Text: 'note' }, 'user');

    const sanitizer = new StubDomSanitizer();
    const pipe = createPipe(sanitizer); // the widget's mounted frame — view (and pipe) survive the undo
    const before = pipe.transform((state.GetItem(widget.ID) as WhiteboardHtmlItem).Html);

    state.Undo(); // removes the sticky via whole-scene restore ⇒ journals 'replace', REPLACES item objects

    const after = pipe.transform((state.GetItem(widget.ID) as WhiteboardHtmlItem).Html);
    expect(after).toBe(before); // same value ⇒ same instance ⇒ Angular writes nothing ⇒ widget state survives
    expect(sanitizer.BypassedDocs).toHaveLength(1);
  });
});
