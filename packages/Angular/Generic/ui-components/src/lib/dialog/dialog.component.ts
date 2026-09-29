import {
  Component,
  Input,
  Output,
  EventEmitter,
  HostListener,
  ElementRef,
  OnDestroy
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
 * On open, focus moves to `[data-autofocus]`, else the first field in the body,
 * else the first button in the body or actions (never the ✕), else the container.
 * Tab cycles inside the dialog, and focus returns to the trigger on close.
 * `AutoFocus`, `TrapFocus`, and `RestoreFocus` each default on so a dialog that
 * manages focus itself can turn that one behavior off.
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
          tabindex="-1"
          [attr.aria-labelledby]="Title ? 'mj-dialog-title-' + dialogId : null"
          [attr.aria-label]="Title ? null : (AriaLabel || null)"
          [style.width]="resolvedWidth"
          [style.height]="resolvedHeight"
          [style.max-width]="'90vw'"
          [style.max-height]="'90vh'"
          (keydown)="OnTabKey($event)"
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
  private readonly host: ElementRef<HTMLElement>;
  private _visible = false;
  /** Element that held focus when the dialog opened; restored on close. */
  private previouslyFocused: HTMLElement | null = null;
  /** Deferred until the `@if (Visible)` container is actually in the DOM. */
  private initialFocusTimer: number | null = null;
  private static nextId = 0;

  private static readonly TAB_STOP_SELECTOR = 'a[href], button, input, select, textarea, [tabindex]';

  constructor(host: ElementRef<HTMLElement>) {
    this.host = host;
  }

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

  /** Move focus into the dialog when it opens. Off when the dialog focuses itself. */
  @Input() AutoFocus = true;

  /** Keep Tab / Shift+Tab inside the dialog, including the ✕. */
  @Input() TrapFocus = true;

  /** Return focus to the element that was focused when the dialog opened. */
  @Input() RestoreFocus = true;

  /**
   * Accessible name (`aria-label`) used only when {@link Title} is empty.
   * A set Title keeps `aria-labelledby` and does not also set `aria-label`.
   */
  @Input() AriaLabel: string | null = null;

  @Output() Close = new EventEmitter<void>();

  DialogId = MJDialogComponent.nextId++;

  get dialogId(): number {  // case-violation-ok-legacy-back-compat: the PascalCase name is already taken in this scope
    return this.DialogId;
  }

  get ResolvedWidth(): string {
    if (this.Width) {
      return typeof this.Width === 'number' ? `${this.Width}px` : this.Width;
    }
    return SIZE_MAP[this.Size] ?? 'auto';
  }

  /** @deprecated Use {@link ResolvedWidth}. */
  get resolvedWidth(): string {
    return this.ResolvedWidth;
  }

  get ResolvedHeight(): string {
    if (this.Height) {
      return typeof this.Height === 'number' ? `${this.Height}px` : this.Height;
    }
    return 'auto';
  }

  /** @deprecated Use {@link ResolvedHeight}. */
  get resolvedHeight(): string {
    return this.ResolvedHeight;
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

  /**
   * Cycles Tab within the container. With no enabled control, focus stays on
   * the container (it is `tabindex="-1"`, so it is not itself a tab stop).
   */
  OnTabKey(event: KeyboardEvent): void {
    if (event.key !== 'Tab' || !this.TrapFocus || !this.Visible) return;
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const container = event.currentTarget;
    if (!(container instanceof HTMLElement)) return;

    const stops = this.tabStops(container);
    event.preventDefault();
    if (stops.length === 0) {
      container.focus();
      return;
    }

    const active = document.activeElement;
    const index = active instanceof HTMLElement ? stops.indexOf(active) : -1;
    // Shift+Tab from the first stop, or from the container (not a stop), wraps to the last.
    const nextIndex = event.shiftKey
      ? (index <= 0 ? stops.length - 1 : index - 1)
      : (index < 0 || index >= stops.length - 1 ? 0 : index + 1);
    stops[nextIndex].focus();
  }

  ngOnDestroy(): void {
    this.clearInitialFocusTimer();
    if (this._visible) {
      this.restoreFocus();
    }
    document.body.style.overflow = '';
  }

  private onOpen(): void {
    document.body.style.overflow = 'hidden';
    const active = document.activeElement;
    this.previouslyFocused = active instanceof HTMLElement ? active : null;
    if (this.AutoFocus) {
      this.scheduleInitialFocus();
    }
  }

  private onCloseInternal(): void {
    document.body.style.overflow = '';
    this.clearInitialFocusTimer();
    this.restoreFocus();
  }

  private scheduleInitialFocus(): void {
    this.clearInitialFocusTimer();
    // The Visible setter runs before `@if` inserts `.mj-dialog-container`.
    this.initialFocusTimer = window.setTimeout(() => {
      this.initialFocusTimer = null;
      this.focusInitial();
    }, 0);
  }

  private clearInitialFocusTimer(): void {
    if (this.initialFocusTimer === null) return;
    window.clearTimeout(this.initialFocusTimer);
    this.initialFocusTimer = null;
  }

  private focusInitial(): void {
    if (!this._visible || !this.AutoFocus) return;
    const container = this.containerElement();
    if (!container) return;
    this.initialFocusTarget(container).focus();
  }

  private initialFocusTarget(container: HTMLElement): HTMLElement {
    const marked = this.firstEnabled(container.querySelectorAll<HTMLElement>('[data-autofocus]'));
    if (marked) return marked;

    const field = this.firstEnabled(container.querySelectorAll<HTMLElement>(
      '.mj-dialog-body input, .mj-dialog-body select, .mj-dialog-body textarea',
    ));
    if (field) return field;

    const button = this.firstEnabled(
      container.querySelectorAll<HTMLElement>('.mj-dialog-body button, .mj-dialog-actions button'),
      true,
    );
    if (button) return button;

    return container;
  }

  /** First element that can take focus. The ✕ is skipped only for the button fallback. */
  private firstEnabled(nodes: NodeListOf<HTMLElement>, skipClose = false): HTMLElement | null {
    for (const el of Array.from(nodes)) {
      if (skipClose && el.classList.contains('mj-dialog-close')) continue;
      if (this.isDisabled(el)) continue;
      if (el instanceof HTMLInputElement && el.type === 'hidden') continue;
      return el;
    }
    return null;
  }

  private restoreFocus(): void {
    const target = this.previouslyFocused;
    this.previouslyFocused = null;
    if (!this.RestoreFocus) return;
    // The trigger is outside the dialog. An element inside this host is about to be removed.
    if (target && target !== document.body && document.contains(target) && !this.host.nativeElement.contains(target)) {
      target.focus();
      return;
    }
    this.focusDocumentBody();
  }

  /** `document.body.focus()` is a no-op unless body is a focusable area; blur lands on body. */
  private focusDocumentBody(): void {
    const active = document.activeElement;
    if (active instanceof HTMLElement && active !== document.body) {
      active.blur();
    }
    if (document.activeElement !== document.body) {
      document.body.focus();
    }
  }

  private containerElement(): HTMLElement | null {
    const found = this.host.nativeElement.querySelector('.mj-dialog-container');
    return found instanceof HTMLElement ? found : null;
  }

  private tabStops(container: HTMLElement): HTMLElement[] {
    return Array.from(container.querySelectorAll<HTMLElement>(MJDialogComponent.TAB_STOP_SELECTOR)).filter((el) =>
      this.isTabStop(el),
    );
  }

  /** Real controls only. `tabindex="-1"` (including the container) is the fallback, not a stop. */
  private isTabStop(el: HTMLElement): boolean {
    if (el.getAttribute('tabindex') === '-1') return false;
    if (this.isDisabled(el)) return false;
    if (el instanceof HTMLInputElement && el.type === 'hidden') return false;
    return true;
  }

  private isDisabled(el: HTMLElement): boolean {
    if (
      el instanceof HTMLButtonElement ||
      el instanceof HTMLInputElement ||
      el instanceof HTMLSelectElement ||
      el instanceof HTMLTextAreaElement ||
      el instanceof HTMLFieldSetElement ||
      el instanceof HTMLOptGroupElement ||
      el instanceof HTMLOptionElement
    ) {
      return el.disabled;
    }
    return el.hasAttribute('disabled');
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
