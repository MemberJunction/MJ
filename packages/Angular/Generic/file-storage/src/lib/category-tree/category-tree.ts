import { Component, EventEmitter, OnInit, Output } from '@angular/core';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { RunView } from '@memberjunction/core';
import { MJFileCategoryEntity } from '@memberjunction/core-entities';
import { UUIDsEqual } from '@memberjunction/global';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';

@Component({
  standalone: false,
  selector: 'mj-files-category-tree',
  templateUrl: './category-tree.html',
  styleUrls: ['./category-tree.css'],
})
export class CategoryTreeComponent extends BaseAngularComponent implements OnInit {
  @Output() CategorySelected = new EventEmitter<string | undefined>();

  /**
   * @deprecated Use {@link CategorySelected}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (categorySelected) keeps working. Must stay AFTER CategorySelected: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() categorySelected = this.CategorySelected;

  public isLoading: boolean = false;
  public ShowNew: boolean = false;

  /** @deprecated Use {@link ShowNew}. */
  public get showNew(): boolean {
    return this.ShowNew;
  }
  /** @deprecated Use {@link ShowNew}. */
  public set showNew(value: boolean) {
    this.ShowNew = value;
  }
  public NewCategoryName = '';

  /** @deprecated Use {@link NewCategoryName}. */
  public get newCategoryName() {
    return this.NewCategoryName;
  }
  /** @deprecated Use {@link NewCategoryName}. */
  public set newCategoryName(value) {
    this.NewCategoryName = value;
  }
  public RenameFileCategory: MJFileCategoryEntity | undefined;

  /** @deprecated Use {@link RenameFileCategory}. */
  public get renameFileCategory(): MJFileCategoryEntity | undefined {
    return this.RenameFileCategory;
  }
  /** @deprecated Use {@link RenameFileCategory}. */
  public set renameFileCategory(value: MJFileCategoryEntity | undefined) {
    this.RenameFileCategory = value;
  }

  public CategoriesData: MJFileCategoryEntity[] = [];

  /** @deprecated Use {@link CategoriesData}. */
  public get categoriesData(): MJFileCategoryEntity[] {
    return this.CategoriesData;
  }
  /** @deprecated Use {@link CategoriesData}. */
  public set categoriesData(value: MJFileCategoryEntity[]) {
    this.CategoriesData = value;
  }

  /** Expanded node IDs for the tree */
  public ExpandedIds = new Set<string>();

  /** @deprecated Use {@link ExpandedIds}. */
  public get expandedIds() {
    return this.ExpandedIds;
  }
  /** @deprecated Use {@link ExpandedIds}. */
  public set expandedIds(value) {
    this.ExpandedIds = value;
  }

  /** Currently selected node ID */
  private selectedId: string | undefined;

  /** Context menu state */
  public ContextMenuVisible = false;

  /** @deprecated Use {@link ContextMenuVisible}. */
  public get contextMenuVisible() {
    return this.ContextMenuVisible;
  }
  /** @deprecated Use {@link ContextMenuVisible}. */
  public set contextMenuVisible(value) {
    this.ContextMenuVisible = value;
  }
  public ContextMenuX = 0;

  /** @deprecated Use {@link ContextMenuX}. */
  public get contextMenuX() {
    return this.ContextMenuX;
  }
  /** @deprecated Use {@link ContextMenuX}. */
  public set contextMenuX(value) {
    this.ContextMenuX = value;
  }
  public ContextMenuY = 0;

  /** @deprecated Use {@link ContextMenuY}. */
  public get contextMenuY() {
    return this.ContextMenuY;
  }
  /** @deprecated Use {@link ContextMenuY}. */
  public set contextMenuY(value) {
    this.ContextMenuY = value;
  }
  private contextMenuNode: MJFileCategoryEntity | undefined;

  private get md() { return this.ProviderToUse; }

  constructor(private notifications: MJNotificationService) { super(); }

  ngOnInit(): void {
    this.Refresh();
  }

  /** Returns root-level nodes (no parent). */
  get RootNodes(): MJFileCategoryEntity[] {
    return this.CategoriesData.filter((c) => !c.ParentID);
  }

  /** @deprecated Use {@link RootNodes}. */
  get rootNodes(): MJFileCategoryEntity[] {
    return this.RootNodes;
  }

  /** Checks if a node has children. */
  HasChildren(node: MJFileCategoryEntity): boolean {
    return this.CategoriesData.some((c) => UUIDsEqual(c.ParentID, node.ID));
  }

  /** @deprecated Use {@link HasChildren}. */
  hasChildren(node: MJFileCategoryEntity): boolean {
    return this.HasChildren(node);
  }

  /** Returns children of a node. */
  GetChildren(node: MJFileCategoryEntity): MJFileCategoryEntity[] {
    return this.CategoriesData.filter((c) => UUIDsEqual(c.ParentID, node.ID));
  }

  /** @deprecated Use {@link GetChildren}. */
  getChildren(node: MJFileCategoryEntity): MJFileCategoryEntity[] {
    return this.GetChildren(node);
  }

  /** Checks if a node is expanded. */
  IsExpanded(node: MJFileCategoryEntity): boolean {
    return this.ExpandedIds.has(node.ID);
  }

  /** @deprecated Use {@link IsExpanded}. */
  isExpanded(node: MJFileCategoryEntity): boolean {
    return this.IsExpanded(node);
  }

