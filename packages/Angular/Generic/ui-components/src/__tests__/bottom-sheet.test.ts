import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderComponentFixture, query } from '@memberjunction/ng-test-utils';
import { MJBottomSheetComponent } from '../lib/bottom-sheet/bottom-sheet.component';

/**
 * DOM tests for MJBottomSheetComponent — the generic mobile sheet primitive.
 * Covers the render/open/settle/close lifecycle, Escape + scrim dismissal,
 * the reduced-motion close fallback (fake timers), and focus restore.
 *
 * jsdom has no real transitions: the open path's requestAnimationFrame calls
 * are flushed manually, and closes complete via the 300ms timeout fallback
 * (exactly the prefers-reduced-motion path in production).
 */

function flushRafs(): void {
  // open() uses two nested rAFs; jsdom implements rAF as setTimeout(0)
  vi.advanceTimersByTime(50);
}

describe('MJBottomSheetComponent (DOM)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function render() {
    const fixture = renderComponentFixture(MJBottomSheetComponent, {
      imports: [MJBottomSheetComponent],
      autoDetect: true
    });
    fixture.detectChanges();
    return fixture;
  }

  it('renders nothing until Visible', () => {
    const fixture = render();
    expect(query(fixture, '.mj-bottom-sheet')).toBeNull();
    expect(query(fixture, '.mj-bottom-sheet-scrim')).toBeNull();
  });

  it('opens: renders scrim + role=dialog sheet, then flips the open classes', () => {
    const fixture = render();
    fixture.componentRef.setInput('Visible', true);
    fixture.detectChanges();

    const sheet = query(fixture, '.mj-bottom-sheet') as HTMLElement;
    expect(sheet).not.toBeNull();
    expect(sheet.getAttribute('role')).toBe('dialog');
    expect(query(fixture, '.mj-bottom-sheet-scrim')).not.toBeNull();

    flushRafs();
    fixture.detectChanges();
    expect(sheet.classList.contains('mj-bottom-sheet--open')).toBe(true);
  });

  it('uses AriaLabel over Title for the accessible name', () => {
    const fixture = render();
    fixture.componentRef.setInput('Title', 'Open Records');
    fixture.componentRef.setInput('AriaLabel', 'Record switcher');
    fixture.componentRef.setInput('Visible', true);
    fixture.detectChanges();
    expect((query(fixture, '.mj-bottom-sheet') as HTMLElement).getAttribute('aria-label')).toBe('Record switcher');
    expect(query(fixture, '.mj-bottom-sheet-header')?.textContent?.trim()).toBe('Open Records');
  });

  it('applies the settled class (transform:none) after the open transition ends', () => {
    const fixture = render();
    fixture.componentRef.setInput('Visible', true);
    fixture.detectChanges();
    flushRafs();
    fixture.detectChanges();

    const sheet = query(fixture, '.mj-bottom-sheet') as HTMLElement;
    sheet.dispatchEvent(new Event('transitionend'));
    // jsdom's TransitionEvent lacks propertyName — dispatch a manual event object
    fixture.componentInstance.OnTransitionEnd({
      target: sheet, propertyName: 'transform'
    } as unknown as TransitionEvent);
    fixture.detectChanges();
    expect(sheet.classList.contains('mj-bottom-sheet--settled')).toBe(true);
  });

  it('scrim click closes: emits VisibleChange(false), then Closed after the fallback timer', () => {
    const fixture = render();
    const visibleChanges: boolean[] = [];
    let closed = 0;
    fixture.componentInstance.VisibleChange.subscribe(v => visibleChanges.push(v));
    fixture.componentInstance.Closed.subscribe(() => closed++);

    fixture.componentRef.setInput('Visible', true);
    fixture.detectChanges();
    flushRafs();
    fixture.detectChanges();

    (query(fixture, '.mj-bottom-sheet-scrim') as HTMLElement).click();
    fixture.detectChanges();
    expect(visibleChanges).toEqual([false]);
    expect(closed).toBe(0); // exit transition still "running"

    vi.advanceTimersByTime(350); // reduced-motion fallback path
    fixture.detectChanges();
    expect(closed).toBe(1);
    expect(query(fixture, '.mj-bottom-sheet')).toBeNull();
  });

  it('Escape closes an open sheet and is a no-op when closed', () => {
    const fixture = render();
    let closed = 0;
    fixture.componentInstance.Closed.subscribe(() => closed++);

    fixture.componentInstance.OnEscape();
    vi.advanceTimersByTime(350);
    expect(closed).toBe(0);

    fixture.componentRef.setInput('Visible', true);
    fixture.detectChanges();
    flushRafs();
    fixture.detectChanges();
    fixture.componentInstance.OnEscape();
    vi.advanceTimersByTime(350);
    fixture.detectChanges();
    expect(closed).toBe(1);
  });

  it('restores focus to the pre-open active element on close', () => {
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    const fixture = render();
    fixture.componentRef.setInput('Visible', true);
    fixture.detectChanges();
    flushRafs();
    fixture.detectChanges();
    // sheet takes focus on open
    expect(document.activeElement).toBe(query(fixture, '.mj-bottom-sheet'));

    fixture.componentInstance.Close();
    vi.advanceTimersByTime(350);
    fixture.detectChanges();
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });

  it('is aria-modal with role=dialog', () => {
    const fixture = render();
    fixture.componentRef.setInput('Visible', true);
    fixture.detectChanges();
    const sheet = query(fixture, '.mj-bottom-sheet') as HTMLElement;
    expect(sheet.getAttribute('role')).toBe('dialog');
    expect(sheet.getAttribute('aria-modal')).toBe('true');
  });

  it('locks body scroll while open and restores the prior value on close', () => {
    document.body.style.overflow = 'scroll'; // host page's own inline value
    const fixture = render();
    fixture.componentRef.setInput('Visible', true);
    fixture.detectChanges();
    expect(document.body.style.overflow).toBe('hidden');

    fixture.componentRef.setInput('Visible', false);
    vi.advanceTimersByTime(350);
    fixture.detectChanges();
    expect(document.body.style.overflow).toBe('scroll');
    document.body.style.overflow = '';
  });

  it('unlocks body scroll if destroyed while open', () => {
    const fixture = render();
    fixture.componentRef.setInput('Visible', true);
    fixture.detectChanges();
    expect(document.body.style.overflow).toBe('hidden');
    fixture.destroy();
    expect(document.body.style.overflow).toBe('');
  });

  it('traps Tab within the sheet (cycles first↔last, never escapes)', () => {
    const fixture = render();
    fixture.componentRef.setInput('Visible', true);
    fixture.detectChanges();
    flushRafs();
    fixture.detectChanges();

    // Project two focusable buttons into the content area
    const content = query(fixture, '.mj-bottom-sheet-content') as HTMLElement;
    const first = document.createElement('button');
    const last = document.createElement('button');
    content.appendChild(first);
    content.appendChild(last);

    // Tab from the last focusable wraps to the first
    last.focus();
    const tab = new KeyboardEvent('keydown', { key: 'Tab', cancelable: true });
    fixture.componentInstance.OnSheetKeydown(tab);
    expect(tab.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(first);

    // Shift+Tab from the first wraps to the last
    const shiftTab = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, cancelable: true });
    fixture.componentInstance.OnSheetKeydown(shiftTab);
    expect(shiftTab.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(last);
  });

  it('keeps focus on the sheet when it has no focusable content', () => {
    const fixture = render();
    fixture.componentRef.setInput('Visible', true);
    fixture.detectChanges();
    flushRafs();
    fixture.detectChanges();
    const tab = new KeyboardEvent('keydown', { key: 'Tab', cancelable: true });
    fixture.componentInstance.OnSheetKeydown(tab);
    expect(tab.defaultPrevented).toBe(true);
  });

  it('rapid open→close within the open rAF window stays closed (no resurrected open class)', () => {
    const fixture = render();
    fixture.componentRef.setInput('Visible', true);
    fixture.detectChanges();
    // close BEFORE the two open rAFs have run
    fixture.componentRef.setInput('Visible', false);
    flushRafs();
    vi.advanceTimersByTime(350);
    fixture.detectChanges();
    expect(fixture.componentInstance.IsOpen).toBe(false);
    expect(query(fixture, '.mj-bottom-sheet')).toBeNull();

    // and the NEXT open still animates normally
    fixture.componentRef.setInput('Visible', true);
    fixture.detectChanges();
    flushRafs();
    fixture.detectChanges();
    expect((query(fixture, '.mj-bottom-sheet') as HTMLElement).classList.contains('mj-bottom-sheet--open')).toBe(true);
  });

  it('settles (transform:none class) via the fallback timer when no transitionend fires (reduced motion)', () => {
    const fixture = render();
    fixture.componentRef.setInput('Visible', true);
    fixture.detectChanges();
    flushRafs();
    fixture.detectChanges();
    vi.advanceTimersByTime(350); // no transitionend dispatched — fallback settles
    fixture.detectChanges();
    expect((query(fixture, '.mj-bottom-sheet') as HTMLElement).classList.contains('mj-bottom-sheet--settled')).toBe(true);
  });

  it('closing via the Visible input does NOT re-emit VisibleChange (no loop)', () => {
    const fixture = render();
    const visibleChanges: boolean[] = [];
    fixture.componentInstance.VisibleChange.subscribe(v => visibleChanges.push(v));

    fixture.componentRef.setInput('Visible', true);
    fixture.detectChanges();
    flushRafs();
    fixture.componentRef.setInput('Visible', false);
    vi.advanceTimersByTime(350);
    fixture.detectChanges();
    expect(visibleChanges).toEqual([]);
    expect(query(fixture, '.mj-bottom-sheet')).toBeNull();
  });
});
