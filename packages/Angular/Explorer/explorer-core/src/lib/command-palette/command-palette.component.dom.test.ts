import { describe, it, expect, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { BehaviorSubject } from 'rxjs';
import { query } from '@memberjunction/ng-test-utils';
import { CommandPaletteComponent } from './command-palette.component';
import { CommandPaletteService } from './command-palette.service';
import { ApplicationManager } from '@memberjunction/ng-base-application';

/**
 * DOM coverage for <mj-command-palette> — a modal palette gated on `CommandPaletteService.IsOpen`.
 * It reads `appManager.AllApplications` and calls `service.Close()`; both are faked. `IsOpen` is a
 * BehaviorSubject we control. `detectChanges(false)`+`markForCheck` because the IsOpen subscription
 * flips the `@if (IsOpen)` overlay via plain-property mutation, and the search box uses ngModel.
 */

function render(open: boolean): {
  fixture: ComponentFixture<CommandPaletteComponent>;
  close: ReturnType<typeof vi.fn>;
  isOpen$: BehaviorSubject<boolean>;
} {
  const isOpen$ = new BehaviorSubject<boolean>(open);
  const close = vi.fn();
  TestBed.configureTestingModule({
    imports: [FormsModule],
    declarations: [CommandPaletteComponent],
    providers: [
      { provide: CommandPaletteService, useValue: { IsOpen: isOpen$, Close: close } },
      // AllApplications is an Observable (the component .pipe()s it), not a plain array.
      { provide: ApplicationManager, useValue: { AllApplications: new BehaviorSubject([]) } },
    ],
  });
  const fixture = TestBed.createComponent(CommandPaletteComponent);
  fixture.detectChanges(false);
  fixture.componentRef.changeDetectorRef.markForCheck();
  fixture.detectChanges(false);
  return { fixture, close, isOpen$ };
}

/** Re-run change detection the way `render` does, after flipping IsOpen. */
function settle(fixture: ComponentFixture<CommandPaletteComponent>): void {
  fixture.componentRef.changeDetectorRef.markForCheck();
  fixture.detectChanges(false);
}

function press(key: string, target: Element, init: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
  Object.defineProperty(event, 'target', { value: target });
  return event;
}

describe('CommandPaletteComponent (DOM)', () => {
  it('renders nothing when the palette is closed', () => {
    const { fixture } = render(false);
    expect(query(fixture, '.command-palette-modal')).toBeNull();
    expect(query(fixture, '.command-palette-backdrop')).toBeNull();
  });

  it('renders the modal with a search input when open', () => {
    const { fixture } = render(true);
    expect(query(fixture, '.command-palette-modal')).not.toBeNull();
    expect(query(fixture, 'input.search-input')).not.toBeNull();
  });

  it('closes via the service when the backdrop is clicked', () => {
    const { fixture, close } = render(true);
    (query(fixture, '.command-palette-backdrop') as HTMLElement).click();
    expect(close).toHaveBeenCalled();
  });

  // ── dialog focus behavior (WCAG 2.4.3 / 2.1.2) ─────────────────────────────
  // The palette already carried role="dialog" + aria-modal; these cover the half
  // that aria-modal does NOT provide — Tab containment and focus restoration.

  it('carries dialog semantics with an accessible name', () => {
    const { fixture } = render(true);
    const modal = query(fixture, '.command-palette-modal') as HTMLElement;
    expect(modal.getAttribute('role')).toBe('dialog');
    expect(modal.getAttribute('aria-modal')).toBe('true');
    expect(modal.getAttribute('aria-label')).toBeTruthy();
  });

  it('moves focus into the search input when it opens', async () => {
    // onOpen() focuses on a 100ms timeout so the @if-rendered input exists first.
    vi.useFakeTimers();
    try {
      const { fixture } = render(true);
      vi.advanceTimersByTime(150);
      expect(document.activeElement).toBe(query(fixture, 'input.search-input'));
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps Tab inside the dialog instead of letting focus escape to the page', () => {
    const { fixture } = render(true);
    const input = query(fixture, 'input.search-input') as HTMLInputElement;
    input.focus();

    // The input is the only focusable element in an empty palette, so a forward Tab
    // must wrap back onto it rather than walking out into the page behind the modal.
    const forward = press('Tab', input);
    fixture.componentInstance.HandleKeyDown(forward);
    expect(forward.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(input);

    const backward = press('Tab', input, { shiftKey: true });
    fixture.componentInstance.HandleKeyDown(backward);
    expect(backward.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(input);
  });

  it('closes on Escape', () => {
    const { fixture, close } = render(true);
    const input = query(fixture, 'input.search-input') as HTMLElement;
    fixture.componentInstance.HandleKeyDown(press('Escape', input));
    expect(close).toHaveBeenCalled();
  });

  it('returns focus to the element that was focused when it opened', () => {
    const invoker = document.createElement('button');
    document.body.appendChild(invoker);
    try {
      invoker.focus();
      expect(document.activeElement).toBe(invoker);

      const { fixture, isOpen$ } = render(true);
      // Palette has taken over; closing must hand focus back to the invoker rather
      // than dropping it to <body>, which would restart the user's next Tab at the top.
      (query(fixture, 'input.search-input') as HTMLElement).focus();

      isOpen$.next(false);
      settle(fixture);
      expect(document.activeElement).toBe(invoker);
    } finally {
      invoker.remove();
    }
  });

  it('does not throw when the invoker was removed while the palette was open', () => {
    const invoker = document.createElement('button');
    document.body.appendChild(invoker);
    invoker.focus();

    const { fixture, isOpen$ } = render(true);
    // Selecting an app tears down the tab the invoker lived in — focusing a detached
    // node silently drops focus to <body>, so onClose() must skip it.
    invoker.remove();

    expect(() => {
      isOpen$.next(false);
      settle(fixture);
    }).not.toThrow();
  });
});
