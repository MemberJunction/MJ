import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { MJCollectionEntity } from '@memberjunction/core-entities';
import { UserInfo, RunView, Metadata, LogError } from '@memberjunction/core';
import { CollectionPermission, CollectionPermissionService } from '../../services/collection-permission.service';
import { UUIDsEqual } from '@memberjunction/global';
import { MJConfirmService } from '@memberjunction/ng-ui-components';

interface TreeNode {
  collection: MJCollectionEntity;
  children: TreeNode[];
  expanded: boolean;
  level: number;
}

interface DragData {
  collectionId: string;
  parentId: string | null;
}

@Component({
  standalone: false,
  selector: 'mj-collection-tree',
  template: `
    <div class="collection-tree">
      <div class="tree-header">
        <h3>Collections</h3>
        @if (canCreateAtRoot()) {
          <button class="btn-new" (click)="onCreateCollection(null)" title="New Collection">
            <i class="fas fa-plus"></i>
          </button>
        }
      </div>

      <div
        class="tree-content"
        [class.drag-over-root]="dragOverNodeId === 'root'"
        (dragover)="onDragOverRoot($event)"
        (drop)="onDropRoot($event)">
        @for (node of treeNodes; track node.collection.ID) {
          <div class="tree-node-wrapper">
            <div
              class="tree-node"
              [class.selected]="IsCollectionSelected(node)"
              [class.drag-over]="dragOverNodeId === node.collection.ID"
              [class.dragging]="IsCollectionDragging(node)"
              [style.padding-left.px]="node.level * 20"
              [draggable]="true"
              (click)="onSelectCollection(node.collection)"
              (dragstart)="onDragStart($event, node)"
              (dragend)="onDragEnd($event)"
              (dragover)="onDragOver($event, node)"
              (dragleave)="onDragLeave($event, node)"
              (drop)="onDrop($event, node)">
              @if (node.children.length > 0) {
                <i
                  class="fas toggle-icon"
                  [ngClass]="node.expanded ? 'fa-chevron-down' : 'fa-chevron-right'"
                  (click)="toggleNode(node, $event)">
                </i>
              }
              <i class="fas fa-folder collection-icon" [style.color]="node.collection.Color || '#0076B6'"></i>
              <span class="collection-name">{{ node.collection.Name }}</span>
              <div class="node-actions" (click)="$event.stopPropagation()">
                @if (canEdit(node.collection)) {
                  <button class="node-action-btn" (click)="onCreateCollection(node.collection.ID)" title="Add sub-collection">
                    <i class="fas fa-plus"></i>
                  </button>
                }
                @if (canDelete(node.collection)) {
                  <button class="node-action-btn" (click)="onDeleteCollection(node.collection)" title="Delete">
                    <i class="fas fa-trash"></i>
                  </button>
                }
              </div>
            </div>

            @if (node.expanded) {
              @for (child of node.children; track child.collection.ID) {
                <ng-container *ngTemplateOutlet="recursiveTree; context: { node: child }"></ng-container>
              }
            }
          </div>
        }
      </div>
    </div>

    <ng-template #recursiveTree let-node="node">
      <div class="tree-node-wrapper">
        <div
          class="tree-node"
          [class.selected]="IsCollectionSelected(node)"
          [class.drag-over]="dragOverNodeId === node.collection.ID"
          [class.dragging]="IsCollectionDragging(node)"
          [style.padding-left.px]="node.level * 20"
          [draggable]="true"
          (click)="onSelectCollection(node.collection)"
          (dragstart)="onDragStart($event, node)"
          (dragend)="onDragEnd($event)"
          (dragover)="onDragOver($event, node)"
          (dragleave)="onDragLeave($event, node)"
          (drop)="onDrop($event, node)">
          @if (node.children.length > 0) {
            <i
              class="fas toggle-icon"
              [ngClass]="node.expanded ? 'fa-chevron-down' : 'fa-chevron-right'"
              (click)="toggleNode(node, $event)">
            </i>
          }
          <i class="fas fa-folder collection-icon" [style.color]="node.collection.Color || '#0076B6'"></i>
          <span class="collection-name">{{ node.collection.Name }}</span>
          <div class="node-actions" (click)="$event.stopPropagation()">
            @if (canEdit(node.collection)) {
              <button class="node-action-btn" (click)="onCreateCollection(node.collection.ID)" title="Add sub-collection">
                <i class="fas fa-plus"></i>
              </button>
            }
            @if (canDelete(node.collection)) {
              <button class="node-action-btn" (click)="onDeleteCollection(node.collection)" title="Delete">
                <i class="fas fa-trash"></i>
              </button>
            }
          </div>
        </div>

        @if (node.expanded) {
          @for (child of node.children; track child.collection.ID) {
            <ng-container *ngTemplateOutlet="recursiveTree; context: { node: child }"></ng-container>
          }
        }
      </div>
    </ng-template>
  `,
  styles: [`
    .collection-tree { display: flex; flex-direction: column; height: 100%; }
    .tree-header { padding: 16px; border-bottom: 1px solid var(--mj-border-default); display: flex; justify-content: space-between; align-items: center; }
    .tree-header h3 { margin: 0; font-size: 16px; }
    .btn-new { padding: 6px 10px; background: var(--mj-brand-primary); color: var(--mj-text-inverse); border: none; border-radius: 4px; cursor: pointer; }
    .btn-new:hover { background: var(--mj-brand-primary-hover); }
    .tree-content { flex: 1; overflow-y: auto; position: relative; }
    .tree-content.drag-over-root { background: color-mix(in srgb, var(--mj-brand-primary) 10%, var(--mj-bg-surface)); }
    .tree-node {
      padding: 8px 12px;
      cursor: move;
      display: flex;
      align-items: center;
      gap: 8px;
      position: relative;
      transition: all 0.2s ease;
      border: 2px solid transparent;
    }
    .tree-node:hover { background: var(--mj-bg-surface-sunken); }
    .tree-node.selected { background: var(--mj-brand-accent); }
    .tree-node.dragging {
      opacity: 0.4;
      cursor: grabbing;
    }
    .tree-node.drag-over {
      background: color-mix(in srgb, var(--mj-brand-primary) 10%, var(--mj-bg-surface));
      border: 2px dashed var(--mj-brand-primary);
      border-radius: 4px;
    }
    .toggle-icon { font-size: 10px; color: var(--mj-text-disabled); cursor: pointer; width: 12px; }
    .collection-icon { font-size: 14px; }
    .collection-name { flex: 1; font-size: 14px; user-select: none; }
    .node-actions { display: none; gap: 4px; }
    .tree-node:hover .node-actions { display: flex; }
    .node-action-btn { padding: 4px 6px; background: transparent; border: none; cursor: pointer; border-radius: 3px; color: var(--mj-text-muted); }
    .node-action-btn:hover { background: var(--mj-bg-surface-sunken); }
  `]
})
export class CollectionTreeComponent extends BaseAngularComponent implements OnInit  {
  @Input() EnvironmentId!: string;

