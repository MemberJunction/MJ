import {
  Component,
  Input,
  Output,
  EventEmitter,
  HostListener,
  OnInit,
  OnDestroy
} from '@angular/core';

/**
 * Full-screen image viewer modal with zoom and pan capabilities.
 * Provides a lightbox-style experience for viewing attachment images.
 */
@Component({
  standalone: false,
  selector: 'mj-image-viewer',
  templateUrl: './image-viewer.component.html',
  styleUrls: ['./image-viewer.component.css']
})
export class ImageViewerComponent implements OnInit, OnDestroy {
  /** Image source URL (can be data URL or regular URL) */
  @Input() ImageUrl: string = '';

  /** @deprecated Use {@link ImageUrl}. */
  @Input() set imageUrl(value: string) {
    this.ImageUrl = value;
  }
  /** @deprecated Use {@link ImageUrl}. */
  get imageUrl(): string {
    return this.ImageUrl;
  }

  /** Image alt text */
  @Input() Alt: string = 'Image';

  /** @deprecated Use {@link Alt}. */
  @Input() set alt(value: string) {
    this.Alt = value;
  }
  /** @deprecated Use {@link Alt}. */
  get alt(): string {
    return this.Alt;
  }

  /** Image filename for download */
  @Input() FileName: string = 'image';

  /** @deprecated Use {@link FileName}. */
  @Input() set fileName(value: string) {
    this.FileName = value;
  }
  /** @deprecated Use {@link FileName}. */
  get fileName(): string {
    return this.FileName;
  }

  /** Whether the viewer is visible */
  @Input() Visible: boolean = false;

  /** @deprecated Use {@link Visible}. */
  @Input() set visible(value: boolean) {
    this.Visible = value;
  }
  /** @deprecated Use {@link Visible}. */
  get visible(): boolean {
    return this.Visible;
  }

  /** Emits when the viewer should be closed */
  @Output() Closed = new EventEmitter<void>();

  /**
   * @deprecated Use {@link Closed}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (closed) keeps working. Must stay AFTER Closed: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() closed = this.Closed;

  // Zoom and pan state
  public ZoomLevel: number = 1;

  /** @deprecated Use {@link ZoomLevel}. */
  public get zoomLevel(): number {
    return this.ZoomLevel;
  }
  /** @deprecated Use {@link ZoomLevel}. */
  public set zoomLevel(value: number) {
    this.ZoomLevel = value;
  }
  public MinZoom: number = 0.1;

  /** @deprecated Use {@link MinZoom}. */
  public get minZoom(): number {
    return this.MinZoom;
  }
  /** @deprecated Use {@link MinZoom}. */
  public set minZoom(value: number) {
    this.MinZoom = value;
  }
  public MaxZoom: number = 5;

  /** @deprecated Use {@link MaxZoom}. */
  public get maxZoom(): number {
    return this.MaxZoom;
  }
  /** @deprecated Use {@link MaxZoom}. */
  public set maxZoom(value: number) {
    this.MaxZoom = value;
  }
  public TranslateX: number = 0;

  /** @deprecated Use {@link TranslateX}. */
  public get translateX(): number {
    return this.TranslateX;
  }
  /** @deprecated Use {@link TranslateX}. */
  public set translateX(value: number) {
    this.TranslateX = value;
  }
  public TranslateY: number = 0;

  /** @deprecated Use {@link TranslateY}. */
  public get translateY(): number {
    return this.TranslateY;
  }
  /** @deprecated Use {@link TranslateY}. */
  public set translateY(value: number) {
    this.TranslateY = value;
  }

  // Drag state
  public IsDragging: boolean = false;

  /** @deprecated Use {@link IsDragging}. */
  public get isDragging(): boolean {
    return this.IsDragging;
  }
  /** @deprecated Use {@link IsDragging}. */
  public set isDragging(value: boolean) {
    this.IsDragging = value;
  }
  private lastMouseX: number = 0;
  private lastMouseY: number = 0;

  ngOnInit(): void {
    // Lock body scroll when viewer is open
    if (this.Visible) {
      document.body.style.overflow = 'hidden';
    }
  }

  ngOnDestroy(): void {
    // Restore body scroll
    document.body.style.overflow = '';
  }

  /**
   * Handle escape key to close
   */
  @HostListener('document:keydown.escape')
  onEscapeKey(): void {
    if (this.Visible) {
      this.close();
    }
  }

  /**
   * Handle mouse wheel for zoom
   */
  @HostListener('wheel', ['$event'])
  onWheel(event: WheelEvent): void {
    if (!this.Visible) return;
    event.preventDefault();

    const delta = event.deltaY > 0 ? -0.1 : 0.1;
    this.adjustZoom(delta, event.clientX, event.clientY);
  }

  /**
   * Close the viewer
   */
  close(): void {
    this.resetView();
    document.body.style.overflow = '';
    this.Closed.emit();
  }

