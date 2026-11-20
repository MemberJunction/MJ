import {
  Component, Input, Output, EventEmitter, OnInit, OnDestroy,
  ChangeDetectorRef, ChangeDetectionStrategy, HostListener, ElementRef, NgZone
} from '@angular/core';
import { CaptureFocusedElement, FirstEnabledElement, GetTabStops, RestoreFocusTo, WrapTabAtEnds } from '../shared/modal-focus';

/** Display mode for the slide panel container. */
export type SlidePanelMode = 'slide' | 'dialog';

/**
 * Generic slide-in / centered-dialog panel primitive.
 *
 * - `Mode='slide'` → slides in from the right edge, full viewport height, optionally resizable.
 * - `Mode='dialog'` → centered modal card.
 *
 * Pure chrome: it owns the backdrop, open/close animation, resize handle, optional
 * title bar, and content projection. It performs no data work and has no routing.
 * Consumers project their content and handle Save/close via the projected UI and the
 * `Closed` output.
 *
 * The panel is a modal dialog for assistive technology: `role="dialog"` with `aria-modal`, named
 * by its `Title` (or `AriaLabel` when there is no title). On open, focus moves to the first control
 * inside it (or the panel itself), Tab stays inside it, and on close focus returns to the element
 * that held it before. A closed panel is `inert`, so it cannot be reached while off screen.
 *
 * @example
 * ```html
 * <mj-slide-panel [Visible]="open" Title="Details" (Closed)="open = false">
 *   <my-content></my-content>
 * </mj-slide-panel>
 * ```
 */