  /** @deprecated Use {@link EnvironmentId}. */
  @Input() set environmentId(value: string) {
    this.EnvironmentId = value;
  }
  /** @deprecated Use {@link EnvironmentId}. */
  get environmentId(): string {
    return this.EnvironmentId;
  }
  @Input() CurrentUser!: UserInfo;

  /** @deprecated Use {@link CurrentUser}. */
  @Input() set currentUser(value: UserInfo) {
    this.CurrentUser = value;
  }
  /** @deprecated Use {@link CurrentUser}. */
  get currentUser(): UserInfo {
    return this.CurrentUser;
  }
  @Input() SelectedCollectionId: string | null = null;

  /** @deprecated Use {@link SelectedCollectionId}. */
  @Input() set selectedCollectionId(value: string | null) {
    this.SelectedCollectionId = value;
  }
  /** @deprecated Use {@link SelectedCollectionId}. */
  get selectedCollectionId(): string | null {
    return this.SelectedCollectionId;
  }
  @Input() UserPermissions: Map<string, CollectionPermission> = new Map();

  /** @deprecated Use {@link UserPermissions}. */
  @Input() set userPermissions(value: Map<string, CollectionPermission>) {
    this.UserPermissions = value;
  }
  /** @deprecated Use {@link UserPermissions}. */
  get userPermissions(): Map<string, CollectionPermission> {
    return this.UserPermissions;
  }

  @Output() CollectionSelected = new EventEmitter<MJCollectionEntity>();

