import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

/**
 * Event emitted when the user navigates to a different page.
 */
export interface PageChangeEvent {
    /** 1-based page number */
    PageNumber: number;
    /** Number of rows per page */
    PageSize: number;
    /** 0-based start row for the new page (convenience: (PageNumber - 1) * PageSize) */
    StartRow: number;
}

/**
 * PaginationComponent — reusable page-based navigation for server-side paged data.
 *
 * Displays "Showing X-Y of Z" summary with first/prev/next/last navigation.
 * Designed for use with RunQuery's StartRow/MaxRows server-side paging.
 *
 * @example
 * ```html
 * <mj-pagination
 *   [TotalRowCount]="result.TotalRowCount"
 *   [PageNumber]="currentPage"
 *   [PageSize]="pageSize"
 *   [IsLoading]="isLoading"
 *   (PageChange)="onPageChange($event)">
 * </mj-pagination>
 * ```
 */
@Component({
    standalone: true,
    selector: 'mj-pagination',
    imports: [CommonModule],
    templateUrl: './pagination.component.html',
    styleUrls: ['./pagination.component.css']
})
export class PaginationComponent {
    /** Total number of rows across all pages */
    @Input() TotalRowCount: number = 0;

    /** Current page number (1-based) */
    @Input() PageNumber: number = 1;

    /** Number of rows per page */
    @Input() PageSize: number = 100;

    /** Whether data is currently loading */
    @Input() IsLoading: boolean = false;

    /** Emitted when the user navigates to a different page */
    @Output() PageChange = new EventEmitter<PageChangeEvent>();

    get TotalPages(): number {
        if (this.TotalRowCount <= 0 || this.PageSize <= 0) return 0;
        return Math.ceil(this.TotalRowCount / this.PageSize);
    }

    get DisplayFrom(): number {
        if (this.TotalRowCount <= 0) return 0;
        return (this.PageNumber - 1) * this.PageSize + 1;
    }

    get DisplayTo(): number {
        return Math.min(this.PageNumber * this.PageSize, this.TotalRowCount);
    }

    get CanGoBack(): boolean {
        return this.PageNumber > 1 && !this.IsLoading;
    }

    get CanGoForward(): boolean {
        return this.PageNumber < this.TotalPages && !this.IsLoading;
    }

    GoToFirst(): void {
        if (this.CanGoBack) this.emitPageChange(1);
    }

    GoToPrevious(): void {
        if (this.CanGoBack) this.emitPageChange(this.PageNumber - 1);
    }

    GoToNext(): void {
        if (this.CanGoForward) this.emitPageChange(this.PageNumber + 1);
    }

    GoToLast(): void {
        if (this.CanGoForward) this.emitPageChange(this.TotalPages);
    }

    private emitPageChange(page: number): void {
        this.PageChange.emit({
            PageNumber: page,
            PageSize: this.PageSize,
            StartRow: (page - 1) * this.PageSize,
        });
    }
}
