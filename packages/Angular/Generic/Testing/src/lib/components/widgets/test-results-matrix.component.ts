import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import {
  MatrixCellData,
  MatrixColumnData,
  MatrixRowData,
  TestResultsMatrixData
} from '../../models/testing.models';

/**
 * Event emitted when a cell is clicked
 */
export interface MatrixCellClickEvent {
  testRunId: string;
  testId: string;
  testName: string;
  suiteRunId: string;
  status: string;
}

/**
 * Event emitted when a row header (test name) is clicked
 */
export interface MatrixRowClickEvent {
  testId: string;
  testName: string;
}

/**
 * Event emitted when a column header (suite run) is clicked
 */
export interface MatrixColumnClickEvent {
  suiteRunId: string;
  date: Date;
  tags: string[];
}

/**
 * Reusable Test Results Matrix Component
 *
 * Displays a matrix view of test results across multiple suite runs.
 * - Rows: Individual tests
 * - Columns: Suite runs (sorted by date, most recent first)
 * - Cells: Color-coded status with click navigation
 *
 * @example
 * ```html
 * <mj-test-results-matrix
 *   [data]="matrixData"
 *   [loading]="isLoading"
 *   [maxColumns]="10"
 *   [showTags]="true"
 *   [showPassRate]="true"
 *   (cellClick)="onCellClick($event)"
 *   (rowClick)="onTestClick($event)"
 *   (columnClick)="onSuiteRunClick($event)">
 * </mj-test-results-matrix>
 * ```
 */