  /**
   * @deprecated Use {@link CollectionSelected}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (collectionSelected) keeps working. Must stay AFTER CollectionSelected: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() collectionSelected = this.CollectionSelected;
  @Output() CollectionCreated = new EventEmitter<MJCollectionEntity>();

  /**
   * @deprecated Use {@link CollectionCreated}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (collectionCreated) keeps working. Must stay AFTER CollectionCreated: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() collectionCreated = this.CollectionCreated;
  @Output() CollectionDeleted = new EventEmitter<MJCollectionEntity>();

  /**
   * @deprecated Use {@link CollectionDeleted}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (collectionDeleted) keeps working. Must stay AFTER CollectionDeleted: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() collectionDeleted = this.CollectionDeleted;

  public Collections: MJCollectionEntity[] = [];

  /** @deprecated Use {@link Collections}. */
  public get collections(): MJCollectionEntity[] {
    return this.Collections;
  }
  /** @deprecated Use {@link Collections}. */
  public set collections(value: MJCollectionEntity[]) {
    this.Collections = value;
  }
  public TreeNodes: TreeNode[] = [];

  /** @deprecated Use {@link TreeNodes}. */
  public get treeNodes(): TreeNode[] {
    return this.TreeNodes;
  }
  /** @deprecated Use {@link TreeNodes}. */
  public set treeNodes(value: TreeNode[]) {
    this.TreeNodes = value;
  }
  public DraggedNode: TreeNode | null = null;

  /** @deprecated Use {@link DraggedNode}. */
  public get draggedNode(): TreeNode | null {
    return this.DraggedNode;
  }
  /** @deprecated Use {@link DraggedNode}. */
  public set draggedNode(value: TreeNode | null) {
    this.DraggedNode = value;
  }
  public DragOverNodeId: string | null = null;

  /** @deprecated Use {@link DragOverNodeId}. */
  public get dragOverNodeId(): string | null {
    return this.DragOverNodeId;
  }
  /** @deprecated Use {@link DragOverNodeId}. */
  public set dragOverNodeId(value: string | null) {
    this.DragOverNodeId = value;
  }

  constructor(private permissionService: CollectionPermissionService, private confirmService: MJConfirmService) {
  super();}

  ngOnInit() {
    this.permissionService.Provider = this.ProviderToUse;
    this.loadCollections();
  }

  private async loadCollections(): Promise<void> {
    try {
      const rv = RunView.FromMetadataProvider(this.ProviderToUse);
      const result = await rv.RunView<MJCollectionEntity>({
        EntityName: 'MJ: Collections',
        ExtraFilter: `EnvironmentID='${this.EnvironmentId}'`,
        OrderBy: 'Sequence ASC, Name ASC',
        ResultType: 'entity_object'
      }, this.CurrentUser);

      if (result.Success) {
        this.Collections = result.Results || [];
        this.buildTree();
      }
    } catch (error) {
      console.error('Error loading collections:', error);
    }
  }

  private buildTree(): void {
    const rootCollections = this.Collections.filter(c => !c.ParentID);
    this.TreeNodes = rootCollections.map(c => this.buildNode(c, 0));
  }

  private buildNode(collection: MJCollectionEntity, level: number): TreeNode {
    const children = this.Collections.filter(c => UUIDsEqual(c.ParentID, collection.ID));
    return {
      collection,
      children: children.map(c => this.buildNode(c, level + 1)),
      expanded: level === 0,
      level
    };
  }

  ToggleNode(node: TreeNode, event: Event): void {
    event.stopPropagation();
    node.expanded = !node.expanded;
  }

  /** @deprecated Use {@link ToggleNode}. */
  toggleNode(node: TreeNode, event: Event): void {
    return this.ToggleNode(node, event);
  }

  IsCollectionSelected(node: TreeNode): boolean {
    return UUIDsEqual(node.collection.ID, this.SelectedCollectionId);
  }

  IsCollectionDragging(node: TreeNode): boolean {
    return UUIDsEqual(this.DraggedNode?.collection?.ID, node.collection.ID);
  }

  OnSelectCollection(collection: MJCollectionEntity): void {
    this.SelectedCollectionId = collection.ID;
    this.CollectionSelected.emit(collection);
  }

  /** @deprecated Use {@link OnSelectCollection}. */
  onSelectCollection(collection: MJCollectionEntity): void {
    return this.OnSelectCollection(collection);
  }

