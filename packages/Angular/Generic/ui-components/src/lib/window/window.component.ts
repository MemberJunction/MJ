import { Component, Input, Output, EventEmitter, HostListener, OnDestroy, ElementRef, ChangeDetectorRef, NgZone, inject } from '@angular/core';

/**
 * mj-window — Floating window panel. Replaces `<kendo-window>`.
 *
 * Unlike mj-dialog, this does NOT have a backdrop and does NOT block interaction
 * with the rest of the page. It's a floating panel, similar to Kendo's Window.
 *
 * Supports dragging (via titlebar), resizing (via edges/corners), minimize, and maximize.
 *
 * @example
 * ```html
 * <mj-window [Visible]="showWindow" Title="Details" [Width]="600" [Height]="400"
 *            [Draggable]="true" [Resizable]="true" (Close)="onClose()"
 *            (StateChange)="onStateChange($event)">
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
        [class.mj-window--maximized]="State === 'maximized'"
        [class.mj-window--draggable]="Draggable"
        [class.mj-window--resizable]="Resizable && State !== 'maximized'"
        [style.width]="State === 'maximized' ? '100vw' : resolvedWidth"
        [style.height]="State === 'maximized' ? '100vh' : resolvedHeight"
        [style.top]="State === 'maximized' ? '0' : resolvedTop"
        [style.left]="State === 'maximized' ? '0' : resolvedLeft"
        [style.transform]="ResolvedTransform"
        [style.min-width]="MinWidth ? MinWidth + 'px' : null"
        [style.min-height]="MinHeight ? MinHeight + 'px' : null"
        [style.max-width]="State === 'maximized' ? '100vw' : '90vw'"
        [style.max-height]="State === 'maximized' ? '100vh' : '90vh'"
        [style.border-radius]="State === 'maximized' ? '0' : null"
        role="dialog"
        [attr.aria-labelledby]="Title ? 'mj-window-title-' + WindowId : null">

        <!-- Resize handles -->
        @if (Resizable && State !== 'maximized') {
          <div class="mj-window-resize mj-window-resize--n" (mousedown)="OnResizeStart($event, 'n')"></div>
          <div class="mj-window-resize mj-window-resize--s" (mousedown)="OnResizeStart($event, 's')"></div>
          <div class="mj-window-resize mj-window-resize--e" (mousedown)="OnResizeStart($event, 'e')"></div>
          <div class="mj-window-resize mj-window-resize--w" (mousedown)="OnResizeStart($event, 'w')"></div>
          <div class="mj-window-resize mj-window-resize--ne" (mousedown)="OnResizeStart($event, 'ne')"></div>
          <div class="mj-window-resize mj-window-resize--nw" (mousedown)="OnResizeStart($event, 'nw')"></div>
          <div class="mj-window-resize mj-window-resize--se" (mousedown)="OnResizeStart($event, 'se')"></div>
          <div class="mj-window-resize mj-window-resize--sw" (mousedown)="OnResizeStart($event, 'sw')"></div>
        }

        <div class="mj-window-titlebar"
          (mousedown)="OnDragStart($event)">
          @if (Title) {
            <h3 class="mj-window-title" [id]="'mj-window-title-' + WindowId">{{ Title }}</h3>
          }
          <ng-content select="mj-window-titlebar"></ng-content>
          <button class="mj-window-close" (click)="OnCloseClick()" (mousedown)="$event.stopPropagation()" aria-label="Close window">
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
export class MJWindowComponent implements OnDestroy {
  private _visible = false;
  private static nextId = 0;

  @Input()
  set Visible(value: boolean) { this._visible = value; }
  get Visible(): boolean { return this._visible; }

  @Input() Title = '';
  @Input()
  set Width(value: number | string | null) {
    this._width = value;
    if (value != null) this.currentWidth = this.parseSize(value);
  }
  get Width(): number | string | null { return this._width; }

  @Input()
  set Height(value: number | string | null) {
    this._height = value;
    if (value != null) this.currentHeight = this.parseSize(value);
  }
  get Height(): number | string | null { return this._height; }
  @Input()
  set Top(value: number | null) { if (value != null) this.currentTop = value; }
  get Top(): number | null { return this.currentTop; }

  @Input()
  set Left(value: number | null) { if (value != null) this.currentLeft = value; }
  get Left(): number | null { return this.currentLeft; }
  @Input() MinWidth: number | null = null;
  @Input() MinHeight: number | null = null;
  @Input() Draggable = false;
  @Input() Resizable = false;

  /** Window state: 'default' or 'maximized'. */
  @Input()
  set State(value: 'default' | 'maximized') {
    if (value !== this._state) {
      if (value === 'maximized') {
        this.savedTop = this.currentTop;
        this.savedLeft = this.currentLeft;
        this.savedWidth = this.currentWidth;
        this.savedHeight = this.currentHeight;
      } else if (this._state === 'maximized') {
        this.currentTop = this.savedTop;
        this.currentLeft = this.savedLeft;
        this.currentWidth = this.savedWidth;
        this.currentHeight = this.savedHeight;
      }
      this._state = value;
      this.StateChange.emit(value);
    }
  }
  get State(): 'default' | 'maximized' { return this._state; }

  @Output() Close = new EventEmitter<void>();
  @Output() StateChange = new EventEmitter<'default' | 'maximized'>();
  @Output() Resize = new EventEmitter<void>();

  WindowId = MJWindowComponent.nextId++;

  // Internal position/size tracking
  private _state: 'default' | 'maximized' = 'default';
  private _width: number | string | null = null;
  private _height: number | string | null = null;
  private currentTop: number | null = null;
  private currentLeft: number | null = null;
  private currentWidth: number | null = null;
  private currentHeight: number | null = null;

  // Saved dimensions for restore from maximize
  private savedTop: number | null = null;
  private savedLeft: number | null = null;
  private savedWidth: number | null = null;
  private savedHeight: number | null = null;

  // Drag state
  private isDragging = false;
  private dragStartX = 0;
  private dragStartY = 0;
  private dragStartTop = 0;
  private dragStartLeft = 0;

  // Resize state
  private isResizing = false;
  private resizeDirection = '';
  private resizeStartX = 0;
  private resizeStartY = 0;
  private resizeStartWidth = 0;
  private resizeStartHeight = 0;
  private resizeStartTop = 0;
  private resizeStartLeft = 0;

  private boundOnMouseMove: ((e: MouseEvent) => void) | null = null;
  private boundOnMouseUp: ((e: MouseEvent) => void) | null = null;

  private elementRef = inject(ElementRef);
  private cdr = inject(ChangeDetectorRef);
  private ngZone = inject(NgZone);

  get hasExplicitPosition(): boolean {
    return this.currentTop != null && this.currentLeft != null;
  }

  get ResolvedTransform(): string {
    if (this.State === 'maximized') return 'none';
    const hasTop = this.currentTop != null;
    const hasLeft = this.currentLeft != null;
    if (hasTop && hasLeft) return 'none';
    if (hasTop && !hasLeft) return 'translateX(-50%)';
    if (!hasTop && hasLeft) return 'translateY(-50%)';
    return 'translate(-50%, -50%)';
  }

  get resolvedWidth(): string {
    if (this.currentWidth != null) return `${this.currentWidth}px`;
    if (this.Width) return typeof this.Width === 'number' ? `${this.Width}px` : this.Width;
    return '500px';
  }

  get resolvedHeight(): string {
    if (this.currentHeight != null) return `${this.currentHeight}px`;
    if (this.Height) return typeof this.Height === 'number' ? `${this.Height}px` : this.Height;
    return 'auto';
  }

  get resolvedTop(): string {
    return this.currentTop != null ? `${this.currentTop}px` : '50%';
  }

  get resolvedLeft(): string {
    return this.currentLeft != null ? `${this.currentLeft}px` : '50%';
  }

  @HostListener('document:keydown.escape')
  OnEscapeKey(): void {
    if (this.Visible) this.OnCloseClick();
  }

  OnCloseClick(): void {
    this.Close.emit();
  }

  // --- Drag handling ---

  OnDragStart(event: MouseEvent): void {
    if (!this.Draggable || this.State === 'maximized') return;
    // Don't drag if clicking buttons inside titlebar
    if ((event.target as HTMLElement).closest('button')) return;

    event.preventDefault();
    this.isDragging = true;
    this.dragStartX = event.clientX;
    this.dragStartY = event.clientY;

    const windowEl = this.getWindowElement();
    if (windowEl) {
      const rect = windowEl.getBoundingClientRect();
      this.dragStartTop = rect.top;
      this.dragStartLeft = rect.left;

      // Ensure we're using absolute positioning once dragging starts
      if (this.currentTop == null) {
        this.currentTop = rect.top;
        this.currentLeft = rect.left;
        this.cdr.detectChanges();
      }
    }

    this.attachMouseListeners();
  }

  // --- Resize handling ---

  OnResizeStart(event: MouseEvent, direction: string): void {
    if (!this.Resizable || this.State === 'maximized') return;
    event.preventDefault();
    event.stopPropagation();

    this.isResizing = true;
    this.resizeDirection = direction;
    this.resizeStartX = event.clientX;
    this.resizeStartY = event.clientY;

    const windowEl = this.getWindowElement();
    if (windowEl) {
      const rect = windowEl.getBoundingClientRect();
      this.resizeStartWidth = rect.width;
      this.resizeStartHeight = rect.height;
      this.resizeStartTop = rect.top;
      this.resizeStartLeft = rect.left;

      // Ensure absolute positioning
      if (this.currentTop == null) {
        this.currentTop = rect.top;
        this.currentLeft = rect.left;
      }
      if (this.currentWidth == null) {
        this.currentWidth = rect.width;
      }
      if (this.currentHeight == null) {
        this.currentHeight = rect.height;
      }
    }

    this.attachMouseListeners();
  }

  private attachMouseListeners(): void {
    this.ngZone.runOutsideAngular(() => {
      this.boundOnMouseMove = (e: MouseEvent) => this.onMouseMove(e);
      this.boundOnMouseUp = (e: MouseEvent) => this.onMouseUp(e);
      document.addEventListener('mousemove', this.boundOnMouseMove);
      document.addEventListener('mouseup', this.boundOnMouseUp);
    });
  }

  private onMouseMove(event: MouseEvent): void {
    if (this.isDragging) {
      const dx = event.clientX - this.dragStartX;
      const dy = event.clientY - this.dragStartY;
      this.currentTop = Math.max(0, this.dragStartTop + dy);
      this.currentLeft = Math.max(0, this.dragStartLeft + dx);
      this.ngZone.run(() => this.cdr.detectChanges());
    } else if (this.isResizing) {
      this.handleResize(event);
      this.ngZone.run(() => {
        this.cdr.detectChanges();
        this.Resize.emit();
      });
    }
  }

  private handleResize(event: MouseEvent): void {
    const dx = event.clientX - this.resizeStartX;
    const dy = event.clientY - this.resizeStartY;
    const minW = this.MinWidth || 200;
    const minH = this.MinHeight || 150;
    const dir = this.resizeDirection;

    if (dir.includes('e')) {
      this.currentWidth = Math.max(minW, this.resizeStartWidth + dx);
    }
    if (dir.includes('w')) {
      const newWidth = Math.max(minW, this.resizeStartWidth - dx);
      this.currentLeft = this.resizeStartLeft + (this.resizeStartWidth - newWidth);
      this.currentWidth = newWidth;
    }
    if (dir.includes('s')) {
      this.currentHeight = Math.max(minH, this.resizeStartHeight + dy);
    }
    if (dir.includes('n')) {
      const newHeight = Math.max(minH, this.resizeStartHeight - dy);
      this.currentTop = this.resizeStartTop + (this.resizeStartHeight - newHeight);
      this.currentHeight = newHeight;
    }
  }

  private onMouseUp(_event: MouseEvent): void {
    this.isDragging = false;
    this.isResizing = false;
    this.detachMouseListeners();
  }

  private detachMouseListeners(): void {
    if (this.boundOnMouseMove) {
      document.removeEventListener('mousemove', this.boundOnMouseMove);
      this.boundOnMouseMove = null;
    }
    if (this.boundOnMouseUp) {
      document.removeEventListener('mouseup', this.boundOnMouseUp);
      this.boundOnMouseUp = null;
    }
  }

  private getWindowElement(): HTMLElement | null {
    return this.elementRef.nativeElement.querySelector('.mj-window');
  }

  private parseSize(value: string | number): number | null {
    if (typeof value === 'number') return value;
    if (value.endsWith('vw')) return (parseFloat(value) / 100) * window.innerWidth;
    if (value.endsWith('vh')) return (parseFloat(value) / 100) * window.innerHeight;
    if (value.endsWith('px')) return parseFloat(value);
    const parsed = parseFloat(value);
    return isNaN(parsed) ? null : parsed;
  }

  /** Programmatic method to update position */
  SetPosition(top: number, left: number): void {
    this.currentTop = top;
    this.currentLeft = left;
    this.cdr.detectChanges();
  }

  /** Programmatic method to update size */
  SetSize(width: number, height: number): void {
    this.currentWidth = width;
    this.currentHeight = height;
    this.cdr.detectChanges();
  }

  /** Get the current window element for DOM queries */
  GetWindowElement(): HTMLElement | null {
    return this.getWindowElement();
  }

  ngOnDestroy(): void {
    this.detachMouseListeners();
  }
}

/**
 * mj-window-titlebar — Custom titlebar for mj-window. Replaces `<kendo-window-titlebar>`.
 */
@Component({
  selector: 'mj-window-titlebar',
  standalone: true,
  template: `<ng-content></ng-content>`,
  styles: [`:host { display: contents; }`]
})
export class MJWindowTitlebarComponent {}

/**
 * mj-window-actions — Footer actions for mj-window.
 */
@Component({
  selector: 'mj-window-actions',
  standalone: true,
  template: `<div class="mj-window-actions"><ng-content></ng-content></div>`
})
export class MJWindowActionsComponent {}
