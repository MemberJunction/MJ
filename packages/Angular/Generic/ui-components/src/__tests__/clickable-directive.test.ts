import { describe, it, expect, vi } from 'vitest';
import { ElementRef } from '@angular/core';
import { MJClickableDirective } from '../lib/clickable/clickable.directive';

/**
 * In-memory host stand-in: records attribute writes and exposes a spy-able `click()` so we can
 * assert keyboard activation dispatches a native click. No Angular TestBed (this package's pattern).
 */
function makeHost(textContent = ''): { host: ElementRef<HTMLElement>; clickSpy: ReturnType<typeof vi.fn> } {
  const attrs: Record<string, string> = {};
  const clickSpy = vi.fn();
  const el = {
    textContent,
    click: clickSpy,
    setAttribute: (k: string, v: string) => { attrs[k] = v; },
    getAttribute: (k: string) => (k in attrs ? attrs[k] : null),
  } as unknown as HTMLElement;
  return { host: new ElementRef(el), clickSpy };
}

/** Builds a minimal KeyboardEvent-like object with a preventDefault spy. */
function keyEvent(key: string): { event: KeyboardEvent; preventDefault: ReturnType<typeof vi.fn> } {
  const preventDefault = vi.fn();
  return { event: { key, preventDefault } as unknown as KeyboardEvent, preventDefault };
}

describe('MJClickableDirective', () => {
  describe('semantic host bindings', () => {
    it('defaults to role="button" and is keyboard-focusable (tabindex 0)', () => {
      const { host } = makeHost();
      const d = new MJClickableDirective(host);
      expect(d.roleAttr).toBe('button');
      expect(d.tabIndexAttr).toBe('0');
    });

    it('exposes role="link" when configured', () => {
      const { host } = makeHost();
      const d = new MJClickableDirective(host);
      d.role = 'link';
      expect(d.roleAttr).toBe('link');
    });

    it('drops tabindex when focusable=false', () => {
      const { host } = makeHost();
      const d = new MJClickableDirective(host);
      d.focusable = false;
      expect(d.tabIndexAttr).toBeNull();
    });

    it('surfaces the label as aria-label, trimmed; null when blank/absent', () => {
      const { host } = makeHost();
      const d = new MJClickableDirective(host);
      d.label = '  Knowledge Hub  ';
      expect(d.ariaLabelAttr).toBe('Knowledge Hub');
      d.label = '';
      expect(d.ariaLabelAttr).toBeNull();
      d.label = null;
      expect(d.ariaLabelAttr).toBeNull();
    });

    it('emits data-testid only when provided', () => {
      const { host } = makeHost();
      const d = new MJClickableDirective(host);
      expect(d.testIdAttr).toBeNull();
      d.testId = 'app-tile-Knowledge Hub';
      expect(d.testIdAttr).toBe('app-tile-Knowledge Hub');
    });
  });

  describe('keyboard activation', () => {
    it('dispatches a native click on Enter and prevents default', () => {
      const { host, clickSpy } = makeHost();
      const d = new MJClickableDirective(host);
      const { event, preventDefault } = keyEvent('Enter');
      d.onKeydown(event);
      expect(clickSpy).toHaveBeenCalledOnce();
      expect(preventDefault).toHaveBeenCalledOnce();
    });

    it('dispatches a native click on Space (prevents page scroll)', () => {
      const { host, clickSpy } = makeHost();
      const d = new MJClickableDirective(host);
      const { event, preventDefault } = keyEvent(' ');
      d.onKeydown(event);
      expect(clickSpy).toHaveBeenCalledOnce();
      expect(preventDefault).toHaveBeenCalledOnce();
    });

    it('ignores other keys (e.g. Tab, ArrowDown)', () => {
      const { host, clickSpy } = makeHost();
      const d = new MJClickableDirective(host);
      for (const key of ['Tab', 'ArrowDown', 'a', 'Escape']) {
        const { event, preventDefault } = keyEvent(key);
        d.onKeydown(event);
        expect(preventDefault).not.toHaveBeenCalled();
      }
      expect(clickSpy).not.toHaveBeenCalled();
    });
  });

  describe('accessible-name dev warning', () => {
    it('warns when neither a label nor visible text gives it a name', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const d = new MJClickableDirective(makeHost('').host);
      d.ngAfterContentInit();
      expect(warn).toHaveBeenCalledOnce();
      warn.mockRestore();
    });

    it('does NOT warn when a label is supplied', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const d = new MJClickableDirective(makeHost('').host);
      d.label = 'Open invoice';
      d.ngAfterContentInit();
      expect(warn).not.toHaveBeenCalled();
      warn.mockRestore();
    });

    it('does NOT warn when the element has visible text', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const d = new MJClickableDirective(makeHost('Recent records').host);
      d.ngAfterContentInit();
      expect(warn).not.toHaveBeenCalled();
      warn.mockRestore();
    });
  });
});
