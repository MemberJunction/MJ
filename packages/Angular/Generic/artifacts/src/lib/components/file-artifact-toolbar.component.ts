import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';

/**
 * Shared toolbar rendered by file artifact viewer plugins (PDF, XLSX, DOCX).
 * Provides download, print, page-navigation, and optional zoom controls in a
 * consistent style. All colors use design tokens so the toolbar adapts to
 * light/dark themes.
 */
@Component({
  standalone: false,
  selector: 'mj-file-artifact-toolbar',
  template: `
    <div class="file-toolbar">
      <!-- Left: page navigation + zoom (only rendered when relevant) -->
      <div class="file-toolbar__left">
        @if (totalPages > 1) {
          <div class="file-toolbar__nav">
            <button class="file-toolbar__icon-btn" [disabled]="currentPage <= 1" (click)="prevPage.emit()" title="Previous page">
              <i class="fas fa-chevron-left"></i>
            </button>
            <input
              class="file-toolbar__page-input"
              type="number"
              [value]="currentPage"
              [min]="1"
              [max]="totalPages"
              (change)="onPageInputChange($event)"
              (keydown.enter)="onPageInputChange($event)"
              title="Jump to page"
            />
            <span class="file-toolbar__page-of">/ {{ totalPages }}</span>
            <button class="file-toolbar__icon-btn" [disabled]="currentPage >= totalPages" (click)="nextPage.emit()" title="Next page">
              <i class="fas fa-chevron-right"></i>
            </button>
          </div>
        }

        @if (showZoom) {
          <div class="file-toolbar__zoom">
            <button class="file-toolbar__icon-btn" [disabled]="!canZoomOut" (click)="zoomOut.emit()" title="Zoom out">
              <i class="fas fa-minus"></i>
            </button>
            <button class="file-toolbar__zoom-level" (click)="zoomReset.emit()" title="Reset zoom to 100%">
              {{ zoomPercent }}%
            </button>
            <button class="file-toolbar__icon-btn" [disabled]="!canZoomIn" (click)="zoomIn.emit()" title="Zoom in">
              <i class="fas fa-plus"></i>
            </button>
          </div>
        }
      </div>

      <!-- Center: filename -->
      <div class="file-toolbar__title" [title]="fileName">{{ fileName }}</div>

      <!-- Right: actions -->
      <div class="file-toolbar__actions">
        @if (showPrint) {
          <button class="file-toolbar__btn" (click)="print.emit()" title="Print">
            <i class="fas fa-print"></i>
            <span class="file-toolbar__btn-label">Print</span>
          </button>
        }
        <button class="file-toolbar__btn file-toolbar__btn--primary" (click)="download.emit()" [disabled]="isDownloading" title="Download file">
          @if (isDownloading) {
            <i class="fas fa-spinner fa-spin"></i>
          } @else {
            <i class="fas fa-download"></i>
          }
          <span class="file-toolbar__btn-label">Download</span>
        </button>
      </div>
    </div>
  `,
  styles: [`
    .file-toolbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 6px 12px;
      background: var(--mj-bg-surface-card);
      border-bottom: 1px solid var(--mj-border-default);
      flex-shrink: 0;
    }

    .file-toolbar__left {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }

    .file-toolbar__nav {
      display: flex;
      align-items: center;
      gap: 3px;
    }

    .file-toolbar__zoom {
      display: flex;
      align-items: center;
      gap: 2px;
      border-left: 1px solid var(--mj-border-default);
      padding-left: 8px;
    }

    .file-toolbar__title {
      flex: 1;
      text-align: center;
      font-size: 13px;
      font-weight: 500;
      color: var(--mj-text-secondary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      padding: 0 8px;
    }

    .file-toolbar__actions {
      display: flex;
      align-items: center;
      gap: 4px;
      min-width: 0;
    }

    /* Shared icon button (chevrons, +, -) */
    .file-toolbar__icon-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 26px;
      height: 26px;
      padding: 0;
      background: var(--mj-bg-surface);
      border: 1px solid var(--mj-border-default);
      border-radius: 4px;
      color: var(--mj-text-secondary);
      font-size: 11px;
      cursor: pointer;
      transition: background 0.15s, border-color 0.15s, color 0.15s;
    }

    .file-toolbar__icon-btn:hover:not([disabled]) {
      background: var(--mj-bg-surface-hover);
      border-color: var(--mj-border-strong);
      color: var(--mj-text-primary);
    }

    .file-toolbar__icon-btn[disabled] {
      opacity: 0.4;
      cursor: not-allowed;
    }

    /* Page number input */
    .file-toolbar__page-input {
      width: 40px;
      height: 26px;
      padding: 0 4px;
      text-align: center;
      font-size: 12px;
      background: var(--mj-bg-surface);
      border: 1px solid var(--mj-border-default);
      border-radius: 4px;
      color: var(--mj-text-primary);
      /* hide spin buttons — we use the chevrons instead */
      -moz-appearance: textfield;
    }

    .file-toolbar__page-input::-webkit-inner-spin-button,
    .file-toolbar__page-input::-webkit-outer-spin-button {
      -webkit-appearance: none;
      margin: 0;
    }

    .file-toolbar__page-input:focus {
      outline: none;
      border-color: var(--mj-border-focus);
      box-shadow: 0 0 0 2px color-mix(in srgb, var(--mj-brand-primary) 15%, transparent);
    }

    .file-toolbar__page-of {
      font-size: 12px;
      color: var(--mj-text-muted);
      white-space: nowrap;
    }

    /* Zoom level display — clickable to reset */
    .file-toolbar__zoom-level {
      min-width: 42px;
      height: 26px;
      padding: 0 4px;
      background: var(--mj-bg-surface);
      border: 1px solid var(--mj-border-default);
      border-radius: 4px;
      color: var(--mj-text-secondary);
      font-size: 12px;
      text-align: center;
      cursor: pointer;
      transition: background 0.15s, color 0.15s;
    }

    .file-toolbar__zoom-level:hover {
      background: var(--mj-bg-surface-hover);
      color: var(--mj-text-primary);
    }

    /* Labelled action buttons (Print, Download) */
    .file-toolbar__btn {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 5px 10px;
      background: var(--mj-bg-surface);
      border: 1px solid var(--mj-border-default);
      border-radius: 4px;
      color: var(--mj-text-secondary);
      font-size: 12px;
      cursor: pointer;
      transition: background 0.15s, border-color 0.15s, color 0.15s;
    }

    .file-toolbar__btn:hover:not([disabled]) {
      background: var(--mj-bg-surface-hover);
      border-color: var(--mj-border-strong);
      color: var(--mj-text-primary);
    }

    .file-toolbar__btn[disabled] {
      opacity: 0.4;
      cursor: not-allowed;
    }

    .file-toolbar__btn--primary {
      background: var(--mj-brand-primary);
      border-color: var(--mj-brand-primary);
      color: var(--mj-text-inverse);
    }

    .file-toolbar__btn--primary:hover:not([disabled]) {
      background: var(--mj-brand-primary-hover);
      border-color: var(--mj-brand-primary-hover);
      color: var(--mj-text-inverse);
    }

    @media (max-width: 480px) {
      .file-toolbar__btn-label {
        display: none;
      }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FileArtifactToolbarComponent {
  /** Display name shown in the center of the toolbar. */
  @Input() fileName = '';

  /** Current page number (1-based). Only shown when totalPages > 1. */
  @Input() currentPage = 1;

  /** Total page count. Pass 1 (default) to hide navigation arrows. */
  @Input() totalPages = 1;

  /** Whether the download button should show a spinner. */
  @Input() isDownloading = false;

  /** Whether to show the Print button (e.g. hide for binary spreadsheets). */
  @Input() showPrint = true;

  /** Whether to show zoom in/out/reset controls. Only PDF needs this. */
  @Input() showZoom = false;

  /** Current zoom level as a percentage integer (e.g. 100 = 100%). */
  @Input() zoomPercent = 100;

  /** Whether zooming in further is possible. */
  @Input() canZoomIn = true;

  /** Whether zooming out further is possible. */
  @Input() canZoomOut = true;

  @Output() download = new EventEmitter<void>();
  @Output() print = new EventEmitter<void>();
  @Output() prevPage = new EventEmitter<void>();
  @Output() nextPage = new EventEmitter<void>();
  /** Emits the validated target page number when the user edits the page input. */
  @Output() pageChange = new EventEmitter<number>();
  @Output() zoomIn = new EventEmitter<void>();
  @Output() zoomOut = new EventEmitter<void>();
  /** Emitted when the user clicks the zoom-level badge to reset to 100%. */
  @Output() zoomReset = new EventEmitter<void>();

  public onPageInputChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const value = parseInt(input.value, 10);
    if (!isNaN(value) && value >= 1 && value <= this.totalPages) {
      this.pageChange.emit(value);
    } else {
      // Snap back to current valid page
      input.value = String(this.currentPage);
    }
  }
}
