import { Component, EventEmitter, Input, Output } from '@angular/core';
import { MJButtonDirective } from '../button/button.directive';

/**
 * mj-refresh-button — Canonical Refresh button for the `[actions]` slot of
 * `<mj-page-header>`. Encapsulates the icon + spin-on-loading behavior so
 * pages don't reinvent it every time.
 *
 * Replaces the repeated:
 * ```html
 * <button mjButton variant="secondary" size="sm" (click)="LoadData()" [disabled]="IsLoading" title="Refresh">
 *   <i class="fa-solid fa-arrows-rotate" [class.fa-spin]="IsLoading"></i> Refresh
 * </button>
 * ```
 *
 * Usage:
 * ```html
 * <mj-refresh-button [Loading]="IsLoading" (Clicked)="LoadData()" />
 *
 * <mj-refresh-button [Loading]="IsLoading" (Clicked)="Refresh()" [ShowLabel]="false" />   <!-- icon-only -->
 * ```
 *
 * The `Loading` input drives both the spinner AND the disabled state — pass
 * the page's `IsLoading` flag and you're done.
 */
@Component({
  selector: 'mj-refresh-button',
  standalone: true,
  imports: [MJButtonDirective],
  template: `
    <button
      type="button"
      mjButton
      [variant]="Variant"
      [size]="Size"
      [disabled]="Disabled || Loading"
      [attr.title]="Title"
      [attr.aria-label]="Title"
      (click)="OnClick($event)">
      <i class="fa-solid fa-arrows-rotate" [class.fa-spin]="Loading" aria-hidden="true"></i>
      @if (ShowLabel) {
        <span class="mj-refresh-button__label">{{ Label }}</span>
      }
    </button>
  `,
  styles: [`
    :host { display: inline-flex; }

    /* Icon-only on mobile — the spinning arrows + aria-label carry it; the
       text just costs width in the compact chrome control row. */
    @media (max-width: 768px) {
      .mj-refresh-button__label {
        display: none;
      }
    }
  `]
})
export class MJRefreshButtonComponent {
  /** When true, the icon spins and the button is disabled. Pass `IsLoading` from the page. */
  @Input() Loading: boolean = false;

  /** Force-disable independently of `Loading`. */
  @Input() Disabled: boolean = false;

  /** Visible button text. Defaults to "Refresh". Use `[ShowLabel]="false"` for icon-only. */
  @Input() Label: string = 'Refresh';

  /** Hover/aria tooltip. Defaults to "Refresh". */
  @Input() Title: string = 'Refresh';

  /** Show the text label next to the icon. Defaults to true. */
  @Input() ShowLabel: boolean = true;

  /** Button variant passed to mjButton. Defaults to 'secondary'. */
  @Input() Variant: 'primary' | 'secondary' | 'outline' | 'flat' | 'icon' = 'secondary';

  /** Button size passed to mjButton. Defaults to 'sm' to match page-header density. */
  @Input() Size: 'sm' | 'md' | 'lg' = 'sm';

  /** Emitted when the button is clicked AND the button isn't disabled/loading. */
  @Output() Clicked = new EventEmitter<MouseEvent>();

  OnClick(event: MouseEvent): void {
    if (this.Disabled || this.Loading) return;
    this.Clicked.emit(event);
  }
}