  async OnCreateCollection(parentId: string | null): Promise<void> {
    // Validate permission if creating child collection
    if (parentId) {
      const parentCollection = this.Collections.find(c => UUIDsEqual(c.ID, parentId));
      if (parentCollection) {
        // Check if user has Edit permission on parent
        if (parentCollection.OwnerID && !UUIDsEqual(parentCollection.OwnerID, this.CurrentUser.ID)) {
          const permission = await this.permissionService.checkPermission(
            parentId,
            this.CurrentUser.ID,
            this.CurrentUser
          );

          if (!permission?.canEdit) {
            alert('You do not have Edit permission to create a sub-collection.');
            return;
          }
        }
      }
    }

    const name = prompt('Enter collection name:');
    if (!name) return;

    try {
      const md = this.ProviderToUse;
      const collection = await md.GetEntityObject<MJCollectionEntity>('MJ: Collections', this.CurrentUser);

      collection.Name = name;
      collection.EnvironmentID = this.EnvironmentId;

      if (parentId) {
        // Child collection - inherit parent's owner and set parent
        const parentCollection = this.Collections.find(c => UUIDsEqual(c.ID, parentId));
        collection.ParentID = parentId;
        collection.OwnerID = parentCollection?.OwnerID || this.CurrentUser.ID;
      } else {
        // Root collection - current user becomes owner
        collection.OwnerID = this.CurrentUser.ID;
      }

      const saved = await collection.Save();
      if (saved) {
        this.CollectionCreated.emit(collection);
        await this.loadCollections();
      }
    } catch (error) {
      console.error('Error creating collection:', error);
      alert('Failed to create collection');
    }
  }

  /** @deprecated Use {@link OnCreateCollection}. */
  async onCreateCollection(parentId: string | null): Promise<void> {
    return this.OnCreateCollection(parentId);
  }

  async OnDeleteCollection(collection: MJCollectionEntity): Promise<void> {
    // Validate Delete permission
    if (collection.OwnerID && !UUIDsEqual(collection.OwnerID, this.CurrentUser.ID)) {
      const permission = await this.permissionService.checkPermission(
        collection.ID,
        this.CurrentUser.ID,
        this.CurrentUser
      );

      if (!permission?.canDelete) {
        alert('You do not have Delete permission for this collection.');
        return;
      }
    }

    if (!(await this.confirmService.ConfirmDelete({ title: 'Delete Collection', message: `Delete collection "${collection.Name}"?` }))) return;

    try {
      const deleted = await collection.Delete();
      if (deleted) {
        this.CollectionDeleted.emit(collection);
        await this.loadCollections();
      }
    } catch (error) {
      console.error('Error deleting collection:', error);
      alert('Failed to delete collection');
    }
  }

  /** @deprecated Use {@link OnDeleteCollection}. */
  async onDeleteCollection(collection: MJCollectionEntity): Promise<void> {
    return this.OnDeleteCollection(collection);
  }

  OnDragStart(event: DragEvent, node: TreeNode): void {
    this.DraggedNode = node;
    const dragData: DragData = {
      collectionId: node.collection.ID,
      parentId: node.collection.ParentID || null
    };
    event.dataTransfer!.effectAllowed = 'move';
    event.dataTransfer!.setData('application/json', JSON.stringify(dragData));

    // Add visual feedback
    (event.target as HTMLElement).style.opacity = '0.4';
  }

  /** @deprecated Use {@link OnDragStart}. */
  onDragStart(event: DragEvent, node: TreeNode): void {
    return this.OnDragStart(event, node);
  }

  OnDragEnd(event: DragEvent): void {
    // Clean up visual feedback
    (event.target as HTMLElement).style.opacity = '1';
    this.DraggedNode = null;
    this.DragOverNodeId = null;
  }

  /** @deprecated Use {@link OnDragEnd}. */
  onDragEnd(event: DragEvent): void {
    return this.OnDragEnd(event);
  }

  OnDragOver(event: DragEvent, targetNode: TreeNode): void {
    event.preventDefault(); // Required to allow drop

    if (!this.DraggedNode || UUIDsEqual(this.DraggedNode.collection.ID, targetNode.collection.ID)) {
      event.dataTransfer!.dropEffect = 'none';
      return;
    }

    // Check if trying to drop into a descendant
    if (this.isDescendant(targetNode, this.DraggedNode)) {
      event.dataTransfer!.dropEffect = 'none';
      return;
    }

    event.dataTransfer!.dropEffect = 'move';
    this.DragOverNodeId = targetNode.collection.ID;
  }

