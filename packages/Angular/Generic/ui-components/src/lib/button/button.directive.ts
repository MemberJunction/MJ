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
  @Input() Variant: MjButtonVariant = 'secondary';

  /** @deprecated Use {@link Variant}. */
  @Input() set variant(value: MjButtonVariant) {
    this.Variant = value;
  }
  /** @deprecated Use {@link Variant}. */
  get variant(): MjButtonVariant {
    return this.Variant;
  }
  @Input() Size: MjButtonSize = 'md';

  /** @deprecated Use {@link Size}. */
  @Input() set size(value: MjButtonSize) {
    this.Size = value;
  }
  /** @deprecated Use {@link Size}. */
  get size(): MjButtonSize {
    return this.Size;
  }
  @Input() Toggleable = false;

  /** @deprecated Use {@link Toggleable}. */
  @Input() set toggleable(value: MJButtonDirective['Toggleable']) {
    this.Toggleable = value;
  }
  /** @deprecated Use {@link Toggleable}. */
  get toggleable(): MJButtonDirective['Toggleable'] {
    return this.Toggleable;
  }
  @Input() Selected = false;

  /** @deprecated Use {@link Selected}. */
  @Input() set selected(value: MJButtonDirective['Selected']) {
    this.Selected = value;
  }
  /** @deprecated Use {@link Selected}. */
  get selected(): MJButtonDirective['Selected'] {
    return this.Selected;
  }
  @Output() SelectedChange = new EventEmitter<boolean>();

  /**
   * @deprecated Use {@link SelectedChange}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (selectedChange) keeps working. Must stay AFTER SelectedChange: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() selectedChange = this.SelectedChange;

  // Constructor injection (not inject()) so the directive can be unit-tested via direct
  // instantiation with a stub ElementRef — the established pattern in this package's specs.
  constructor(private readonly host: ElementRef<HTMLElement>) {}

  /**
   * Accessible name for the button, surfaced as `aria-label`. Primarily for **icon-only** buttons
   * (which otherwise have no name). Applied via `setAttribute` only when set, so a directly-authored
   * `aria-label="..."` on the element is never clobbered.
   */
  @Input()
  set AriaLabel(value: string | null | undefined) {
    this._ariaLabel = value ?? undefined;
    if (this._ariaLabel) {
      this.host.nativeElement.setAttribute('aria-label', this._ariaLabel);
    }
  }
  get AriaLabel(): string | undefined {
    return this._ariaLabel;
  }

  /** @deprecated Use {@link AriaLabel}. */
  get ariaLabel(): string | undefined {
    return this.AriaLabel;
  }
  /** @deprecated Use {@link AriaLabel}. */
  @Input() set ariaLabel(value: string | null | undefined) {
    this.AriaLabel = value;
  }
  private _ariaLabel?: string;

  @HostBinding('class.mj-btn') readonly baseClass = true;

  @HostBinding('class.mj-btn--primary') get isPrimary() { return this.Variant === 'primary'; }
  @HostBinding('class.mj-btn--secondary') get isSecondary() { return this.Variant === 'secondary'; }
  @HostBinding('class.mj-btn--outline') get isOutline() { return this.Variant === 'outline'; }
  @HostBinding('class.mj-btn--flat') get isFlat() { return this.Variant === 'flat'; }
  @HostBinding('class.mj-btn--danger') get isDanger() { return this.Variant === 'danger'; }
  @HostBinding('class.mj-btn--icon') get isIcon() { return this.Variant === 'icon'; }
  @HostBinding('class.mj-btn--success') get isSuccess() { return this.Variant === 'success'; }
  @HostBinding('class.mj-btn--warning') get isWarning() { return this.Variant === 'warning'; }

  @HostBinding('class.mj-btn--sm') get isSm() { return this.Size === 'sm'; }
  @HostBinding('class.mj-btn--lg') get isLg() { return this.Size === 'lg'; }

  @HostBinding('class.mj-btn--selected') get isSelected() { return this.Toggleable && this.Selected; }
  @HostBinding('attr.aria-pressed') get ariaPressed(): string | null {
    return this.Toggleable ? String(this.Selected) : null;
  }

  @HostListener('click')
  OnClick(): void {
    if (this.Toggleable) {
      this.Selected = !this.Selected;
      this.SelectedChange.emit(this.Selected);
    }
  }

  /**
   * Dev-only guard: an icon-variant button with no accessible name (no `ariaLabel`/`aria-label`/
   * `aria-labelledby`/`title` and no visible text) is invisible-by-name to screen readers and DOM
   * agents. Warn so it gets a name. No-op in production builds.
   */
  ngAfterContentInit(): void {
    if (!isDevMode() || this.Variant !== 'icon') {
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
