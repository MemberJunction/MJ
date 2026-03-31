import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';

/**
 * Shared toolbar rendered by file artifact viewer plugins (PDF, XLSX, DOCX).
 * Provides download, print, and page-navigation controls in a consistent style.
 * All colors use design tokens so the toolbar adapts to light/dark themes.
 */
@Component({
  standalone: false,
  selector: 'mj-file-artifact-toolbar',
  template: `
    <div class="file-toolbar">
      <!-- Left: page navigation (only for multi-page files like PDF) -->
      <div class="file-toolbar__nav">
        @if (totalPages > 1) {
          <button class="file-toolbar__btn" [disabled]="currentPage <= 1" (click)="prevPage.emit()" title="Previous page">
            <i class="fas fa-chevron-left"></i>
          </button>
          <span class="file-toolbar__page-indicator">
            {{ currentPage }} / {{ totalPages }}
          </span>
          <button class="file-toolbar__btn" [disabled]="currentPage >= totalPages" (click)="nextPage.emit()" title="Next page">
            <i class="fas fa-chevron-right"></i>
          </button>
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

    .file-toolbar__nav {
      display: flex;
      align-items: center;
      gap: 4px;
      min-width: 120px;
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
      min-width: 120px;
      justify-content: flex-end;
    }

    .file-toolbar__page-indicator {
      font-size: 12px;
      color: var(--mj-text-secondary);
      padding: 0 4px;
      white-space: nowrap;
    }

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

  @Output() download = new EventEmitter<void>();
  @Output() print = new EventEmitter<void>();
  @Output() prevPage = new EventEmitter<void>();
  @Output() nextPage = new EventEmitter<void>();
}