  /** @deprecated Use {@link OnDragOver}. */
  onDragOver(event: DragEvent, targetNode: TreeNode): void {
    return this.OnDragOver(event, targetNode);
  }

  OnDragLeave(event: DragEvent, targetNode: TreeNode): void {
    if (this.DragOverNodeId === targetNode.collection.ID) {
      this.DragOverNodeId = null;
    }
  }

  /** @deprecated Use {@link OnDragLeave}. */
  onDragLeave(event: DragEvent, targetNode: TreeNode): void {
    return this.OnDragLeave(event, targetNode);
  }

  async OnDrop(event: DragEvent, targetNode: TreeNode): Promise<void> {
    event.preventDefault();
    event.stopPropagation();

    if (!this.DraggedNode) {
      return;
    }

    // Don't allow dropping on itself
    if (UUIDsEqual(this.DraggedNode.collection.ID, targetNode.collection.ID)) {
      this.DragOverNodeId = null;
      return;
    }

    // Check if trying to drop into a descendant
    if (this.isDescendant(targetNode, this.DraggedNode)) {
      alert('Cannot move a collection into its own descendant');
      this.DragOverNodeId = null;
      return;
    }

    try {
      const collection = this.DraggedNode.collection;
      const newParentId = targetNode.collection.ID;

      // Update the collection's parent
      collection.ParentID = newParentId;

      const saved = await collection.Save();
      if (saved) {
        // Reload the tree to reflect changes
        await this.loadCollections();
      } else {
        alert('Failed to move collection');
      }
    } catch (error) {
      LogError(error);
      alert('Error moving collection');
    } finally {
      this.DragOverNodeId = null;
    }
  }

  /** @deprecated Use {@link OnDrop}. */
  async onDrop(event: DragEvent, targetNode: TreeNode): Promise<void> {
    return this.OnDrop(event, targetNode);
  }

  OnDragOverRoot(event: DragEvent): void {
    event.preventDefault();

    if (!this.DraggedNode) {
      event.dataTransfer!.dropEffect = 'none';
      return;
    }

    event.dataTransfer!.dropEffect = 'move';
    this.DragOverNodeId = 'root';
  }

  /** @deprecated Use {@link OnDragOverRoot}. */
  onDragOverRoot(event: DragEvent): void {
    return this.OnDragOverRoot(event);
  }

  async OnDropRoot(event: DragEvent): Promise<void> {
    event.preventDefault();
    event.stopPropagation();

    if (!this.DraggedNode) {
      return;
    }

    try {
      const collection = this.DraggedNode.collection;

      // Move to root level
      collection.ParentID = null;

      const saved = await collection.Save();
      if (saved) {
        await this.loadCollections();
      } else {
        alert('Failed to move collection to root');
      }
    } catch (error) {
      LogError(error);
      alert('Error moving collection to root');
    } finally {
      this.DragOverNodeId = null;
    }
  }

  /** @deprecated Use {@link OnDropRoot}. */
  async onDropRoot(event: DragEvent): Promise<void> {
    return this.OnDropRoot(event);
  }

  private isDescendant(potentialDescendant: TreeNode, ancestor: TreeNode): boolean {
    if (UUIDsEqual(potentialDescendant.collection.ParentID, ancestor.collection.ID)) {
      return true;
    }

    for (const child of ancestor.children) {
      if (this.isDescendant(potentialDescendant, child)) {
        return true;
      }
    }

    return false;
  }

  // Permission checking methods
  canEdit(collection: MJCollectionEntity): boolean {
    // Backwards compatibility: treat null OwnerID as owned by current user
    if (!collection.OwnerID || UUIDsEqual(collection.OwnerID, this.CurrentUser.ID)) {
      return true;
    }

    // Check permission record
    const permission = this.UserPermissions.get(collection.ID);
    return permission?.canEdit || false;
  }

  canDelete(collection: MJCollectionEntity): boolean {
    // Backwards compatibility: treat null OwnerID as owned by current user
    if (!collection.OwnerID || UUIDsEqual(collection.OwnerID, this.CurrentUser.ID)) {
      return true;
    }

    // Check permission record
    const permission = this.UserPermissions.get(collection.ID);
    return permission?.canDelete || false;
  }

  CanCreateAtRoot(): boolean {
    // Anyone can create at root level
    return true;
  }

  /** @deprecated Use {@link CanCreateAtRoot}. */
  canCreateAtRoot(): boolean {
    return this.CanCreateAtRoot();
  }
}