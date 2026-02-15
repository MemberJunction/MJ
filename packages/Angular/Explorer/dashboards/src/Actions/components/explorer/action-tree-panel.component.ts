import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnInit,
  OnDestroy,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  HostListener
} from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { MJActionCategoryEntity } from '@memberjunction/core-entities';
import { ActionExplorerStateService } from '../../services/action-explorer-state.service';
import { ActionEntityExtended } from '@memberjunction/actions-base';

export interface CategoryTreeNode {
  category: MJActionCategoryEntity;
  children: CategoryTreeNode[];
  level: number;
  actionCount: number;
  totalActionCount: number; // Including descendants
}

@Component({
  standalone: false,
  selector: 'mj-action-tree-panel',
  templateUrl: './action-tree-panel.component.html',
  styleUrls: ['./action-tree-panel.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ActionTreePanelComponent implements OnInit, OnDestroy {
  @Input() Categories: MJActionCategoryEntity[] = [];
  @Input() Actions: ActionEntityExtended[] = [];
  @Output() CategorySelected = new EventEmitter<string>();
  @Output() NewCategoryClick = new EventEmitter<string | null>(); // parent ID or null for root
  @Output() EditCategoryClick = new EventEmitter<MJActionCategoryEntity>();

  public CategoryTree: CategoryTreeNode[] = [];
  public SelectedCategoryId = 'all';
  public ExpandedCategories: Set<string> = new Set();
  public TreeWidth = 280;
  public IsCollapsed = false;
  public IsResizing = false;
  public SearchTerm = '';
  public FilteredTree: CategoryTreeNode[] = [];

  private destroy$ = new Subject<void>();
  private categoryParentMap = new Map<string, string | null>();
  private categoryDescendants = new Map<string, Set<string>>();

  constructor(
    public StateService: ActionExplorerStateService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.subscribeToState();
    this.buildCategoryTree();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private subscribeToState(): void {
    this.StateService.TreeWidth$.pipe(takeUntil(this.destroy$)).subscribe(width => {
      this.TreeWidth = width;
      this.cdr.markForCheck();
    });

    this.StateService.TreeCollapsed$.pipe(takeUntil(this.destroy$)).subscribe(collapsed => {
      this.IsCollapsed = collapsed;
      this.cdr.markForCheck();
    });

    this.StateService.SelectedCategoryId$.pipe(takeUntil(this.destroy$)).subscribe(id => {
      this.SelectedCategoryId = id;
      this.cdr.markForCheck();
    });

    this.StateService.ExpandedCategories$.pipe(takeUntil(this.destroy$)).subscribe(expanded => {
      this.ExpandedCategories = expanded;
      this.cdr.markForCheck();
    });
  }

  public buildCategoryTree(): void {
    const categoryMap = new Map<string, CategoryTreeNode>();
    this.categoryParentMap.clear();
    this.categoryDescendants.clear();

    // Build action counts per category
    const actionCounts = new Map<string, number>();
    this.Actions.forEach(action => {
      if (action.CategoryID) {
        actionCounts.set(action.CategoryID, (actionCounts.get(action.CategoryID) || 0) + 1);
      }
    });

    // First pass: create all nodes
    this.Categories.forEach(category => {
      categoryMap.set(category.ID, {
        category,
        children: [],
        level: 0,
        actionCount: actionCounts.get(category.ID) || 0,
        totalActionCount: 0
      });
      this.categoryParentMap.set(category.ID, category.ParentID || null);
      this.categoryDescendants.set(category.ID, new Set([category.ID]));
    });

    // Second pass: build tree structure
    const rootNodes: CategoryTreeNode[] = [];
    categoryMap.forEach(node => {
      const parentId = node.category.ParentID;
      if (parentId && categoryMap.has(parentId)) {
        const parent = categoryMap.get(parentId)!;
        parent.children.push(node);
        node.level = parent.level + 1;
      } else {
        rootNodes.push(node);
      }
    });

    // Build descendant mapping
    this.Categories.forEach(category => {
      if (category.ParentID) {
        let currentParentId: string | null = category.ParentID;
        while (currentParentId) {
          const descendants = this.categoryDescendants.get(currentParentId);
          if (descendants) {
            descendants.add(category.ID);
          }
          const parent = categoryMap.get(currentParentId);
          currentParentId = parent?.category.ParentID || null;
        }
      }
    });

    // Calculate total action counts (including descendants)
    const calculateTotalCounts = (node: CategoryTreeNode): number => {
      const descendants = this.categoryDescendants.get(node.category.ID);
      if (descendants) {
        let total = 0;
        descendants.forEach(descId => {
          total += actionCounts.get(descId) || 0;
        });
        node.totalActionCount = total;
        return total;
      }
      return node.actionCount;
    };

    // Sort children at each level and calculate totals
    const sortAndCalculate = (nodes: CategoryTreeNode[]) => {
      nodes.sort((a, b) => a.category.Name.localeCompare(b.category.Name));
      nodes.forEach(node => {
        sortAndCalculate(node.children);
        calculateTotalCounts(node);
      });
    };
    sortAndCalculate(rootNodes);

    this.CategoryTree = rootNodes;
    this.FilteredTree = this.SearchTerm ? this.filterTree(rootNodes, this.SearchTerm.toLowerCase()) : rootNodes;
    this.cdr.markForCheck();
  }

  private filterTree(nodes: CategoryTreeNode[], searchTerm: string): CategoryTreeNode[] {
    const result: CategoryTreeNode[] = [];
    for (const node of nodes) {
      const matchesSearch = node.category.Name.toLowerCase().includes(searchTerm);
      const filteredChildren = this.filterTree(node.children, searchTerm);

      if (matchesSearch || filteredChildren.length > 0) {
        result.push({
          ...node,
          children: filteredChildren
        });
      }
    }
    return result;
  }

  public onSearchChange(term: string): void {
    this.SearchTerm = term;
    this.FilteredTree = term ? this.filterTree(this.CategoryTree, term.toLowerCase()) : this.CategoryTree;
    this.cdr.markForCheck();
  }

  public getTotalActionCount(): number {
    return this.Actions.length;
  }

  public getUncategorizedCount(): number {
    return this.Actions.filter(a => !a.CategoryID).length;
  }

  public selectCategory(categoryId: string): void {
    this.StateService.setSelectedCategoryId(categoryId);
    this.CategorySelected.emit(categoryId);
  }

  public toggleExpanded(categoryId: string, event: MouseEvent): void {
    event.stopPropagation();
    this.StateService.toggleCategoryExpanded(categoryId);
  }

  public isExpanded(categoryId: string): boolean {
    return this.ExpandedCategories.has(categoryId);
  }

  public isSelected(categoryId: string): boolean {
    return this.SelectedCategoryId === categoryId;
  }

  public toggleCollapse(): void {
    this.StateService.toggleTreeCollapsed();
  }

  public onNewCategory(parentId: string | null, event: MouseEvent): void {
    event.stopPropagation();
    this.NewCategoryClick.emit(parentId);
  }

  public onEditCategory(category: MJActionCategoryEntity, event: MouseEvent): void {
    event.stopPropagation();
    this.EditCategoryClick.emit(category);
  }

  public expandAll(): void {
    this.StateService.expandAllCategories(this.Categories.map(c => c.ID));
  }

  public collapseAll(): void {
    this.StateService.collapseAllCategories();
  }

  // Resize handling
  public onResizeStart(event: MouseEvent): void {
    event.preventDefault();
    this.IsResizing = true;
    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none';
  }

  @HostListener('document:mousemove', ['$event'])
  onMouseMove(event: MouseEvent): void {
    if (!this.IsResizing) return;

    const newWidth = event.clientX;
    const clampedWidth = Math.min(
      Math.max(newWidth, this.StateService.TreeWidthMin),
      Math.min(this.StateService.TreeWidthMax, window.innerWidth - 400)
    );

    this.TreeWidth = clampedWidth;
    this.cdr.detectChanges();
  }

  @HostListener('document:mouseup')
  onMouseUp(): void {
    if (this.IsResizing) {
      this.IsResizing = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      this.StateService.setTreeWidth(this.TreeWidth);
    }
  }

  public getCategoryDescendants(categoryId: string): Set<string> {
    return this.categoryDescendants.get(categoryId) || new Set([categoryId]);
  }
}
