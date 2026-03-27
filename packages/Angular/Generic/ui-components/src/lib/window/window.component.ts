import { Component, Input, Output, EventEmitter, HostListener, OnDestroy } from '@angular/core';

/**
 * mj-window — Floating window panel. Replaces `<kendo-window>`.
 *
 * Unlike mj-dialog, this does NOT have a backdrop and does NOT block interaction
 * with the rest of the page. It's a floating panel, similar to Kendo's Window.
 *
 * @example
 * ```html
 * <mj-window [Visible]="showWindow" Title="Details" [Width]="600" (Close)="onClose()">
 *   <p>Window content</p>
 * </mj-window>
 * ```
 */
@Component({
  selector: 'mj-window',
  standalone: true,
  template: `
    @if (Visible) {
      <div class="mj-window"
        [style.width]="resolvedWidth"
        [style.height]="resolvedHeight"
        role="dialog"
        [attr.aria-labelledby]="Title ? 'mj-window-title-' + WindowId : null">

        <div class="mj-window-titlebar">
          @if (Title) {
            <h3 class="mj-window-title" [id]="'mj-window-title-' + WindowId">{{ Title }}</h3>
          }
          <ng-content select="mj-window-titlebar"></ng-content>
          <button class="mj-window-close" (click)="OnCloseClick()" aria-label="Close window">
            <i class="fa-solid fa-times"></i>
          </button>
        </div>

        <div class="mj-window-body">
          <ng-content></ng-content>
        </div>

        <ng-content select="mj-window-actions"></ng-content>
      </div>
    }
  `
})
export class MjWindowComponent implements OnDestroy {
  private _visible = false;
  private static nextId = 0;

  @Input()
  set Visible(value: boolean) { this._visible = value; }
  get Visible(): boolean { return this._visible; }

  @Input() Title = '';
  @Input() Width: number | string | null = null;
  @Input() Height: number | string | null = null;

  @Output() Close = new EventEmitter<void>();

  WindowId = MjWindowComponent.nextId++;

  get resolvedWidth(): string {
    if (this.Width) return typeof this.Width === 'number' ? `${this.Width}px` : this.Width;
    return '500px';
  }

  get resolvedHeight(): string {
    if (this.Height) return typeof this.Height === 'number' ? `${this.Height}px` : this.Height;
    return 'auto';
  }

  @HostListener('document:keydown.escape')
  OnEscapeKey(): void {
    if (this.Visible) this.OnCloseClick();
  }

  OnCloseClick(): void {
    this.Close.emit();
  }

  ngOnDestroy(): void {}
}

/**
 * mj-window-titlebar — Custom titlebar for mj-window. Replaces `<kendo-window-titlebar>`.
 */
@Component({
  selector: 'mj-window-titlebar',
  standalone: true,
  template: `<ng-content></ng-content>`
})
export class MjWindowTitlebarComponent {}

/**
 * mj-window-actions — Footer actions for mj-window.
 */
@Component({
  selector: 'mj-window-actions',
  standalone: true,
  template: `<div class="mj-window-actions"><ng-content></ng-content></div>`
})
export class MjWindowActionsComponent {}
