import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy, HostListener, ElementRef, NgZone } from '@angular/core';
import { SlidePanelMode } from '../types';

@Component({
  standalone: false,
    selector: 'mj-slide-panel',
    templateUrl: './slide-panel.component.html',
    styleUrls: ['./slide-panel.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class MjSlidePanelComponent implements OnInit, OnDestroy {
    @Input() Mode: SlidePanelMode = 'slide';
    @Input() Title = '';
    @Input() Visible = true;
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

    public IsVisible = false;
    private _widthPx = 0;
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

        // Animate in on next microtask
        Promise.resolve().then(() => {
            this.IsVisible = true;
            this.cdr.markForCheck();
        });
    }

    ngOnDestroy(): void {
        document.removeEventListener('mousemove', this.boundOnResizeMove);
        document.removeEventListener('mouseup', this.boundOnResizeEnd);
    }

    @HostListener('document:keydown.escape')
    public OnEscapeKey(): void {
        this.OnClose();
    }

    public OnClose(): void {
        this.IsVisible = false;
        this.cdr.markForCheck();
        // Wait for CSS transition to complete
        setTimeout(() => this.Closed.emit(), 300);
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
    }
}
