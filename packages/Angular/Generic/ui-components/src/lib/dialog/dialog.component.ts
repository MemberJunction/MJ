import {
  Component,
  Input,
  Output,
  EventEmitter,
  HostListener,
  ElementRef,
  ViewChild,
  AfterViewInit,
  OnDestroy,
  inject
} from '@angular/core';

export type MjDialogSize = 'sm' | 'md' | 'lg' | 'xl' | 'auto';

const SIZE_MAP: Record<MjDialogSize, string> = {
  sm: '400px',
  md: '600px',
  lg: '800px',
  xl: '1000px',
  auto: 'auto'
};

/**
 * mj-dialog — Modal dialog component using native `<dialog>` element.
 *
 * Replaces `<kendo-dialog>`.
 *
 * Supports both explicit width/height and size presets.
 * Content is projected, with an optional `<mj-dialog-actions>` for the footer.
 *
 * @example
 * ```html
 * <mj-dialog [Visible]="showDialog" Title="Confirm" (Close)="onClose()">
 *   <p>Are you sure?</p>
 *   <mj-dialog-actions>
 *     <button mjButton variant="primary" (click)="onConfirm()">Yes</button>
 *     <button mjButton (click)="onClose()">No</button>
 *   </mj-dialog-actions>
 * </mj-dialog>
 * ```
 */
@Component({
  selector: 'mj-dialog',
  standalone: true,
  template: `
    @if (Visible) {
      <div class="mj-dialog-backdrop" (click)="OnBackdropClick($event)">
        <div class="mj-dialog-container"
          [attr.role]="Role"
          aria-modal="true"
          [attr.aria-labelledby]="Title ? 'mj-dialog-title-' + dialogId : null"
          [style.width]="resolvedWidth"
          [style.height]="resolvedHeight"
          [style.max-width]="'90vw'"
          [style.max-height]="'90vh'"
          (click)="$event.stopPropagation()">

          <!-- Title bar -->
          @if (Title || Closeable) {
            <div class="mj-dialog-titlebar">
              @if (Title) {
                <h2 class="mj-dialog-title" [id]="'mj-dialog-title-' + dialogId">{{ Title }}</h2>
              }
              <ng-content select="mj-dialog-titlebar"></ng-content>
              @if (Closeable) {
                <button class="mj-dialog-close" (click)="OnCloseClick()" aria-label="Close dialog">
                  <i class="fa-solid fa-times"></i>
                </button>
              }
            </div>
          }

          <!-- Body -->
          <div class="mj-dialog-body">
            <ng-content></ng-content>
          </div>

          <!-- Actions (projected) -->
          <ng-content select="mj-dialog-actions"></ng-content>
        </div>
      </div>
    }
  `
})
export class MJDialogComponent implements OnDestroy {
  private _visible = false;
  private static nextId = 0;

  @Input()
  set Visible(value: boolean) {
    const wasVisible = this._visible;
    this._visible = value;
    if (value && !wasVisible) {
      this.onOpen();
    }
    if (!value && wasVisible) {
      this.onCloseInternal();
    }
  }
  get Visible(): boolean {
    return this._visible;
  }

  @Input() Title = '';
  @Input() Width: number | string | null = null;
  @Input() Height: number | string | null = null;
  @Input() Size: MjDialogSize = 'auto';
  @Input() Closeable = true;
  @Input() MinWidth: number | null = null;

  /**
   * ARIA role for the dialog container. Defaults to `'dialog'`; pass
   * `'alertdialog'` for confirmation / destructive prompts that interrupt the
   * user (per WAI-ARIA, an alertdialog conveys an urgent message requiring a
   * response). Backward compatible — existing callers keep `'dialog'`.
   */
  @Input() Role: 'dialog' | 'alertdialog' = 'dialog';

  @Output() Close = new EventEmitter<void>();

  DialogId = MJDialogComponent.nextId++;

  get dialogId(): number {
    return this.DialogId;
  }

  get resolvedWidth(): string {
    if (this.Width) {
      return typeof this.Width === 'number' ? `${this.Width}px` : this.Width;
    }
    return SIZE_MAP[this.Size] ?? 'auto';
  }

  get resolvedHeight(): string {
    if (this.Height) {
      return typeof this.Height === 'number' ? `${this.Height}px` : this.Height;
    }
    return 'auto';
  }

  @HostListener('document:keydown.escape')
  OnEscapeKey(): void {
    if (this.Visible && this.Closeable) {
      this.OnCloseClick();
    }
  }

  OnBackdropClick(event: Event): void {
    if (this.Closeable) {
      this.OnCloseClick();
    }
  }

  OnCloseClick(): void {
    this.Close.emit();
  }

  private onOpen(): void {
    document.body.style.overflow = 'hidden';
  }

  private onCloseInternal(): void {
    document.body.style.overflow = '';
  }

  ngOnDestroy(): void {
    document.body.style.overflow = '';
  }
}

/**
 * mj-dialog-titlebar — Custom titlebar content for mj-dialog.
 *
 * Replaces `<kendo-dialog-titlebar>`.
 *
 * @example
 * ```html
 * <mj-dialog [Visible]="show" (Close)="onClose()">
 *   <mj-dialog-titlebar>
 *     <i class="fa-solid fa-save"></i> Custom Title
 *   </mj-dialog-titlebar>
 *   <p>Dialog content</p>
 * </mj-dialog>
 * ```
 */
@Component({
  selector: 'mj-dialog-titlebar',
  standalone: true,
  template: `<ng-content></ng-content>`
})
export class MJDialogTitlebarComponent {}

/**
 * mj-dialog-actions — Footer action bar for mj-dialog.
 *
 * Replaces `<kendo-dialog-actions>`.
 *
 * @example
 * ```html
 * <mj-dialog-actions>
 *   <button mjButton variant="primary">Save</button>
 *   <button mjButton>Cancel</button>
 * </mj-dialog-actions>
 * ```
 */
@Component({
  selector: 'mj-dialog-actions',
  standalone: true,
  template: `
    <div class="mj-dialog-actions">
      <ng-content></ng-content>
    </div>
  `
})
export class MJDialogActionsComponent {}
