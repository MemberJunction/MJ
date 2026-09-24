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
import { MJActionEntityExtended } from '@memberjunction/actions-base';

export interface CategoryTreeNode {
  category: MJActionCategoryEntity;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  children: CategoryTreeNode[];  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  level: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  actionCount: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  totalActionCount: number; // Including descendants — case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
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
  @Input() Actions: MJActionEntityExtended[] = [];
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
    this.BuildCategoryTree();
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

  public BuildCategoryTree(): void {
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

  /** @deprecated Use {@link BuildCategoryTree}. */
  public buildCategoryTree(): void {
    return this.BuildCategoryTree();
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

  public OnSearchChange(term: string): void {
    this.SearchTerm = term;
    this.FilteredTree = term ? this.filterTree(this.CategoryTree, term.toLowerCase()) : this.CategoryTree;
    this.cdr.markForCheck();
  }

  /** @deprecated Use {@link OnSearchChange}. */
  public onSearchChange(term: string): void {
    return this.OnSearchChange(term);
  }

  public GetTotalActionCount(): number {
    return this.Actions.length;
  }

  /** @deprecated Use {@link GetTotalActionCount}. */
  public getTotalActionCount(): number {
    return this.GetTotalActionCount();
  }

  public GetUncategorizedCount(): number {
    return this.Actions.filter(a => !a.CategoryID).length;
  }

  /** @deprecated Use {@link GetUncategorizedCount}. */
  public getUncategorizedCount(): number {
    return this.GetUncategorizedCount();
  }

  public SelectCategory(categoryId: string): void {
    this.StateService.setSelectedCategoryId(categoryId);
    this.CategorySelected.emit(categoryId);
  }

  /** @deprecated Use {@link SelectCategory}. */
  public selectCategory(categoryId: string): void {
    return this.SelectCategory(categoryId);
  }

  public ToggleExpanded(categoryId: string, event: MouseEvent): void {
    event.stopPropagation();
    this.StateService.toggleCategoryExpanded(categoryId);
  }

  /** @deprecated Use {@link ToggleExpanded}. */
  public toggleExpanded(categoryId: string, event: MouseEvent): void {
    return this.ToggleExpanded(categoryId, event);
  }

  public IsExpanded(categoryId: string): boolean {
    return this.ExpandedCategories.has(categoryId);
  }

  /** @deprecated Use {@link IsExpanded}. */
  public isExpanded(categoryId: string): boolean {
    return this.IsExpanded(categoryId);
  }

  public IsSelected(categoryId: string): boolean {
    return this.SelectedCategoryId === categoryId;
  }

  /** @deprecated Use {@link IsSelected}. */
  public isSelected(categoryId: string): boolean {
    return this.IsSelected(categoryId);
  }

  public ToggleCollapse(): void {
    this.StateService.toggleTreeCollapsed();
  }

  /** @deprecated Use {@link ToggleCollapse}. */
  public toggleCollapse(): void {
    return this.ToggleCollapse();
  }

  public OnNewCategory(parentId: string | null, event: MouseEvent): void {
    event.stopPropagation();
    this.NewCategoryClick.emit(parentId);
  }

  /** @deprecated Use {@link OnNewCategory}. */
  public onNewCategory(parentId: string | null, event: MouseEvent): void {
    return this.OnNewCategory(parentId, event);
  }

  public OnEditCategory(category: MJActionCategoryEntity, event: MouseEvent): void {
    event.stopPropagation();
    this.EditCategoryClick.emit(category);
  }

  /** @deprecated Use {@link OnEditCategory}. */
  public onEditCategory(category: MJActionCategoryEntity, event: MouseEvent): void {
    return this.OnEditCategory(category, event);
  }

  public ExpandAll(): void {
    this.StateService.expandAllCategories(this.Categories.map(c => c.ID));
  }

  /** @deprecated Use {@link ExpandAll}. */
  public expandAll(): void {
    return this.ExpandAll();
  }

  public CollapseAll(): void {
    this.StateService.collapseAllCategories();
  }

  /** @deprecated Use {@link CollapseAll}. */
  public collapseAll(): void {
    return this.CollapseAll();
  }

  // Resize handling
  public OnResizeStart(event: MouseEvent): void {
    event.preventDefault();
    this.IsResizing = true;
    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none';
  }

  /** @deprecated Use {@link OnResizeStart}. */
  public onResizeStart(event: MouseEvent): void {
    return this.OnResizeStart(event);
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

  public GetCategoryDescendants(categoryId: string): Set<string> {
    return this.categoryDescendants.get(categoryId) || new Set([categoryId]);
  }

  /** @deprecated Use {@link GetCategoryDescendants}. */
  public getCategoryDescendants(categoryId: string): Set<string> {
    return this.GetCategoryDescendants(categoryId);
  }
}
