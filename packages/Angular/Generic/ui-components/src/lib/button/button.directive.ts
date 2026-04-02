import {
  Directive,
  Input,
  Output,
  EventEmitter,
  HostBinding,
  HostListener
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
 * @example
 * ```html
 * <button mjButton variant="primary" (click)="save()">Save</button>
 * <button mjButton variant="outline" size="sm">Cancel</button>
 * <button mjButton variant="flat" [toggleable]="true" [(selected)]="isActive">Toggle</button>
 * ```
 */
@Directive({
  selector: 'button[mjButton], a[mjButton]',
  standalone: true
})
export class MJButtonDirective {
  @Input() variant: MjButtonVariant = 'secondary';
  @Input() size: MjButtonSize = 'md';
  @Input() toggleable = false;
  @Input() selected = false;
  @Output() selectedChange = new EventEmitter<boolean>();

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
}
