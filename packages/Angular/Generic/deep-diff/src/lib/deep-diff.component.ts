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
  get showUnchanged(): boolean {
    return this._showUnchanged;
  }
  set showUnchanged(value: boolean) {
    this._showUnchanged = value;
    this.updateDifferConfig();
    this.generateDiff();
  }

  @Input()
  get maxDepth(): number {
    return this._maxDepth;
  }
  set maxDepth(value: number) {
    this._maxDepth = value;
    this.updateDifferConfig();
    this.generateDiff();
  }

  @Input()
  get maxStringLength(): number {
    return this._maxStringLength;
  }
  set maxStringLength(value: number) {
    this._maxStringLength = value;
    this.updateDifferConfig();
    this.generateDiff();
  }

  @Input()
  get treatNullAsUndefined(): boolean {
    return this._treatNullAsUndefined;
  }
  set treatNullAsUndefined(value: boolean) {
    this._treatNullAsUndefined = value;
    this.updateDifferConfig();
    this.generateDiff();
  }

  @Input() title: string = 'Deep Diff Analysis';
  @Input() showSummary: boolean = true;
  @Input() expandAll: boolean = false;
  @Input() truncateValues: boolean = true;

  diffResult: DeepDiffResult | null = null;
  diffItems: DeepDiffItem[] = [];
  filter: string = '';
  filterType: 'all' | 'added' | 'removed' | 'modified' | 'unchanged' = 'all';
  expandedValuesMap: { [key: string]: boolean } = {};
  
  private differ: DeepDiffer;

  constructor(private cdr: ChangeDetectorRef) {
    this.differ = new DeepDiffer({
      includeUnchanged: false,
      maxDepth: this.maxDepth,
      maxStringLength: this.maxStringLength,
      treatNullAsUndefined: this.treatNullAsUndefined
    });
  }

  ngOnInit(): void {
    this.generateDiff();
  }


  private updateDifferConfig(): void {
    this.differ.updateConfig({
      includeUnchanged: this.showUnchanged,
      maxDepth: this.maxDepth,
      maxStringLength: this.maxStringLength,
      treatNullAsUndefined: this.treatNullAsUndefined
    });
  }

  private generateDiff(): void {
    if (this.oldValue === undefined && this.newValue === undefined) {
      this.diffResult = null;
      this.diffItems = [];
      return;
    }

    this.diffResult = this.differ.diff(this.oldValue, this.newValue);
    this.diffItems = this.buildHierarchicalItems(this.diffResult.changes);
    
    if (this.expandAll) {
      this.expandAllItems();
    }
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

  toggleItem(item: DeepDiffItem): void {
    item.isExpanded = !item.isExpanded;
    this.cdr.markForCheck();
  }

  expandAllItems(): void {
    const expand = (items: DeepDiffItem[]) => {
      for (const item of items) {
        item.isExpanded = true;
        if (item.children.length > 0) {
          expand(item.children);
        }
      }
    };
    expand(this.diffItems);
    this.cdr.markForCheck();
  }

  collapseAllItems(): void {
    const collapse = (items: DeepDiffItem[]) => {
      for (const item of items) {
        item.isExpanded = false;
        if (item.children.length > 0) {
          collapse(item.children);
        }
      }
    };
    collapse(this.diffItems);
    this.cdr.markForCheck();
  }

  get filteredItems(): DeepDiffItem[] {
    if (!this.filter && this.filterType === 'all') {
      return this.diffItems;
    }

    const filterFn = (item: DeepDiffItem): boolean => {
      const matchesType = this.filterType === 'all' || 
        (this.filterType === 'added' && item.type === DiffChangeType.Added) ||
        (this.filterType === 'removed' && item.type === DiffChangeType.Removed) ||
        (this.filterType === 'modified' && item.type === DiffChangeType.Modified) ||
        (this.filterType === 'unchanged' && item.type === DiffChangeType.Unchanged);
      const matchesText = !this.filter || 
        item.path.toLowerCase().includes(this.filter.toLowerCase()) ||
        item.description.toLowerCase().includes(this.filter.toLowerCase());
      
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

    return filterRecursive(this.diffItems);
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

  getTypeClass(type: DiffChangeType): string {
    switch (type) {
      case DiffChangeType.Added: return 'added';
      case DiffChangeType.Removed: return 'removed';
      case DiffChangeType.Modified: return 'modified';
      case DiffChangeType.Unchanged: return 'unchanged';
      default: return '';
    }
  }

  formatValue(value: any, path: string): string {
    if (value === undefined) return 'undefined';
    if (value === null) return 'null';
    
    const isExpanded = !!this.expandedValuesMap[path];
    const shouldTruncate = this.truncateValues && !isExpanded;
    
    if (typeof value === 'string') {
      if (shouldTruncate && value.length > this.maxStringLength) {
        return `"${value.substring(0, this.maxStringLength)}..."`;
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
  
  isValueTruncated(value: any, path: string): boolean {
    if (!this.truncateValues || this.expandedValuesMap[path]) {
      return false;
    }
    
    if (typeof value === 'string') {
      return value.length > this.maxStringLength;
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
  
  toggleValueExpansion(path: string, event: Event): void {
    event.stopPropagation();
    
    // Create a new object to trigger change detection
    this.expandedValuesMap = {
      ...this.expandedValuesMap,
      [path]: !this.expandedValuesMap[path]
    };
    
    // Force change detection
    this.cdr.markForCheck();
  }
  
  private getObjectSize(obj: any): number {
    if (Array.isArray(obj)) {
      return obj.length;
    }
    return Object.keys(obj).length;
  }

  copyToClipboard(text: string): void {
    navigator.clipboard.writeText(text).then(() => {
      // Could add a toast notification here
    });
  }
  
  isExpanded(path: string): boolean {
    return !!this.expandedValuesMap[path];
  }
  
  copyValueToClipboard(value: any, event: Event): void {
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

  exportDiff(): void {
    if (!this.diffResult) return;
    
    const blob = new Blob([JSON.stringify(this.diffResult, null, 2)], 
      { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `diff-${new Date().toISOString()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
}