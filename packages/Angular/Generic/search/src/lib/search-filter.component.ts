/**
 * @fileoverview Search Filter Component
 *
 * Faceted filter sidebar for narrowing search results.
 * Displays filter categories with checkable options and counts.
 */

import {
    Component,
    EventEmitter,
    Input,
    Output,
    ChangeDetectorRef,
    inject
} from '@angular/core';
import { SearchFilter, SearchFilterChangeEvent } from './search-types';

@Component({
    standalone: false,
    selector: 'mj-search-filter',
    templateUrl: './search-filter.component.html',
    styleUrls: ['./search-filter.component.css']
})
export class SearchFilterComponent {
    private cdr = inject(ChangeDetectorRef);

    /** Available filters to display */
    @Input() Filters: SearchFilter[] = [];

    /** Currently active filter selections */
    @Input() ActiveFilters: Record<string, string[]> = {};

    /** Whether the filter panel is collapsible */
    @Input() Collapsible = true;

    @Output() FilterChanged = new EventEmitter<SearchFilterChangeEvent>();
    @Output() FiltersCleared = new EventEmitter<void>();
    @Output() CloseRequested = new EventEmitter<void>();

    /** Collapsed state per category */
    public CollapsedCategories = new Set<string>();

    /** Toggle a filter option */
    public ToggleOption(category: string, value: string): void {
        const current = this.ActiveFilters[category] ? [...this.ActiveFilters[category]] : [];
        const index = current.indexOf(value);
        if (index >= 0) {
            current.splice(index, 1);
        } else {
            current.push(value);
        }
        // Update local state to reflect change
        this.ActiveFilters = { ...this.ActiveFilters, [category]: current };
        this.FilterChanged.emit({ Category: category, SelectedValues: current });
        this.cdr.detectChanges();
    }

    /** Toggle category collapse */
    public ToggleCategory(category: string): void {
        if (!this.Collapsible) return;
        if (this.CollapsedCategories.has(category)) {
            this.CollapsedCategories.delete(category);
        } else {
            this.CollapsedCategories.add(category);
        }
        this.cdr.detectChanges();
    }

    /** Check if a category is collapsed */
    public IsCategoryCollapsed(category: string): boolean {
        return this.CollapsedCategories.has(category);
    }

    /** Check if an option is selected */
    public IsOptionSelected(category: string, value: string): boolean {
        return (this.ActiveFilters[category] ?? []).includes(value);
    }

    /** Check if any filters are active */
    public HasActiveFilters(): boolean {
        return Object.values(this.ActiveFilters).some(v => v.length > 0);
    }

    /** Get total active filter count */
    public GetActiveFilterCount(): number {
        return Object.values(this.ActiveFilters).reduce((sum, v) => sum + v.length, 0);
    }

    /** Clear all filters */
    public ClearAll(): void {
        this.ActiveFilters = {};
        this.FiltersCleared.emit();
        this.cdr.detectChanges();
    }

    /** Select all options in a category, or clear all if already all selected */
    public SelectAll(category: string): void {
        const filter = this.Filters.find(f => f.Category === category);
        if (!filter) return;

        const current = this.ActiveFilters[category] ?? [];
        if (current.length === filter.Options.length) {
            // All selected → clear
            this.ActiveFilters[category] = [];
        } else {
            // Select all
            this.ActiveFilters[category] = filter.Options.map(o => o.Value);
        }
        this.FilterChanged.emit({ Category: category, SelectedValues: this.ActiveFilters[category] });
        this.cdr.detectChanges();
    }

    /** Check if all options in a category are selected */
    public IsAllSelected(category: string): boolean {
        const filter = this.Filters.find(f => f.Category === category);
        if (!filter) return false;
        const selection = this.ActiveFilters[category] ?? [];
        return selection.length === filter.Options.length;
    }
}