  /**
   * Handle backdrop click
   */
  OnBackdropClick(event: MouseEvent): void {
    // Only close if clicking directly on backdrop
    const target = event.target as HTMLElement;
    if (target.classList.contains('image-viewer-backdrop')) {
      this.close();
    }
  }

  /** @deprecated Use {@link OnBackdropClick}. */
  onBackdropClick(event: MouseEvent): void {
    return this.OnBackdropClick(event);
  }

  /**
   * Zoom in
   */
  ZoomIn(): void {
    this.adjustZoom(0.25);
  }

  /** @deprecated Use {@link ZoomIn}. */
  zoomIn(): void {
    return this.ZoomIn();
  }

  /**
   * Zoom out
   */
  ZoomOut(): void {
    this.adjustZoom(-0.25);
  }

  /** @deprecated Use {@link ZoomOut}. */
  zoomOut(): void {
    return this.ZoomOut();
  }

  /**
   * Reset to 100% zoom
   */
  ResetZoom(): void {
    this.ZoomLevel = 1;
    this.TranslateX = 0;
    this.TranslateY = 0;
  }

  /** @deprecated Use {@link ResetZoom}. */
  resetZoom(): void {
    return this.ResetZoom();
  }

  /**
   * Fit image to screen
   */
  FitToScreen(): void {
    // Reset position and set zoom to 1 (CSS will handle fitting)
    this.resetView();
  }

  /** @deprecated Use {@link FitToScreen}. */
  fitToScreen(): void {
    return this.FitToScreen();
  }

  /**
   * Reset view to initial state
   */
  private resetView(): void {
    this.ZoomLevel = 1;
    this.TranslateX = 0;
    this.TranslateY = 0;
  }

  /**
   * Adjust zoom level
   */
  private adjustZoom(delta: number, centerX?: number, centerY?: number): void {
    const newZoom = Math.max(this.MinZoom, Math.min(this.MaxZoom, this.ZoomLevel + delta));

    if (centerX !== undefined && centerY !== undefined && newZoom !== this.ZoomLevel) {
      // Zoom towards mouse position
      const factor = newZoom / this.ZoomLevel;
      const imageContainer = document.querySelector('.image-container') as HTMLElement;
      if (imageContainer) {
        const rect = imageContainer.getBoundingClientRect();
        const offsetX = centerX - rect.left - rect.width / 2 - this.TranslateX;
        const offsetY = centerY - rect.top - rect.height / 2 - this.TranslateY;

        this.TranslateX = this.TranslateX - offsetX * (factor - 1);
        this.TranslateY = this.TranslateY - offsetY * (factor - 1);
      }
    }

    this.ZoomLevel = newZoom;
  }

  /**
   * Handle mouse down for dragging
   */
  OnMouseDown(event: MouseEvent): void {
    if (event.button !== 0) return; // Only left click
    if (this.ZoomLevel <= 1) return; // Only allow pan when zoomed in

    this.IsDragging = true;
    this.lastMouseX = event.clientX;
    this.lastMouseY = event.clientY;
    event.preventDefault();
  }

  /** @deprecated Use {@link OnMouseDown}. */
  onMouseDown(event: MouseEvent): void {
    return this.OnMouseDown(event);
  }

  /**
   * Handle mouse move for dragging
   */
  @HostListener('document:mousemove', ['$event'])
  onMouseMove(event: MouseEvent): void {
    if (!this.IsDragging) return;

    const deltaX = event.clientX - this.lastMouseX;
    const deltaY = event.clientY - this.lastMouseY;

    this.TranslateX += deltaX;
    this.TranslateY += deltaY;

    this.lastMouseX = event.clientX;
    this.lastMouseY = event.clientY;
  }

  /**
   * Handle mouse up to stop dragging
   */
  @HostListener('document:mouseup')
  onMouseUp(): void {
    this.IsDragging = false;
  }

  /**
   * Download the image
   */
  DownloadImage(): void {
    const link = document.createElement('a');
    link.href = this.ImageUrl;
    link.download = this.FileName;
    link.click();
  }

  /** @deprecated Use {@link DownloadImage}. */
  downloadImage(): void {
    return this.DownloadImage();
  }

  /**
   * Get current zoom percentage for display
   */
  get ZoomPercentage(): string {
    return Math.round(this.ZoomLevel * 100) + '%';
  }

  /** @deprecated Use {@link ZoomPercentage}. */
  get zoomPercentage(): string {
    return this.ZoomPercentage;
  }

  /**
   * Get transform style for image
   */
  get ImageTransform(): string {
    return `translate(${this.TranslateX}px, ${this.TranslateY}px) scale(${this.ZoomLevel})`;
  }

  /** @deprecated Use {@link ImageTransform}. */
  get imageTransform(): string {
    return this.ImageTransform;
  }
}