@Component({
  selector: 'mj-test-results-matrix',
  template: `
    <div class="matrix-container" [class.loading]="loading">
      <!-- Loading state -->
      <div class="matrix-loading" *ngIf="loading">
        <div class="loading-spinner">
          <i class="fas fa-spinner fa-spin"></i>
        </div>
        <span>Loading matrix data...</span>
      </div>

      <!-- Empty state -->
      <div class="matrix-empty" *ngIf="!loading && (!data || data.columns.length === 0)">
        <div class="empty-icon">
          <i class="fas fa-th"></i>
        </div>
        <h4>{{ emptyTitle }}</h4>
        <p>{{ emptyMessage }}</p>
      </div>

      <!-- Matrix table -->
      <div class="matrix-wrapper" *ngIf="!loading && data && data.columns.length > 0">
        <table class="matrix-table">
          <thead>
            <tr class="header-row">
              <th class="test-name-header sticky-col">
                <div class="header-content">
                  <i class="fas fa-flask"></i>
                  <span>Test</span>
                </div>
              </th>
              <th class="run-header"
                  *ngFor="let col of data.columns; let i = index; trackBy: trackColumn"
                  [class.highlighted]="highlightedColumn === col.suiteRunId"
                  (click)="onColumnHeaderClick(col)"
                  (mouseenter)="highlightedColumn = col.suiteRunId"
                  (mouseleave)="highlightedColumn = null">
                <div class="run-header-content">
                  <div class="run-tags" *ngIf="showTags && col.tags.length > 0">
                    <span class="tag-chip" *ngFor="let tag of col.tags.slice(0, 2)">{{ tag }}</span>
                    <span class="tag-more" *ngIf="col.tags.length > 2">+{{ col.tags.length - 2 }}</span>
                  </div>
                  <div class="run-date">{{ formatDate(col.date) }}</div>
                  <div class="run-pass-rate" *ngIf="showPassRate">
                    <span class="pass-rate-value" [class.high]="col.passRate >= 80" [class.medium]="col.passRate >= 50 && col.passRate < 80" [class.low]="col.passRate < 50">
                      {{ col.passRate.toFixed(0) }}%
                    </span>
                  </div>
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr class="data-row"
                *ngFor="let row of data.rows; trackBy: trackRow"
                [class.highlighted]="highlightedRow === row.testId"
                (mouseenter)="highlightedRow = row.testId"
                (mouseleave)="highlightedRow = null">
              <td class="test-name-cell sticky-col"
                  (click)="onRowHeaderClick(row)">
                <div class="test-name-content" [title]="row.testName">
                  <span class="test-name-text">{{ row.testName }}</span>
                </div>
              </td>
              <td class="result-cell"
                  *ngFor="let col of data.columns; trackBy: trackColumn"
                  [class.highlighted]="highlightedColumn === col.suiteRunId"
                  (click)="onCellClicked(row, col)">
                <div class="cell-content"
                     [ngClass]="getCellClass(getCell(row.testId, col))"
                     [title]="getCellTooltip(getCell(row.testId, col))">
                  <i class="cell-icon" [ngClass]="getCellIcon(getCell(row.testId, col))"></i>
                  <span class="cell-score" *ngIf="showScores && getCell(row.testId, col)?.score != null">
                    {{ ((getCell(row.testId, col)?.score ?? 0) * 100).toFixed(0) }}%
                  </span>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Legend -->
      <div class="matrix-legend" *ngIf="!loading && data && data.columns.length > 0 && showLegend">
        <span class="legend-item passed"><i class="fas fa-check-circle"></i> Passed</span>
        <span class="legend-item failed"><i class="fas fa-times-circle"></i> Failed</span>
        <span class="legend-item error"><i class="fas fa-exclamation-circle"></i> Error</span>
        <span class="legend-item skipped"><i class="fas fa-forward"></i> Skipped</span>
        <span class="legend-item pending"><i class="fas fa-clock"></i> Pending</span>
        <span class="legend-item none"><i class="fas fa-minus"></i> Not Run</span>
      </div>
    </div>
  `,
  styles: [`
    :host {
      display: block;
    }

    .matrix-container {
      position: relative;
      min-height: 200px;
    }

    .matrix-container.loading {
      min-height: 300px;
    }

    /* Loading State */
    .matrix-loading {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 12px;
      padding: 60px 20px;
      color: #64748b;
    }

    .loading-spinner {
      font-size: 32px;
      color: #3b82f6;
    }

    /* Empty State */
    .matrix-empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 60px 20px;
      text-align: center;
      color: #64748b;
    }

    .empty-icon {
      font-size: 48px;
      margin-bottom: 16px;
      opacity: 0.5;
    }

    .matrix-empty h4 {
      margin: 0 0 8px;
      font-size: 18px;
      font-weight: 600;
      color: #1e293b;
    }

    .matrix-empty p {
      margin: 0;
      font-size: 14px;
    }

    /* Matrix Wrapper */
    .matrix-wrapper {
      overflow-x: auto;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      background: white;
    }

    /* Matrix Table */
    .matrix-table {
      width: 100%;
      border-collapse: separate;
      border-spacing: 0;
      font-size: 13px;
    }

    /* Sticky Column */
    .sticky-col {
      position: sticky;
      left: 0;
      z-index: 10;
      background: white;
      border-right: 2px solid #e2e8f0;
    }

    /* Header Row */
    .header-row {
      background: #f8fafc;
    }

    .test-name-header {
      padding: 12px 16px;
      text-align: left;
      font-weight: 600;
      color: #475569;
      min-width: 200px;
      max-width: 250px;
      background: #f8fafc;
    }

    .header-content {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .header-content i {
      color: #94a3b8;
    }

    /* Run Header (Column) */
    .run-header {
      padding: 10px 12px;
      min-width: 100px;
      max-width: 140px;
      text-align: center;
      cursor: pointer;
      transition: background-color 0.15s ease;
      border-left: 1px solid #e2e8f0;
      vertical-align: bottom;
    }

    .run-header:hover,
    .run-header.highlighted {
      background: #f1f5f9;
    }

    .run-header-content {
      display: flex;
      flex-direction: column;
      gap: 4px;
      align-items: center;
    }

    .run-tags {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      justify-content: center;
      margin-bottom: 2px;
    }

    .tag-chip {
      display: inline-block;
      padding: 2px 6px;
      background: #e0f2fe;
      color: #0369a1;
      border-radius: 4px;
      font-size: 10px;
      font-weight: 500;
      max-width: 60px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .tag-more {
      font-size: 10px;
      color: #64748b;
    }

    .run-date {
      font-size: 11px;
      color: #64748b;
      white-space: nowrap;
    }

    .run-pass-rate {
      margin-top: 2px;
    }

    .pass-rate-value {
      font-size: 12px;
      font-weight: 600;
      padding: 2px 6px;
      border-radius: 4px;
    }

    .pass-rate-value.high {
      background: rgba(16, 185, 129, 0.1);
      color: #10b981;
    }

    .pass-rate-value.medium {
      background: rgba(245, 158, 11, 0.1);
      color: #f59e0b;
    }

    .pass-rate-value.low {
      background: rgba(239, 68, 68, 0.1);
      color: #ef4444;
    }

    /* Data Rows */
    .data-row {
      transition: background-color 0.15s ease;
    }

    .data-row:hover,
    .data-row.highlighted {
      background: #f8fafc;
    }

    .data-row:hover .sticky-col,
    .data-row.highlighted .sticky-col {
      background: #f8fafc;
    }

    /* Test Name Cell */
    .test-name-cell {
      padding: 8px 16px;
      border-bottom: 1px solid #f1f5f9;
      cursor: pointer;
    }

    .test-name-cell:hover {
      background: #f1f5f9;
    }

    .test-name-content {
      max-width: 220px;
      overflow: hidden;
    }

    .test-name-text {
      display: block;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: #334155;
      font-weight: 500;
    }

    /* Result Cells */
    .result-cell {
      padding: 6px 8px;
      border-bottom: 1px solid #f1f5f9;
      border-left: 1px solid #f1f5f9;
      text-align: center;
      cursor: pointer;
      transition: all 0.15s ease;
    }

    .result-cell:hover {
      transform: scale(1.05);
      z-index: 5;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
    }

    .result-cell.highlighted {
      background: rgba(59, 130, 246, 0.05);
    }

    .cell-content {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      width: 36px;
      height: 36px;
      margin: 0 auto;
      border-radius: 6px;
      transition: all 0.15s ease;
    }

    .cell-icon {
      font-size: 14px;
    }

    .cell-score {
      font-size: 9px;
      font-weight: 600;
      margin-top: 1px;
    }

    /* Cell Status Colors */
    .cell-passed {
      background: rgba(16, 185, 129, 0.15);
      color: #10b981;
    }

    .cell-failed {
      background: rgba(239, 68, 68, 0.15);
      color: #ef4444;
    }

    .cell-error {
      background: rgba(245, 158, 11, 0.15);
      color: #f59e0b;
    }

    .cell-skipped {
      background: rgba(107, 114, 128, 0.15);
      color: #6b7280;
    }

    .cell-pending {
      background: rgba(139, 92, 246, 0.15);
      color: #8b5cf6;
    }

    .cell-running {
      background: rgba(59, 130, 246, 0.15);
      color: #3b82f6;
    }

    .cell-none {
      background: #f8fafc;
      color: #cbd5e1;
    }

    /* Legend */
    .matrix-legend {
      display: flex;
      flex-wrap: wrap;
      gap: 16px;
      padding: 12px 16px;
      margin-top: 12px;
      background: #f8fafc;
      border-radius: 6px;
      font-size: 12px;
    }

    .legend-item {
      display: flex;
      align-items: center;
      gap: 6px;
      color: #64748b;
    }

    .legend-item i {
      font-size: 12px;
    }

    .legend-item.passed i { color: #10b981; }
    .legend-item.failed i { color: #ef4444; }
    .legend-item.error i { color: #f59e0b; }
    .legend-item.skipped i { color: #6b7280; }
    .legend-item.pending i { color: #8b5cf6; }
    .legend-item.none i { color: #cbd5e1; }

    /* Responsive adjustments */
    @media (max-width: 768px) {
      .test-name-header,
      .test-name-cell {
        min-width: 150px;
        max-width: 180px;
      }

      .run-header {
        min-width: 80px;
        max-width: 100px;
      }

      .cell-content {
        width: 30px;
        height: 30px;
      }

      .cell-icon {
        font-size: 12px;
      }

      .cell-score {
        display: none;
      }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TestResultsMatrixComponent {
  /** Matrix data to display */
  @Input() data: TestResultsMatrixData | null = null;

  /** Loading state */
  @Input() loading = false;

  /** Show tags in column headers */
  @Input() showTags = true;

  /** Show pass rate in column headers */
  @Input() showPassRate = true;

  /** Show scores in cells */
  @Input() showScores = false;

  /** Show legend below matrix */
  @Input() showLegend = true;

  /** Empty state title */
  @Input() emptyTitle = 'No Data Available';

  /** Empty state message */
  @Input() emptyMessage = 'Test results will appear here once suite runs are completed.';

  /** Emitted when a cell is clicked */
  @Output() cellClick = new EventEmitter<MatrixCellClickEvent>();

  /** Emitted when a row header (test name) is clicked */
  @Output() rowClick = new EventEmitter<MatrixRowClickEvent>();

  /** Emitted when a column header (suite run) is clicked */
  @Output() columnClick = new EventEmitter<MatrixColumnClickEvent>();

  // Highlight tracking
  highlightedRow: string | null = null;
  highlightedColumn: string | null = null;

  constructor(private cdr: ChangeDetectorRef) {}

  /**
   * Get the cell data for a specific test and suite run
   */
  getCell(testId: string, column: MatrixColumnData): MatrixCellData | null {
    return column.testResults.get(testId) ?? null;
  }

  /**
   * Get CSS class for cell based on status
   */
  getCellClass(cell: MatrixCellData | null): string {
    if (!cell) return 'cell-none';
    switch (cell.status) {
      case 'Passed': return 'cell-passed';
      case 'Failed': return 'cell-failed';
      case 'Error': return 'cell-error';
      case 'Skipped': return 'cell-skipped';
      case 'Running': return 'cell-running';
      case 'Pending': return 'cell-pending';
      default: return 'cell-none';
    }
  }

  /**
   * Get icon class for cell based on status
   */
  getCellIcon(cell: MatrixCellData | null): string {
    if (!cell) return 'fas fa-minus';
    switch (cell.status) {
      case 'Passed': return 'fas fa-check';
      case 'Failed': return 'fas fa-times';
      case 'Error': return 'fas fa-exclamation';
      case 'Skipped': return 'fas fa-forward';
      case 'Running': return 'fas fa-spinner fa-spin';
      case 'Pending': return 'fas fa-clock';
      default: return 'fas fa-minus';
    }
  }

  /**
   * Get tooltip text for cell
   */
  getCellTooltip(cell: MatrixCellData | null): string {
    if (!cell) return 'Not run in this suite run';
    let tooltip = `${cell.testName}\nStatus: ${cell.status}`;
    if (cell.score != null) tooltip += `\nScore: ${(cell.score * 100).toFixed(1)}%`;
    if (cell.duration != null) tooltip += `\nDuration: ${cell.duration.toFixed(1)}s`;
    if (cell.cost != null) tooltip += `\nCost: $${cell.cost.toFixed(4)}`;
    return tooltip;
  }

  /**
   * Format date for column header
   */
  formatDate(date: Date): string {
    const now = new Date();
    const d = new Date(date);
    const diffMs = now.getTime() - d.getTime();
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffDays === 0) {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (diffDays === 1) {
      return 'Yesterday';
    } else if (diffDays < 7) {
      return `${diffDays}d ago`;
    } else {
      return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
  }

  /**
   * Handle cell click
   */
  onCellClicked(row: MatrixRowData, column: MatrixColumnData): void {
    const cell = this.getCell(row.testId, column);
    if (cell) {
      this.cellClick.emit({
        testRunId: cell.testRunId,
        testId: cell.testId,
        testName: cell.testName,
        suiteRunId: column.suiteRunId,
        status: cell.status
      });
    }
  }

  /**
   * Handle row header click
   */
  onRowHeaderClick(row: MatrixRowData): void {
    this.rowClick.emit({
      testId: row.testId,
      testName: row.testName
    });
  }

  /**
   * Handle column header click
   */
  onColumnHeaderClick(column: MatrixColumnData): void {
    this.columnClick.emit({
      suiteRunId: column.suiteRunId,
      date: column.date,
      tags: column.tags
    });
  }

  /**
   * TrackBy function for columns
   */
  trackColumn(index: number, col: MatrixColumnData): string {
    return col.suiteRunId;
  }

  /**
   * TrackBy function for rows
   */
  trackRow(index: number, row: MatrixRowData): string {
    return row.testId;
  }
}

/**
 * Tree-shaking prevention function
 */
export function LoadTestResultsMatrixComponent() {}
LoadTestResultsMatrixComponent();
