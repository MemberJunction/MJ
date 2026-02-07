import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
import { PaginationState } from '../types';

/**
 * PaginationComponent - Beautiful pagination controls for entity data
 *
 * Provides a modern, responsive pagination UI with:
 * - Current page / total pages display
 * - Records count with range display
 * - Load more button for progressive loading
 * - Visual loading state
 *
 * @example
 * ```html
 * <mj-pagination
 *   [pagination]="paginationState"
 *   (loadMore)="onLoadMore()">
 * </mj-pagination>
 * ```
 */
@Component({
  standalone: false,
  selector: 'mj-pagination',
  templateUrl: './pagination.component.html',
  styleUrls: ['./pagination.component.css']
})
export class PaginationComponent implements OnChanges {
  /**
   * Current pagination state
   */
  @Input() pagination: PaginationState = {
    currentPage: 0,
    pageSize: 100,
    totalRecords: 0,
    hasMore: false,
    isLoading: false
  };

  /**
   * Number of records currently displayed
   */
  @Input() loadedRecordCount: number = 0;

  /**
   * Emitted when user requests more data
   */
  @Output() loadMore = new EventEmitter<void>();

  /**
   * Emitted when user requests to go to a specific page
   */
  @Output() goToPage = new EventEmitter<number>();

  // Computed display values
  public displayedFrom: number = 0;
  public displayedTo: number = 0;
  public totalPages: number = 0;
  public currentPageDisplay: number = 0;
  public remainingRecords: number = 0;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['pagination'] || changes['loadedRecordCount']) {
      this.updateDisplayValues();
    }
  }

  private updateDisplayValues(): void {
    const { currentPage, pageSize, totalRecords, hasMore } = this.pagination;

    // Calculate display range
    this.displayedFrom = totalRecords > 0 ? 1 : 0;
    this.displayedTo = this.loadedRecordCount;

    // Calculate total pages
    this.totalPages = Math.ceil(totalRecords / pageSize);
    this.currentPageDisplay = currentPage + 1;

    // Calculate remaining records
    this.remainingRecords = Math.max(0, totalRecords - this.loadedRecordCount);
  }

  /**
   * Handle load more button click
   */
  onLoadMore(): void {
    if (!this.pagination.isLoading && this.pagination.hasMore) {
      this.loadMore.emit();
    }
  }

  /**
   * Get the progress percentage for the progress bar
   */
  get progressPercent(): number {
    if (this.pagination.totalRecords === 0) return 100;
    return Math.min(100, (this.loadedRecordCount / this.pagination.totalRecords) * 100);
  }

  /**
   * Get the number of records that will load on next click
   */
  get nextLoadCount(): number {
    return Math.min(this.pagination.pageSize, this.remainingRecords);
  }
}