  /** Toggles expand/collapse on a node. */
  ToggleExpand(node: MJFileCategoryEntity, event: Event): void {
    event.stopPropagation();
    if (this.ExpandedIds.has(node.ID)) {
      this.ExpandedIds.delete(node.ID);
    } else {
      this.ExpandedIds.add(node.ID);
    }
  }

  /** @deprecated Use {@link ToggleExpand}. */
  toggleExpand(node: MJFileCategoryEntity, event: Event): void {
    return this.ToggleExpand(node, event);
  }

  /** Checks if a node is the currently selected node. */
  IsSelected(node: MJFileCategoryEntity): boolean {
    return this.selectedId != null && UUIDsEqual(this.selectedId, node.ID);
  }

  /** @deprecated Use {@link IsSelected}. */
  isSelected(node: MJFileCategoryEntity): boolean {
    return this.IsSelected(node);
  }

  /** Selects a node and emits event. */
  SelectNode(node: MJFileCategoryEntity): void {
    this.selectedId = node.ID;
    this.CategorySelected.emit(node.ID);
  }

  /** @deprecated Use {@link SelectNode}. */
  selectNode(node: MJFileCategoryEntity): void {
    return this.SelectNode(node);
  }

  /** Opens context menu on right-click. */
  OnContextMenu(event: MouseEvent, node: MJFileCategoryEntity): void {
    event.preventDefault();
    event.stopPropagation();
    this.contextMenuNode = node;
    this.ContextMenuX = event.clientX;
    this.ContextMenuY = event.clientY;
    this.ContextMenuVisible = true;
  }

  /** @deprecated Use {@link OnContextMenu}. */
  onContextMenu(event: MouseEvent, node: MJFileCategoryEntity): void {
    return this.OnContextMenu(event, node);
  }

  /** Closes the context menu. */
  CloseContextMenu(): void {
    this.ContextMenuVisible = false;
    this.contextMenuNode = undefined;
  }

  /** @deprecated Use {@link CloseContextMenu}. */
  closeContextMenu(): void {
    return this.CloseContextMenu();
  }

  /** Handles context menu action selection. */
  OnContextMenuAction(action: string): void {
    const node = this.contextMenuNode;
    this.CloseContextMenu();
    if (!node) {
      return;
    }

    switch (action) {
      case 'rename':
        this.RenameFileCategory = node;
        break;
      case 'delete':
        this.DeleteCategory(node);
        break;
    }
  }

  /** @deprecated Use {@link OnContextMenuAction}. */
  onContextMenuAction(action: string): void {
    return this.OnContextMenuAction(action);
  }

  async CreateNewCategory() {
    this.ShowNew = true;
  }

  /** @deprecated Use {@link CreateNewCategory}. */
  async createNewCategory() {
    return this.CreateNewCategory();
  }

  CancelNewCategory() {
    this.ShowNew = false;
  }

  /** @deprecated Use {@link CancelNewCategory}. */
  cancelNewCategory() {
    return this.CancelNewCategory();
  }

  async SaveNewCategory() {
    this.isLoading = true;
    const categoryEntity: MJFileCategoryEntity = await this.md.GetEntityObject('MJ: File Categories', this.md.CurrentUser);
    categoryEntity.NewRecord();
    categoryEntity.Name = this.NewCategoryName;
    await categoryEntity?.Save();
    this.CategoriesData = [...this.CategoriesData, categoryEntity];
    this.ShowNew = false;
    this.NewCategoryName = '';
    this.isLoading = false;
  }

  /** @deprecated Use {@link SaveNewCategory}. */
  async saveNewCategory() {
    return this.SaveNewCategory();
  }

  async DeleteCategory(fileCategory: MJFileCategoryEntity) {
    this.isLoading = true;
    const { ID } = fileCategory;
    const success = await fileCategory.Delete();
    if (!success) {
      console.error('Unable to delete file category:', fileCategory);
      this.notifications.CreateSimpleNotification(`Unable to delete category '${fileCategory.Name}'`, 'error');
      this.isLoading = false;
      return;
    }

    this.CategoriesData = this.CategoriesData.filter((c) => !UUIDsEqual(c.ID, ID));
    this.ClearSelection();
    this.isLoading = false;
  }

  /** @deprecated Use {@link DeleteCategory}. */
  async deleteCategory(fileCategory: MJFileCategoryEntity) {
    return this.DeleteCategory(fileCategory);
  }

  ClearSelection() {
    this.selectedId = undefined;
    this.CategorySelected.emit(undefined);
  }

  /** @deprecated Use {@link ClearSelection}. */
  clearSelection() {
    return this.ClearSelection();
  }

  CancelRename() {
    this.RenameFileCategory?.Revert();
    this.RenameFileCategory = undefined;
  }

  /** @deprecated Use {@link CancelRename}. */
  cancelRename() {
    return this.CancelRename();
  }

  async SaveRename() {
    this.isLoading = true;
    await this.RenameFileCategory?.Save();
    this.RenameFileCategory = undefined;
    this.isLoading = false;
  }

  /** @deprecated Use {@link SaveRename}. */
  async saveRename() {
    return this.SaveRename();
  }

  async Refresh() {
    this.isLoading = true;

    const rv = RunView.FromMetadataProvider(this.ProviderToUse);
    const result = await rv.RunView({
      EntityName: 'MJ: File Categories',
      ResultType: 'entity_object',
    });

    if (result.Success) {
      this.CategoriesData = <MJFileCategoryEntity[]>result.Results;
    } else {
      throw new Error('Error loading file categories: ' + result.ErrorMessage);
    }
    this.isLoading = false;
  }
}
