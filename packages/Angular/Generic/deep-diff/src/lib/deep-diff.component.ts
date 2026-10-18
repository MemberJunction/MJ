import { Component, Input, OnInit, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { DeepDiffer, DeepDiffResult, DiffChangeType, DiffChange } from '@memberjunction/global';

export interface DeepDiffItem extends DiffChange {
  level: number;
  isExpanded: boolean;
  children: DeepDiffItem[];
  parentPath: string;
}

@Component({
  standalone: false,
  selector: 'mj-deep-diff',
  templateUrl: './deep-diff.component.html',
  styleUrls: ['./deep-diff.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DeepDiffComponent implements OnInit {
  private _oldValue: any;
  private _newValue: any;
  private _showUnchanged: boolean = false;
  private _maxDepth: number = 10;
  private _maxStringLength: number = 100;
  private _treatNullAsUndefined: boolean = false;

  @Input()
  get oldValue(): any {
    return this._oldValue;
  }
  set oldValue(value: any) {
    this._oldValue = value;
    this.generateDiff();
  }

  @Input()
  get newValue(): any {
    return this._newValue;
  }
  set newValue(value: any) {
    this._newValue = value;
    this.generateDiff();
  }

  @Input()
  get ShowUnchanged(): boolean {
    return this._showUnchanged;
  }
  set ShowUnchanged(value: boolean) {
    this._showUnchanged = value;
    this.updateDifferConfig();
    this.generateDiff();
  }

  /** @deprecated Use {@link ShowUnchanged}. */
  get showUnchanged(): boolean {
    return this.ShowUnchanged;
  }
  /** @deprecated Use {@link ShowUnchanged}. */
  @Input() set showUnchanged(value: boolean) {
    this.ShowUnchanged = value;
  }

  @Input()
  get MaxDepth(): number {
    return this._maxDepth;
  }
  set MaxDepth(value: number) {
    this._maxDepth = value;
    this.updateDifferConfig();
    this.generateDiff();
  }

  /** @deprecated Use {@link MaxDepth}. */
  get maxDepth(): number {
    return this.MaxDepth;
  }
  /** @deprecated Use {@link MaxDepth}. */
  @Input() set maxDepth(value: number) {
    this.MaxDepth = value;
  }

  @Input()
  get MaxStringLength(): number {
    return this._maxStringLength;
  }
  set MaxStringLength(value: number) {
    this._maxStringLength = value;
    this.updateDifferConfig();
    this.generateDiff();
  }

  /** @deprecated Use {@link MaxStringLength}. */
  get maxStringLength(): number {
    return this.MaxStringLength;
  }
  /** @deprecated Use {@link MaxStringLength}. */
  @Input() set maxStringLength(value: number) {
    this.MaxStringLength = value;
  }

  @Input()
  get TreatNullAsUndefined(): boolean {
    return this._treatNullAsUndefined;
  }
  set TreatNullAsUndefined(value: boolean) {
    this._treatNullAsUndefined = value;
    this.updateDifferConfig();
    this.generateDiff();
  }

  /** @deprecated Use {@link TreatNullAsUndefined}. */
  get treatNullAsUndefined(): boolean {
    return this.TreatNullAsUndefined;
  }
  /** @deprecated Use {@link TreatNullAsUndefined}. */
  @Input() set treatNullAsUndefined(value: boolean) {
    this.TreatNullAsUndefined = value;
  }

  @Input() title: string = 'Deep Diff Analysis';
  @Input() ShowSummary: boolean = true;

  /** @deprecated Use {@link ShowSummary}. */
  @Input() set showSummary(value: boolean) {
    this.ShowSummary = value;
  }
  /** @deprecated Use {@link ShowSummary}. */
  get showSummary(): boolean {
    return this.ShowSummary;
  }
  @Input() ExpandAll: boolean = false;

  /** @deprecated Use {@link ExpandAll}. */
  @Input() set expandAll(value: boolean) {
    this.ExpandAll = value;
  }
  /** @deprecated Use {@link ExpandAll}. */
  get expandAll(): boolean {
    return this.ExpandAll;
  }
  @Input() TruncateValues: boolean = true;

  /** @deprecated Use {@link TruncateValues}. */
  @Input() set truncateValues(value: boolean) {
    this.TruncateValues = value;
  }
  /** @deprecated Use {@link TruncateValues}. */
  get truncateValues(): boolean {
    return this.TruncateValues;
  }

  DiffResult: DeepDiffResult | null = null;

  /** @deprecated Use {@link DiffResult}. */
  get diffResult(): DeepDiffResult | null {
    return this.DiffResult;
  }
  /** @deprecated Use {@link DiffResult}. */
  set diffResult(value: DeepDiffResult | null) {
    this.DiffResult = value;
  }
  DiffItems: DeepDiffItem[] = [];

  /** @deprecated Use {@link DiffItems}. */
  get diffItems(): DeepDiffItem[] {
    return this.DiffItems;
  }
  /** @deprecated Use {@link DiffItems}. */
  set diffItems(value: DeepDiffItem[]) {
    this.DiffItems = value;
  }

  private _filter: string = '';
  get Filter(): string {
    return this._filter;
  }
  set Filter(value: string) {
    this._filter = value;
    this.recomputeFilteredItems();
  }

  /** @deprecated Use {@link Filter}. */
  get filter(): string {
    return this.Filter;
  }
  /** @deprecated Use {@link Filter}. */
  set filter(value: string) {
    this.Filter = value;
  }

  private _filterType: 'all' | 'added' | 'removed' | 'modified' | 'unchanged' = 'all';
  get FilterType(): 'all' | 'added' | 'removed' | 'modified' | 'unchanged' {
    return this._filterType;
  }
  set FilterType(value: 'all' | 'added' | 'removed' | 'modified' | 'unchanged') {
    this._filterType = value;
    this.recomputeFilteredItems();
  }

  /** @deprecated Use {@link FilterType}. */
  get filterType(): 'all' | 'added' | 'removed' | 'modified' | 'unchanged' {
    return this.FilterType;
  }
  /** @deprecated Use {@link FilterType}. */
  set filterType(value: 'all' | 'added' | 'removed' | 'modified' | 'unchanged') {
    this.FilterType = value;
  }

  /**
   * Precomputed filtered diff tree. Recomputed only when the source data
   * (`diffItems`) or the filter inputs (`filter` / `filterType`) change —
   * never on every change-detection cycle. Bound directly by the template's
   * `@for` and empty-state length check, which preserves `@for` referential
   * stability between CD passes (the recursive walk no longer runs >= 2x/CD).
   */
  FilteredItems: DeepDiffItem[] = [];

  /** @deprecated Use {@link FilteredItems}. */
  get filteredItems(): DeepDiffItem[] {
    return this.FilteredItems;
  }
  /** @deprecated Use {@link FilteredItems}. */
  set filteredItems(value: DeepDiffItem[]) {
    this.FilteredItems = value;
  }

  ExpandedValuesMap: { [key: string]: boolean } = {};

  /** @deprecated Use {@link ExpandedValuesMap}. */
  get expandedValuesMap(): { [key: string]: boolean } {
    return this.ExpandedValuesMap;
  }
  /** @deprecated Use {@link ExpandedValuesMap}. */
  set expandedValuesMap(value: { [key: string]: boolean }) {
    this.ExpandedValuesMap = value;
  }

  /**
   * Memoization cache for {@link formatValue} / {@link isValueTruncated}. Keyed
   * by `${path}|${expanded}` so the expensive `JSON.stringify` of object values
   * runs at most once per (path, expansion-state) instead of on every
   * change-detection cycle (the template binds these in a recursive `@for`).
   * Invalidated whenever the source data is regenerated.
   */
  private formatValueCache = new Map<string, string>();
  private truncatedCache = new Map<string, boolean>();

  private differ: DeepDiffer;

  constructor(private cdr: ChangeDetectorRef) {
    this.differ = new DeepDiffer({
      includeUnchanged: false,
      maxDepth: this.MaxDepth,
      maxStringLength: this.MaxStringLength,
      treatNullAsUndefined: this.TreatNullAsUndefined
    });
  }

  ngOnInit(): void {
    this.generateDiff();
  }


  private updateDifferConfig(): void {
    this.differ.updateConfig({
      includeUnchanged: this.ShowUnchanged,
      maxDepth: this.MaxDepth,
      maxStringLength: this.MaxStringLength,
      treatNullAsUndefined: this.TreatNullAsUndefined
    });
  }

  private generateDiff(): void {
    if (this.oldValue === undefined && this.newValue === undefined) {
      this.formatValueCache.clear();
      this.truncatedCache.clear();
      this.DiffResult = null;
      this.DiffItems = [];
      this.recomputeFilteredItems();
      return;
    }

    this.formatValueCache.clear();
    this.truncatedCache.clear();
    this.DiffResult = this.differ.diff(this.oldValue, this.newValue);
    this.DiffItems = this.buildHierarchicalItems(this.DiffResult.changes);

    if (this.ExpandAll) {
      this.ExpandAllItems();
    }

    this.recomputeFilteredItems();
  }

  private buildHierarchicalItems(changes: DiffChange[]): DeepDiffItem[] {
    const rootItems: DeepDiffItem[] = [];
    const itemMap = new Map<string, DeepDiffItem>();

    // Sort by path to ensure parents come before children
    const sortedChanges = [...changes].sort((a, b) => {
      const aDepth = a.path.split('.').length;
      const bDepth = b.path.split('.').length;
      if (aDepth !== bDepth) return aDepth - bDepth;
      return a.path.localeCompare(b.path);
    });

    for (const change of sortedChanges) {
      const pathParts = change.path === 'root' ? [] : change.path.split('.');
      const level = pathParts.length;
      const parentPath = pathParts.slice(0, -1).join('.');
      
      const item: DeepDiffItem = {
        ...change,
        level,
        isExpanded: level === 0,  // Expand only root level items by default
        children: [],
        parentPath
      };

      itemMap.set(change.path, item);

      if (parentPath && itemMap.has(parentPath)) {
        itemMap.get(parentPath)!.children.push(item);
      } else {
        rootItems.push(item);
      }
    }

    return rootItems;
  }

  ToggleItem(item: DeepDiffItem): void {
    item.isExpanded = !item.isExpanded;
    this.cdr.markForCheck();
  }

  /** @deprecated Use {@link ToggleItem}. */
  toggleItem(item: DeepDiffItem): void {
    return this.ToggleItem(item);
  }

  ExpandAllItems(): void {
    const expand = (items: DeepDiffItem[]) => {
      for (const item of items) {
        item.isExpanded = true;
        if (item.children.length > 0) {
          expand(item.children);
        }
      }
    };
    expand(this.DiffItems);
    this.cdr.markForCheck();
  }

  /** @deprecated Use {@link ExpandAllItems}. */
  expandAllItems(): void {
    return this.ExpandAllItems();
  }

  CollapseAllItems(): void {
    const collapse = (items: DeepDiffItem[]) => {
      for (const item of items) {
        item.isExpanded = false;
        if (item.children.length > 0) {
          collapse(item.children);
        }
      }
    };
    collapse(this.DiffItems);
    this.cdr.markForCheck();
  }

  /** @deprecated Use {@link CollapseAllItems}. */
  collapseAllItems(): void {
    return this.CollapseAllItems();
  }

  /**
   * Recomputes {@link filteredItems} from the current `diffItems` + filter
   * inputs. Called from `generateDiff()` (data change) and from the
   * `filter` / `filterType` setters (filter change) — NOT per CD cycle.
   */
  private recomputeFilteredItems(): void {
    if (!this.Filter && this.FilterType === 'all') {
      this.FilteredItems = this.DiffItems;
      this.cdr.markForCheck();
      return;
    }

    const filterFn = (item: DeepDiffItem): boolean => {
      const matchesType = this.FilterType === 'all' || 
        (this.FilterType === 'added' && item.type === DiffChangeType.Added) ||
        (this.FilterType === 'removed' && item.type === DiffChangeType.Removed) ||
        (this.FilterType === 'modified' && item.type === DiffChangeType.Modified) ||
        (this.FilterType === 'unchanged' && item.type === DiffChangeType.Unchanged);
      const matchesText = !this.Filter || 
        item.path.toLowerCase().includes(this.Filter.toLowerCase()) ||
        item.description.toLowerCase().includes(this.Filter.toLowerCase());
      
      return matchesType && matchesText;
    };

    const filterRecursive = (items: DeepDiffItem[]): DeepDiffItem[] => {
      return items.reduce((acc, item) => {
        const childMatches = filterRecursive(item.children);
        if (filterFn(item) || childMatches.length > 0) {
          acc.push({
            ...item,
            children: childMatches,
            isExpanded: item.isExpanded  // Preserve the original expanded state
          });
        }
        return acc;
      }, [] as DeepDiffItem[]);
    };

    this.FilteredItems = filterRecursive(this.DiffItems);
    this.cdr.markForCheck();
  }

  getIcon(type: DiffChangeType): string {
    switch (type) {
      case DiffChangeType.Added: return 'fa-plus-circle';
      case DiffChangeType.Removed: return 'fa-minus-circle';
      case DiffChangeType.Modified: return 'fa-edit';
      case DiffChangeType.Unchanged: return 'fa-check-circle';
      default: return 'fa-question-circle';
    }
  }

  GetTypeClass(type: DiffChangeType): string {
    switch (type) {
      case DiffChangeType.Added: return 'added';
      case DiffChangeType.Removed: return 'removed';
      case DiffChangeType.Modified: return 'modified';
      case DiffChangeType.Unchanged: return 'unchanged';
      default: return '';
    }
  }

  /** @deprecated Use {@link GetTypeClass}. */
  getTypeClass(type: DiffChangeType): string {
    return this.GetTypeClass(type);
  }

  formatValue(value: any, path: string): string {
    if (value === undefined) return 'undefined';
    if (value === null) return 'null';

    const isExpanded = !!this.ExpandedValuesMap[path];
    const cacheKey = `${path}|${isExpanded ? 1 : 0}`;
    const cached = this.formatValueCache.get(cacheKey);
    if (cached !== undefined) return cached;

    const formatted = this.computeFormattedValue(value, isExpanded);
    this.formatValueCache.set(cacheKey, formatted);
    return formatted;
  }

  private computeFormattedValue(value: any, isExpanded: boolean): string {
    const shouldTruncate = this.TruncateValues && !isExpanded;

    if (typeof value === 'string') {
      if (shouldTruncate && value.length > this.MaxStringLength) {
        return `"${value.substring(0, this.MaxStringLength)}..."`;
      }
      return `"${value}"`;
    }
    
    if (typeof value === 'object') {
      try {
        const json = JSON.stringify(value, null, 2);
        if (shouldTruncate && json.length > 200) {
          // Show a preview for objects
          const preview = JSON.stringify(value).substring(0, 50);
          return `${preview}... (${this.getObjectSize(value)} properties)`;
        }
        return json;
      } catch {
        return String(value);
      }
    }
    
    return String(value);
  }
  
  IsValueTruncated(value: any, path: string): boolean {
    if (!this.TruncateValues || this.ExpandedValuesMap[path]) {
      return false;
    }

    const cacheKey = `${path}|0`;
    const cached = this.truncatedCache.get(cacheKey);
    if (cached !== undefined) return cached;

    const result = this.computeValueTruncated(value);
    this.truncatedCache.set(cacheKey, result);
    return result;
  }

  /** @deprecated Use {@link IsValueTruncated}. */
  isValueTruncated(value: any, path: string): boolean {
    return this.IsValueTruncated(value, path);
  }

  private computeValueTruncated(value: any): boolean {
    if (typeof value === 'string') {
      return value.length > this.MaxStringLength;
    }
    
    if (typeof value === 'object' && value !== null) {
      try {
        const json = JSON.stringify(value, null, 2);
        return json.length > 200;
      } catch {
        return false;
      }
    }
    
    return false;
  }
  
  ToggleValueExpansion(path: string, event: Event): void {
    event.stopPropagation();
    
    // Create a new object to trigger change detection
    this.ExpandedValuesMap = {
      ...this.ExpandedValuesMap,
      [path]: !this.ExpandedValuesMap[path]
    };
    
    // Force change detection
    this.cdr.markForCheck();
  }

  /** @deprecated Use {@link ToggleValueExpansion}. */
  toggleValueExpansion(path: string, event: Event): void {
    return this.ToggleValueExpansion(path, event);
  }
  
  private getObjectSize(obj: any): number {
    if (Array.isArray(obj)) {
      return obj.length;
    }
    return Object.keys(obj).length;
  }

  CopyToClipboard(text: string): void {
    navigator.clipboard.writeText(text).then(() => {
      // Could add a toast notification here
    });
  }

  /** @deprecated Use {@link CopyToClipboard}. */
  copyToClipboard(text: string): void {
    return this.CopyToClipboard(text);
  }
  
  IsExpanded(path: string): boolean {
    return !!this.ExpandedValuesMap[path];
  }

  /** @deprecated Use {@link IsExpanded}. */
  isExpanded(path: string): boolean {
    return this.IsExpanded(path);
  }
  
  CopyValueToClipboard(value: any, event: Event): void {
    event.stopPropagation();
    let textToCopy: string;
    
    if (value === undefined) {
      textToCopy = 'undefined';
    } else if (value === null) {
      textToCopy = 'null';
    } else if (typeof value === 'object') {
      try {
        textToCopy = JSON.stringify(value, null, 2);
      } catch {
        textToCopy = String(value);
      }
    } else {
      textToCopy = String(value);
    }
    
    navigator.clipboard.writeText(textToCopy).then(() => {
      // Could add a toast notification here
    });
  }

  /** @deprecated Use {@link CopyValueToClipboard}. */
  copyValueToClipboard(value: any, event: Event): void {
    return this.CopyValueToClipboard(value, event);
  }

  ExportDiff(): void {
    if (!this.DiffResult) return;
    
    const blob = new Blob([JSON.stringify(this.DiffResult, null, 2)], 
      { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `diff-${new Date().toISOString()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /** @deprecated Use {@link ExportDiff}. */
  exportDiff(): void {
    return this.ExportDiff();
  }
}