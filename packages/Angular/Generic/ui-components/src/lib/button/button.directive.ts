import {
  Directive,
  Input,
  Output,
  EventEmitter,
  HostBinding,
  HostListener,
  ElementRef,
  AfterContentInit,
  isDevMode
} from '@angular/core';

export type MjButtonVariant =
  | 'primary'
  | 'secondary'
  | 'outline'
  | 'flat'
  | 'danger'
  | 'icon'
  | 'success'
  | 'warning';

export type MjButtonSize = 'sm' | 'md' | 'lg';

/**
 * mjButton — Attribute directive that styles a native `<button>` or `<a>` element
 * as an MJ-branded button.
 *
 * Uses `--mj-*` design tokens for all colors, ensuring dark-mode support
 * with zero extra CSS.
 *
 * Inputs use lowercase (not PascalCase) per the Phase 2 plan exception for
 * directives — matches HTML attribute convention.
 *
 * Accessibility: an **icon-only** button (`variant="icon"`, no visible text) has no accessible
 * name unless you supply one — set `[ariaLabel]` (or a native `title`). Without a name, screen
 * readers announce it as an unlabeled "button" and DOM/accessibility-tree agents (e.g. computer-use)
 * can't identify it. In dev mode the directive logs a warning for an icon button that ends up with
 * no accessible name.
 *
 * @example
 * ```html
 * <button mjButton variant="primary" (click)="save()">Save</button>
 * <button mjButton variant="outline" size="sm">Cancel</button>
 * <button mjButton variant="icon" ariaLabel="Remove" (click)="remove()"><i class="fa-solid fa-xmark"></i></button>
 * <button mjButton variant="flat" [toggleable]="true" [(selected)]="isActive">Toggle</button>
 * ```
 */
@Directive({
  selector: 'button[mjButton], a[mjButton]',
  standalone: true
})
export class MJButtonDirective implements AfterContentInit {
  @Input() variant: MjButtonVariant = 'secondary';
  @Input() size: MjButtonSize = 'md';
  @Input() toggleable = false;
  @Input() selected = false;
  @Output() selectedChange = new EventEmitter<boolean>();

  // Constructor injection (not inject()) so the directive can be unit-tested via direct
  // instantiation with a stub ElementRef — the established pattern in this package's specs.
  constructor(private readonly host: ElementRef<HTMLElement>) {}

  /**
   * Accessible name for the button, surfaced as `aria-label`. Primarily for **icon-only** buttons
   * (which otherwise have no name). Applied via `setAttribute` only when set, so a directly-authored
   * `aria-label="..."` on the element is never clobbered.
   */
  @Input()
  set ariaLabel(value: string | null | undefined) {
    this._ariaLabel = value ?? undefined;
    if (this._ariaLabel) {
      this.host.nativeElement.setAttribute('aria-label', this._ariaLabel);
    }
  }
  get ariaLabel(): string | undefined {
    return this._ariaLabel;
  }
  private _ariaLabel?: string;

  @HostBinding('class.mj-btn') readonly baseClass = true;

  @HostBinding('class.mj-btn--primary') get isPrimary() { return this.variant === 'primary'; }
  @HostBinding('class.mj-btn--secondary') get isSecondary() { return this.variant === 'secondary'; }
  @HostBinding('class.mj-btn--outline') get isOutline() { return this.variant === 'outline'; }
  @HostBinding('class.mj-btn--flat') get isFlat() { return this.variant === 'flat'; }
  @HostBinding('class.mj-btn--danger') get isDanger() { return this.variant === 'danger'; }
  @HostBinding('class.mj-btn--icon') get isIcon() { return this.variant === 'icon'; }
  @HostBinding('class.mj-btn--success') get isSuccess() { return this.variant === 'success'; }
  @HostBinding('class.mj-btn--warning') get isWarning() { return this.variant === 'warning'; }

  @HostBinding('class.mj-btn--sm') get isSm() { return this.size === 'sm'; }
  @HostBinding('class.mj-btn--lg') get isLg() { return this.size === 'lg'; }

  @HostBinding('class.mj-btn--selected') get isSelected() { return this.toggleable && this.selected; }
  @HostBinding('attr.aria-pressed') get ariaPressed(): string | null {
    return this.toggleable ? String(this.selected) : null;
  }

  @HostListener('click')
  OnClick(): void {
    if (this.toggleable) {
      this.selected = !this.selected;
      this.selectedChange.emit(this.selected);
    }
  }

  /**
   * Dev-only guard: an icon-variant button with no accessible name (no `ariaLabel`/`aria-label`/
   * `aria-labelledby`/`title` and no visible text) is invisible-by-name to screen readers and DOM
   * agents. Warn so it gets a name. No-op in production builds.
   */
  ngAfterContentInit(): void {
    if (!isDevMode() || this.variant !== 'icon') {
      return;
    }
    const el = this.host.nativeElement;
    const hasAccessibleName = !!(
      this._ariaLabel ||
      el.getAttribute('aria-label') ||
      el.getAttribute('aria-labelledby') ||
      el.getAttribute('title') ||
      (el.textContent ?? '').trim().length > 0
    );
    if (!hasAccessibleName) {
      console.warn(
        '[mjButton] icon-only button has no accessible name — add [ariaLabel]="…" (or a title) so ' +
          'screen readers and computer-use agents can identify it.',
        el
      );
    }
  }
}
