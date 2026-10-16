import { describe, it, expect, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { BehaviorSubject } from 'rxjs';
import { query } from '@memberjunction/ng-test-utils';
import { CommandPaletteComponent } from './command-palette.component';
import { CommandPaletteService } from './command-palette.service';
import { ApplicationManager, BaseApplication } from '@memberjunction/ng-base-application';
import { MJEmptyStateComponent } from '@memberjunction/ng-ui-components';

/**
 * DOM coverage for <mj-command-palette> — a modal palette gated on `CommandPaletteService.IsOpen`.
 * It reads `appManager.Applications` and calls `service.Close()`; both are faked. `IsOpen` is a
 * BehaviorSubject we control. `detectChanges(false)`+`markForCheck` because the IsOpen subscription
 * flips the `@if (IsOpen)` overlay via plain-property mutation, and the search box uses ngModel.
 */

/** The two app lists the manager exposes: the user's own apps, and every app in the system. */
interface AppLists {
  mine: BaseApplication[];
  all: BaseApplication[];
}

function fakeApp(name: string): BaseApplication {
  return { ID: name, Name: name, Description: '', Icon: 'fa-solid fa-cube', GetColor: () => '' } as unknown as BaseApplication;
}

function render(open: boolean, apps: AppLists = { mine: [], all: [] }, showSearch = false): {
  fixture: ComponentFixture<CommandPaletteComponent>;
  close: ReturnType<typeof vi.fn>;
  isOpen$: BehaviorSubject<boolean>;
} {
  const isOpen$ = new BehaviorSubject<boolean>(open);
  const close = vi.fn();
  TestBed.configureTestingModule({
    // The empty state renders whenever a typed query matches no app.
    imports: [FormsModule, MJEmptyStateComponent],
    declarations: [CommandPaletteComponent],
    providers: [
      { provide: CommandPaletteService, useValue: { IsOpen: isOpen$, Close: close } },
      // Both are Observables (the component .pipe()s them), not plain arrays.
      {
        provide: ApplicationManager,
        useValue: { Applications: new BehaviorSubject(apps.mine), AllApplications: new BehaviorSubject(apps.all) },
      },
    ],
  });
  const fixture = TestBed.createComponent(CommandPaletteComponent);
  fixture.componentInstance.ShowSearch = showSearch;
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

/** Type into the search box the way the (input) binding does. */
function typeQuery(fixture: ComponentFixture<CommandPaletteComponent>, text: string): void {
  fixture.componentInstance.SearchQuery = text;
  fixture.componentInstance.OnSearchChange();
  settle(fixture);
}

function searchRow(fixture: ComponentFixture<CommandPaletteComponent>): HTMLElement | null {
  return query(fixture, '.result-item-action') as HTMLElement | null;
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

  it("lists only the user's own apps, the same list Home and the app switcher show", () => {
    const home = fakeApp('Home');
    const chat = fakeApp('Chat');
    const admin = fakeApp('Admin');
    const { fixture } = render(true, { mine: [home, chat], all: [home, chat, admin] });
    const names = Array.from(fixture.nativeElement.querySelectorAll('.result-name')).map((el) => (el as HTMLElement).textContent?.trim());
    expect(names).toEqual(['Home', 'Chat']);
  });

  // ── search row: only when the host has search turned on ────────────────────

  it('offers no search row while search is off', () => {
    const { fixture } = render(true, { mine: [], all: [] }, false);
    typeQuery(fixture, 'test');
    expect(searchRow(fixture)).toBeNull();
  });

  it('does not start a search on Enter while search is off', () => {
    const { fixture } = render(true, { mine: [], all: [] }, false);
    const requested = vi.fn();
    fixture.componentInstance.KnowledgeSearchRequested.subscribe(requested);
    typeQuery(fixture, 'test');
    const input = query(fixture, 'input.search-input') as HTMLElement;
    fixture.componentInstance.HandleKeyDown(press('ArrowDown', input));
    fixture.componentInstance.HandleKeyDown(press('Enter', input));
    expect(requested).not.toHaveBeenCalled();
  });

  it('offers "Search everything" for the typed text while search is on', () => {
    const { fixture } = render(true, { mine: [], all: [] }, true);
    const requested = vi.fn();
    fixture.componentInstance.KnowledgeSearchRequested.subscribe(requested);
    typeQuery(fixture, 'test');

    const row = searchRow(fixture);
    expect(row?.querySelector('.result-name')?.textContent?.trim()).toBe('Search everything');
    row?.click();
    expect(requested).toHaveBeenCalledWith('test');
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

  it('wraps focus at both ends of the dialog rather than leaving it', () => {
    // The trap above is real but degenerate on its own: an empty palette has exactly ONE
    // focusable element, so first === last and either branch looks identical. Add a second
    // one so the two wrap directions are actually distinguishable.
    const { fixture } = render(true);
    const modal = query(fixture, '.command-palette-modal') as HTMLElement;
    const input = query(fixture, 'input.search-input') as HTMLInputElement;
    const tail = document.createElement('button');
    modal.appendChild(tail);

    // Shift+Tab off the FIRST element wraps to the last.
    input.focus();
    const back = press('Tab', input, { shiftKey: true });
    fixture.componentInstance.HandleKeyDown(back);
    expect(back.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(tail);

    // Tab off the LAST element wraps to the first.
    const fwd = press('Tab', tail);
    fixture.componentInstance.HandleKeyDown(fwd);
    expect(fwd.defaultPrevented).toBe(true);
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
