import { Component, Input, OnInit, OnChanges, SimpleChanges, ChangeDetectorRef } from '@angular/core';
import { DeepDiffer, DeepDiffResult, DiffChangeType, DiffChange } from '@memberjunction/global';

export interface DeepDiffItem extends DiffChange {
  level: number;
  isExpanded: boolean;
  children: DeepDiffItem[];
  parentPath: string;
}

@Component({
  selector: 'mj-deep-diff',
  templateUrl: './deep-diff.component.html',
  styleUrls: ['./deep-diff.component.css']
})
export class DeepDiffComponent implements OnInit, OnChanges {
  @Input() oldValue: any;
  @Input() newValue: any;
  @Input() title: string = 'Deep Diff Analysis';
  @Input() showSummary: boolean = true;
  @Input() showUnchanged: boolean = false;
  @Input() expandAll: boolean = false;
  @Input() maxDepth: number = 10;
  @Input() maxStringLength: number = 100;

  diffResult: DeepDiffResult | null = null;
  diffItems: DeepDiffItem[] = [];
  filter: string = '';
  filterType: 'all' | 'added' | 'removed' | 'modified' | 'unchanged' = 'all';
  
  private differ: DeepDiffer;

  constructor(private cdr: ChangeDetectorRef) {
    this.differ = new DeepDiffer({
      includeUnchanged: false,
      maxDepth: this.maxDepth,
      maxStringLength: this.maxStringLength
    });
  }

  ngOnInit(): void {
    this.generateDiff();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['oldValue'] || changes['newValue'] || changes['showUnchanged'] || 
        changes['maxDepth'] || changes['maxStringLength']) {
      this.updateDifferConfig();
      this.generateDiff();
    }
  }

  private updateDifferConfig(): void {
    this.differ.updateConfig({
      includeUnchanged: this.showUnchanged,
      maxDepth: this.maxDepth,
      maxStringLength: this.maxStringLength
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

  formatValue(value: any): string {
    if (value === undefined) return 'undefined';
    if (value === null) return 'null';
    if (typeof value === 'string') {
      return value.length > this.maxStringLength ? 
        `"${value.substring(0, this.maxStringLength)}..."` : 
        `"${value}"`;
    }
    if (typeof value === 'object') {
      try {
        const json = JSON.stringify(value, null, 2);
        return json.length > 200 ? json.substring(0, 200) + '...' : json;
      } catch {
        return String(value);
      }
    }
    return String(value);
  }

  copyToClipboard(text: string): void {
    navigator.clipboard.writeText(text).then(() => {
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