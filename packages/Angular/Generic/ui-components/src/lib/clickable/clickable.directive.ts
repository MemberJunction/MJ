import {
  Directive,
  Input,
  HostBinding,
  HostListener,
  ElementRef,
  AfterContentInit,
  isDevMode
} from '@angular/core';

export type MjClickableRole = 'button' | 'link';

/**
 * mjClickable — Attribute directive that upgrades a non-semantic element (a `<div>`/`<span>` that
 * has a `(click)` handler) into a proper, accessible, keyboard-operable control **without changing
 * its tag or styling**.
 *
 * ## Why this exists
 * A `<div (click)="…">` is invisible as a control to anyone (and anything) that consumes the
 * **accessibility tree** rather than pixels:
 *  - screen-reader and keyboard users can't reach or operate it (no role, no focus, no Enter/Space);
 *  - DOM/accessibility-tree AI agents (e.g. computer-use driving a live browser) can't enumerate it
 *    as a clickable or find it by name — it resolves to `role=generic` with no accessible name.
 *
 * Converting such a `<div>` to a native `<button>` is the ideal fix, but often forces CSS churn for
 * already-styled tiles/rows. `mjClickable` is the low-risk alternative: it keeps the element and its
 * styles, and adds the missing semantics — `role`, `tabindex`, an accessible name (`aria-label`),
 * Enter/Space activation (which dispatches a native `click`, so your existing `(click)` handler runs
 * for both mouse and keyboard), and an optional stable `data-testid` automation hook.
 *
 * Prefer a real `<button mjButton>`/`<a>` for NEW markup; reach for `mjClickable` to retrofit existing
 * clickable `<div>`/`<span>` widgets (nav tiles, list rows, cards) cheaply.
 *
 * @example
 * ```html
 * <!-- Retrofit a clickable app tile: stays a styled <div>, becomes a named, keyboard-operable button -->
 * <div class="app-card" [mjClickable]="app.Name" [testId]="'app-tile-' + app.Name" (click)="open(app)">
 *   …icon + name + description…
 * </div>
 *
 * <!-- A navigation-style row -->
 * <div class="nav-item" [mjClickable]="item.Label" role="link" (click)="navigate(item)">…</div>
 * ```
 */
@Directive({
  selector: '[mjClickable]',
  standalone: true
})
export class MJClickableDirective implements AfterContentInit {
  /**
   * Accessible name for the control, surfaced as `aria-label`. Pass the human-meaningful label
   * (e.g. the app/nav-item name). Strongly recommended — without it the control is operable but
   * unnamed, so agents/AT can reach it but can't identify it. When omitted, the element's own
   * visible text becomes the name (fine when the text alone is unambiguous).
   */
  @Input('mjClickable') label: string | null | undefined = '';

  /** ARIA role to expose. `'button'` (default) for actions, `'link'` for navigation-like targets. */
  @Input() role: MjClickableRole = 'button';

  /** Optional stable automation/test hook emitted as `data-testid` (no convention enforced here). */
  @Input() testId?: string;

  /** Set `false` to skip making the element keyboard-focusable (rare; e.g. focus handled elsewhere). */
  @Input() focusable = true;

  // Constructor injection (not inject()) so the directive can be unit-tested via direct
  // instantiation with a stub ElementRef — the established pattern in this package's specs.
  constructor(private readonly host: ElementRef<HTMLElement>) {}

  @HostBinding('attr.role') get roleAttr(): string {
    return this.role;
  }
  @HostBinding('attr.tabindex') get tabIndexAttr(): string | null {
    return this.focusable ? '0' : null;
  }
  @HostBinding('attr.aria-label') get ariaLabelAttr(): string | null {
    return this.label?.trim() ? this.label.trim() : null;
  }
  @HostBinding('attr.data-testid') get testIdAttr(): string | null {
    return this.testId ?? null;
  }

  /**
   * Keyboard activation: Enter / Space activate a `role="button"`/`"link"` exactly as they would a
   * native control. We `preventDefault` (Space would otherwise scroll the page) and dispatch a native
   * `click`, so the element's existing `(click)` binding handles both mouse and keyboard with no
   * duplicate wiring.
   */
  @HostListener('keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
      event.preventDefault();
      this.host.nativeElement.click();
    }
  }

  /** Dev-only guard: warn when the control ends up with no accessible name. No-op in production. */
  ngAfterContentInit(): void {
    if (!isDevMode()) {
      return;
    }
    const hasName = !!(this.label?.trim() || (this.host.nativeElement.textContent ?? '').trim());
    if (!hasName) {
      console.warn(
        '[mjClickable] element has no accessible name — pass mjClickable="<name>" so screen readers ' +
          'and computer-use agents can identify it.',
        this.host.nativeElement
      );
    }
  }
}