@Component({
  standalone: true,
  selector: 'mj-slide-panel',
  templateUrl: './slide-panel.component.html',
  styleUrls: ['./slide-panel.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MjSlidePanelComponent implements OnInit, OnDestroy {
  @Input() Mode: SlidePanelMode = 'slide';
  @Input() Title = '';
  /** Accessible name when the panel has no `Title`. */
  @Input() AriaLabel = '';

  @Input()
  set Visible(value: boolean) {
    const changed = this._visible !== value;
    this._visible = value;
    if (changed && this.initialized) {
      if (value) {
        this.showPanel();
      } else {
        this.IsVisible = false;
        this.cdr.markForCheck();
        this.returnFocus();
      }
    }
  }
  get Visible(): boolean {
    return this._visible;
  }
  private _visible = true;
  private initialized = false;

  @Input() Resizable = true;
  @Input() MinWidthPx = 400;
  @Input() MaxWidthRatio = 0.92;

  /** Initial width in pixels. Defaults to 65% of viewport for slide, 800px for dialog. */
  @Input()
  set WidthPx(value: number) {
    this._widthPx = value;
  }
  get WidthPx(): number {
    return this._widthPx;
  }

  @Output() Closed = new EventEmitter<void>();
  @Output() WidthChanged = new EventEmitter<number>();

  /**
   * Optional guard called before any close gesture (X button, backdrop click, Escape).
   * Return `false` to cancel the close — e.g., when an in-progress operation is running.
   * The panel itself never shows a dialog; the consumer is responsible for any confirmation UI.
   */
  @Input() CanClose: (() => boolean) | null = null;

  public IsVisible = false;
  private _widthPx = 0;

  private static nextId = 0;
  /** Id of the title, which names the dialog. */
  public readonly TitleId = `mj-slide-panel-title-${++MjSlidePanelComponent.nextId}`;
  /** The element that held focus when the panel opened; focus returns there on close. */
  private previouslyFocused: HTMLElement | null = null;
  /** True between opening and the focus hand-back, so focus returns once. */
  private holdsFocus = false;
  private destroyed = false;
  private isResizing = false;

  private boundOnResizeMove = this.onResizeMove.bind(this);
  private boundOnResizeEnd = this.onResizeEnd.bind(this);

  constructor(
    private cdr: ChangeDetectorRef,
    private ngZone: NgZone,
    private elRef: ElementRef
  ) {}

  ngOnInit(): void {
    if (this._widthPx === 0) {
      this._widthPx = this.Mode === 'dialog'
        ? 800
        : Math.max(this.MinWidthPx, Math.min(window.innerWidth * 0.65, 1000));
    }

    this.initialized = true;

    if (this._visible) {
      this.showPanel();
    }
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    document.removeEventListener('mousemove', this.boundOnResizeMove);
    document.removeEventListener('mouseup', this.boundOnResizeEnd);
    this.returnFocus();
  }

  /** Escape closes the panel while it is open; a closed panel leaves the key alone. */
  @HostListener('document:keydown.escape')
  public OnEscapeKey(): void {
    if (!this._visible) return;
    this.OnClose();
  }

  /** Keeps Tab inside the open panel: the last control wraps to the first, and back. */
  public OnPanelKeyDown(event: KeyboardEvent): void {
    if (event.defaultPrevented || event.key !== 'Tab' || !this.IsVisible) return;
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const container = event.currentTarget;
    if (!(container instanceof HTMLElement)) return;
    WrapTabAtEnds(event, container);
  }

  public OnClose(): void {
    if (this.CanClose && !this.CanClose()) return;
    this.IsVisible = false;
    this._visible = false;
    this.cdr.markForCheck();
    this.returnFocus();
    // Wait for CSS transition to complete
    setTimeout(() => this.Closed.emit(), 300);
  }

  /**
   * Opens on the next microtask (so the CSS transition runs), then moves focus into the panel:
   * the first control, else the panel itself.
   */
  private showPanel(): void {
    if (!this.holdsFocus) {
      this.previouslyFocused = CaptureFocusedElement();
      this.holdsFocus = true;
    }
    Promise.resolve().then(() => {
      if (!this._visible || this.destroyed) return;
      this.IsVisible = true;
      this.cdr.markForCheck();
      // inert comes off with this render; focus can move in once it has.
      this.cdr.detectChanges();
      this.focusInitial();
    });
  }

  private focusInitial(): void {
    const container = this.containerElement();
    if (!container || container.contains(document.activeElement)) return;
    const target = FirstEnabledElement(GetTabStops(container), (el) => el.classList.contains('sp-close-btn'))
      ?? GetTabStops(container)[0]
      ?? container;
    target.focus();
  }

  /** Hands focus back to where it was before the panel opened, once per open. */
  private returnFocus(): void {
    if (!this.holdsFocus) return;
    this.holdsFocus = false;
    const target = this.previouslyFocused;
    this.previouslyFocused = null;
    const host = this.elRef.nativeElement as HTMLElement;
    // Only when focus is still in the panel (or nowhere): a host that moved focus on keeps it.
    const active = document.activeElement;
    if (active && active !== document.body && !host.contains(active)) return;
    RestoreFocusTo(target, host);
  }

  private containerElement(): HTMLElement | null {
    const found = (this.elRef.nativeElement as HTMLElement).querySelector('.sp-panel, .sp-dialog');
    return found instanceof HTMLElement ? found : null;
  }

  public OnBackdropClick(): void {
    this.OnClose();
  }

  // =========================================================================
  // Resize
  // =========================================================================

  public OnResizeStart(event: MouseEvent): void {
    if (!this.Resizable || this.Mode === 'dialog') return;
    event.preventDefault();
    this.isResizing = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    this.ngZone.runOutsideAngular(() => {
      document.addEventListener('mousemove', this.boundOnResizeMove);
      document.addEventListener('mouseup', this.boundOnResizeEnd);
    });
  }

  private onResizeMove(event: MouseEvent): void {
    if (!this.isResizing) return;
    const viewportWidth = window.innerWidth;
    const maxWidth = viewportWidth * this.MaxWidthRatio;
    this._widthPx = Math.max(this.MinWidthPx, Math.min(maxWidth, viewportWidth - event.clientX));
    this.ngZone.run(() => this.cdr.markForCheck());
  }

  private onResizeEnd(): void {
    if (!this.isResizing) return;
    this.isResizing = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    document.removeEventListener('mousemove', this.boundOnResizeMove);
    document.removeEventListener('mouseup', this.boundOnResizeEnd);
    this.WidthChanged.emit(this._widthPx);
  }
}
