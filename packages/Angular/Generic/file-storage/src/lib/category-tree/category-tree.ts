import { Component, EventEmitter, OnInit, Output } from '@angular/core';
import { RunView } from '@memberjunction/core';
import { MJFileCategoryEntity } from '@memberjunction/core-entities';
import { SharedService } from '@memberjunction/ng-shared';
import { UUIDsEqual } from '@memberjunction/global';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';

@Component({
  standalone: false,
  selector: 'mj-files-category-tree',
  templateUrl: './category-tree.html',
  styleUrls: ['./category-tree.css'],
})
export class CategoryTreeComponent extends BaseAngularComponent implements OnInit {
  @Output() categorySelected = new EventEmitter<string | undefined>();

  public isLoading: boolean = false;
  public showNew: boolean = false;
  public newCategoryName = '';
  public renameFileCategory: MJFileCategoryEntity | undefined;

  public categoriesData: MJFileCategoryEntity[] = [];

  /** Expanded node IDs for the tree */
  public expandedIds = new Set<string>();

  /** Currently selected node ID */
  private selectedId: string | undefined;

  /** Context menu state */
  public contextMenuVisible = false;
  public contextMenuX = 0;
  public contextMenuY = 0;
  private contextMenuNode: MJFileCategoryEntity | undefined;

  private get md() { return this.ProviderToUse; }

  constructor(private sharedService: SharedService) { super(); }

  ngOnInit(): void {
    this.Refresh();
  }

  /** Returns root-level nodes (no parent). */
  get rootNodes(): MJFileCategoryEntity[] {
    return this.categoriesData.filter((c) => !c.ParentID);
  }

  /** Checks if a node has children. */
  hasChildren(node: MJFileCategoryEntity): boolean {
    return this.categoriesData.some((c) => UUIDsEqual(c.ParentID, node.ID));
  }

  /** Returns children of a node. */
  getChildren(node: MJFileCategoryEntity): MJFileCategoryEntity[] {
    return this.categoriesData.filter((c) => UUIDsEqual(c.ParentID, node.ID));
  }

  /** Checks if a node is expanded. */
  isExpanded(node: MJFileCategoryEntity): boolean {
    return this.expandedIds.has(node.ID);
  }

  /** Toggles expand/collapse on a node. */
  toggleExpand(node: MJFileCategoryEntity, event: Event): void {
    event.stopPropagation();
    if (this.expandedIds.has(node.ID)) {
      this.expandedIds.delete(node.ID);
    } else {
      this.expandedIds.add(node.ID);
    }
  }

  /** Checks if a node is the currently selected node. */
  isSelected(node: MJFileCategoryEntity): boolean {
    return this.selectedId != null && UUIDsEqual(this.selectedId, node.ID);
  }

  /** Selects a node and emits event. */
  selectNode(node: MJFileCategoryEntity): void {
    this.selectedId = node.ID;
    this.categorySelected.emit(node.ID);
  }

  /** Opens context menu on right-click. */
  onContextMenu(event: MouseEvent, node: MJFileCategoryEntity): void {
    event.preventDefault();
    event.stopPropagation();
    this.contextMenuNode = node;
    this.contextMenuX = event.clientX;
    this.contextMenuY = event.clientY;
    this.contextMenuVisible = true;
  }

  /** Closes the context menu. */
  closeContextMenu(): void {
    this.contextMenuVisible = false;
    this.contextMenuNode = undefined;
  }

  /** Handles context menu action selection. */
  onContextMenuAction(action: string): void {
    const node = this.contextMenuNode;
    this.closeContextMenu();
    if (!node) {
      return;
    }

    switch (action) {
      case 'rename':
        this.renameFileCategory = node;
        break;
      case 'delete':
        this.deleteCategory(node);
        break;
    }
  }

  async createNewCategory() {
    this.showNew = true;
  }

  cancelNewCategory() {
    this.showNew = false;
  }

  async saveNewCategory() {
    this.isLoading = true;
    const categoryEntity: MJFileCategoryEntity = await this.md.GetEntityObject('MJ: File Categories', this.md.CurrentUser);
    categoryEntity.NewRecord();
    categoryEntity.Name = this.newCategoryName;
    await categoryEntity?.Save();
    this.categoriesData = [...this.categoriesData, categoryEntity];
    this.showNew = false;
    this.newCategoryName = '';
    this.isLoading = false;
  }

  async deleteCategory(fileCategory: MJFileCategoryEntity) {
    this.isLoading = true;
    const { ID } = fileCategory;
    const success = await fileCategory.Delete();
    if (!success) {
      console.error('Unable to delete file category:', fileCategory);
      this.sharedService.CreateSimpleNotification(`Unable to delete category '${fileCategory.Name}'`, 'error');
      this.isLoading = false;
      return;
    }

    this.categoriesData = this.categoriesData.filter((c) => !UUIDsEqual(c.ID, ID));
    this.clearSelection();
    this.isLoading = false;
  }

  clearSelection() {
    this.selectedId = undefined;
    this.categorySelected.emit(undefined);
  }

  cancelRename() {
    this.renameFileCategory?.Revert();
    this.renameFileCategory = undefined;
  }

  async saveRename() {
    this.isLoading = true;
    await this.renameFileCategory?.Save();
    this.renameFileCategory = undefined;
    this.isLoading = false;
  }

  async Refresh() {
    this.isLoading = true;

    const rv = RunView.FromMetadataProvider(this.ProviderToUse);
    const result = await rv.RunView({
      EntityName: 'MJ: File Categories',
      ResultType: 'entity_object',
    });

    if (result.Success) {
      this.categoriesData = <MJFileCategoryEntity[]>result.Results;
    } else {
      throw new Error('Error loading file categories: ' + result.ErrorMessage);
    }
    this.isLoading = false;
  }
}
