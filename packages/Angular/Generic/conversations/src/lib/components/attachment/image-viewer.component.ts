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
  selector: 'mj-image-viewer',
  templateUrl: './image-viewer.component.html',
  styleUrls: ['./image-viewer.component.css']
})
export class ImageViewerComponent implements OnInit, OnDestroy {
  /** Image source URL (can be data URL or regular URL) */
  @Input() imageUrl: string = '';

  /** Image alt text */
  @Input() alt: string = 'Image';

  /** Image filename for download */
  @Input() fileName: string = 'image';

  /** Whether the viewer is visible */
  @Input() visible: boolean = false;

  /** Emits when the viewer should be closed */
  @Output() closed = new EventEmitter<void>();

  // Zoom and pan state
  public zoomLevel: number = 1;
  public minZoom: number = 0.1;
  public maxZoom: number = 5;
  public translateX: number = 0;
  public translateY: number = 0;

  // Drag state
  public isDragging: boolean = false;
  private lastMouseX: number = 0;
  private lastMouseY: number = 0;

  ngOnInit(): void {
    // Lock body scroll when viewer is open
    if (this.visible) {
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
    if (this.visible) {
      this.close();
    }
  }

  /**
   * Handle mouse wheel for zoom
   */
  @HostListener('wheel', ['$event'])
  onWheel(event: WheelEvent): void {
    if (!this.visible) return;
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
    this.closed.emit();
  }

  /**
   * Handle backdrop click
   */
  onBackdropClick(event: MouseEvent): void {
    // Only close if clicking directly on backdrop
    const target = event.target as HTMLElement;
    if (target.classList.contains('image-viewer-backdrop')) {
      this.close();
    }
  }

  /**
   * Zoom in
   */
  zoomIn(): void {
    this.adjustZoom(0.25);
  }

  /**
   * Zoom out
   */
  zoomOut(): void {
    this.adjustZoom(-0.25);
  }

  /**
   * Reset to 100% zoom
   */
  resetZoom(): void {
    this.zoomLevel = 1;
    this.translateX = 0;
    this.translateY = 0;
  }

  /**
   * Fit image to screen
   */
  fitToScreen(): void {
    // Reset position and set zoom to 1 (CSS will handle fitting)
    this.resetView();
  }

  /**
   * Reset view to initial state
   */
  private resetView(): void {
    this.zoomLevel = 1;
    this.translateX = 0;
    this.translateY = 0;
  }

  /**
   * Adjust zoom level
   */
  private adjustZoom(delta: number, centerX?: number, centerY?: number): void {
    const newZoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.zoomLevel + delta));

    if (centerX !== undefined && centerY !== undefined && newZoom !== this.zoomLevel) {
      // Zoom towards mouse position
      const factor = newZoom / this.zoomLevel;
      const imageContainer = document.querySelector('.image-container') as HTMLElement;
      if (imageContainer) {
        const rect = imageContainer.getBoundingClientRect();
        const offsetX = centerX - rect.left - rect.width / 2 - this.translateX;
        const offsetY = centerY - rect.top - rect.height / 2 - this.translateY;

        this.translateX = this.translateX - offsetX * (factor - 1);
        this.translateY = this.translateY - offsetY * (factor - 1);
      }
    }

    this.zoomLevel = newZoom;
  }

  /**
   * Handle mouse down for dragging
   */
  onMouseDown(event: MouseEvent): void {
    if (event.button !== 0) return; // Only left click
    if (this.zoomLevel <= 1) return; // Only allow pan when zoomed in

    this.isDragging = true;
    this.lastMouseX = event.clientX;
    this.lastMouseY = event.clientY;
    event.preventDefault();
  }

  /**
   * Handle mouse move for dragging
   */
  @HostListener('document:mousemove', ['$event'])
  onMouseMove(event: MouseEvent): void {
    if (!this.isDragging) return;

    const deltaX = event.clientX - this.lastMouseX;
    const deltaY = event.clientY - this.lastMouseY;

    this.translateX += deltaX;
    this.translateY += deltaY;

    this.lastMouseX = event.clientX;
    this.lastMouseY = event.clientY;
  }

  /**
   * Handle mouse up to stop dragging
   */
  @HostListener('document:mouseup')
  onMouseUp(): void {
    this.isDragging = false;
  }

  /**
   * Download the image
   */
  downloadImage(): void {
    const link = document.createElement('a');
    link.href = this.imageUrl;
    link.download = this.fileName;
    link.click();
  }

  /**
   * Get current zoom percentage for display
   */
  get zoomPercentage(): string {
    return Math.round(this.zoomLevel * 100) + '%';
  }

  /**
   * Get transform style for image
   */
  get imageTransform(): string {
    return `translate(${this.translateX}px, ${this.translateY}px) scale(${this.zoomLevel})`;
  }
}
