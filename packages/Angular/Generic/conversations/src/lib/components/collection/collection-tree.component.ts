import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { CollectionEntity } from '@memberjunction/core-entities';
import { UserInfo, RunView, Metadata, LogError } from '@memberjunction/core';
import { CollectionPermission, CollectionPermissionService } from '../../services/collection-permission.service';

interface TreeNode {
  collection: CollectionEntity;
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
              [class.selected]="node.collection.ID === selectedCollectionId"
              [class.drag-over]="dragOverNodeId === node.collection.ID"
              [class.dragging]="draggedNode?.collection?.ID === node.collection.ID"
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
          [class.selected]="node.collection.ID === selectedCollectionId"
          [class.drag-over]="dragOverNodeId === node.collection.ID"
          [class.dragging]="draggedNode?.collection?.ID === node.collection.ID"
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
    .tree-header { padding: 16px; border-bottom: 1px solid #D9D9D9; display: flex; justify-content: space-between; align-items: center; }
    .tree-header h3 { margin: 0; font-size: 16px; }
    .btn-new { padding: 6px 10px; background: #0076B6; color: white; border: none; border-radius: 4px; cursor: pointer; }
    .btn-new:hover { background: #005A8C; }
    .tree-content { flex: 1; overflow-y: auto; position: relative; }
    .tree-content.drag-over-root { background: rgba(0, 118, 182, 0.1); }
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
    .tree-node:hover { background: #F4F4F4; }
    .tree-node.selected { background: #AAE7FD; }
    .tree-node.dragging {
      opacity: 0.4;
      cursor: grabbing;
    }
    .tree-node.drag-over {
      background: rgba(0, 118, 182, 0.1);
      border: 2px dashed #0076B6;
      border-radius: 4px;
    }
    .toggle-icon { font-size: 10px; color: #AAA; cursor: pointer; width: 12px; }
    .collection-icon { font-size: 14px; }
    .collection-name { flex: 1; font-size: 14px; user-select: none; }
    .node-actions { display: none; gap: 4px; }
    .tree-node:hover .node-actions { display: flex; }
    .node-action-btn { padding: 4px 6px; background: transparent; border: none; cursor: pointer; border-radius: 3px; color: #666; }
    .node-action-btn:hover { background: rgba(0,0,0,0.1); }
  `]
})
export class CollectionTreeComponent implements OnInit {
  @Input() environmentId!: string;
  @Input() currentUser!: UserInfo;
  @Input() selectedCollectionId: string | null = null;
  @Input() userPermissions: Map<string, CollectionPermission> = new Map();

  @Output() collectionSelected = new EventEmitter<CollectionEntity>();
  @Output() collectionCreated = new EventEmitter<CollectionEntity>();
  @Output() collectionDeleted = new EventEmitter<CollectionEntity>();

  public collections: CollectionEntity[] = [];
  public treeNodes: TreeNode[] = [];
  public draggedNode: TreeNode | null = null;
  public dragOverNodeId: string | null = null;

  constructor(private permissionService: CollectionPermissionService) {}

  ngOnInit() {
    this.loadCollections();
  }

  private async loadCollections(): Promise<void> {
    try {
      const rv = new RunView();
      const result = await rv.RunView<CollectionEntity>({
        EntityName: 'MJ: Collections',
        ExtraFilter: `EnvironmentID='${this.environmentId}'`,
        OrderBy: 'Sequence ASC, Name ASC',
        ResultType: 'entity_object'
      }, this.currentUser);

      if (result.Success) {
        this.collections = result.Results || [];
        this.buildTree();
      }
    } catch (error) {
      console.error('Error loading collections:', error);
    }
  }

  private buildTree(): void {
    const rootCollections = this.collections.filter(c => !c.ParentID);
    this.treeNodes = rootCollections.map(c => this.buildNode(c, 0));
  }

  private buildNode(collection: CollectionEntity, level: number): TreeNode {
    const children = this.collections.filter(c => c.ParentID === collection.ID);
    return {
      collection,
      children: children.map(c => this.buildNode(c, level + 1)),
      expanded: level === 0,
      level
    };
  }

  toggleNode(node: TreeNode, event: Event): void {
    event.stopPropagation();
    node.expanded = !node.expanded;
  }

  onSelectCollection(collection: CollectionEntity): void {
    this.selectedCollectionId = collection.ID;
    this.collectionSelected.emit(collection);
  }

  async onCreateCollection(parentId: string | null): Promise<void> {
    // Validate permission if creating child collection
    if (parentId) {
      const parentCollection = this.collections.find(c => c.ID === parentId);
      if (parentCollection) {
        // Check if user has Edit permission on parent
        if (parentCollection.OwnerID && parentCollection.OwnerID !== this.currentUser.ID) {
          const permission = await this.permissionService.checkPermission(
            parentId,
            this.currentUser.ID,
            this.currentUser
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
      const md = new Metadata();
      const collection = await md.GetEntityObject<CollectionEntity>('MJ: Collections', this.currentUser);

      collection.Name = name;
      collection.EnvironmentID = this.environmentId;

      if (parentId) {
        // Child collection - inherit parent's owner and set parent
        const parentCollection = this.collections.find(c => c.ID === parentId);
        collection.ParentID = parentId;
        collection.OwnerID = parentCollection?.OwnerID || this.currentUser.ID;
      } else {
        // Root collection - current user becomes owner
        collection.OwnerID = this.currentUser.ID;
      }

      const saved = await collection.Save();
      if (saved) {
        this.collectionCreated.emit(collection);
        await this.loadCollections();
      }
    } catch (error) {
      console.error('Error creating collection:', error);
      alert('Failed to create collection');
    }
  }

  async onDeleteCollection(collection: CollectionEntity): Promise<void> {
    // Validate Delete permission
    if (collection.OwnerID && collection.OwnerID !== this.currentUser.ID) {
      const permission = await this.permissionService.checkPermission(
        collection.ID,
        this.currentUser.ID,
        this.currentUser
      );

      if (!permission?.canDelete) {
        alert('You do not have Delete permission for this collection.');
        return;
      }
    }

    if (!confirm(`Delete collection "${collection.Name}"?`)) return;

    try {
      const deleted = await collection.Delete();
      if (deleted) {
        this.collectionDeleted.emit(collection);
        await this.loadCollections();
      }
    } catch (error) {
      console.error('Error deleting collection:', error);
      alert('Failed to delete collection');
    }
  }

  onDragStart(event: DragEvent, node: TreeNode): void {
    this.draggedNode = node;
    const dragData: DragData = {
      collectionId: node.collection.ID,
      parentId: node.collection.ParentID || null
    };
    event.dataTransfer!.effectAllowed = 'move';
    event.dataTransfer!.setData('application/json', JSON.stringify(dragData));

    // Add visual feedback
    (event.target as HTMLElement).style.opacity = '0.4';
  }

  onDragEnd(event: DragEvent): void {
    // Clean up visual feedback
    (event.target as HTMLElement).style.opacity = '1';
    this.draggedNode = null;
    this.dragOverNodeId = null;
  }

  onDragOver(event: DragEvent, targetNode: TreeNode): void {
    event.preventDefault(); // Required to allow drop

    if (!this.draggedNode || this.draggedNode.collection.ID === targetNode.collection.ID) {
      event.dataTransfer!.dropEffect = 'none';
      return;
    }

    // Check if trying to drop into a descendant
    if (this.isDescendant(targetNode, this.draggedNode)) {
      event.dataTransfer!.dropEffect = 'none';
      return;
    }

    event.dataTransfer!.dropEffect = 'move';
    this.dragOverNodeId = targetNode.collection.ID;
  }

  onDragLeave(event: DragEvent, targetNode: TreeNode): void {
    if (this.dragOverNodeId === targetNode.collection.ID) {
      this.dragOverNodeId = null;
    }
  }

  async onDrop(event: DragEvent, targetNode: TreeNode): Promise<void> {
    event.preventDefault();
    event.stopPropagation();

    if (!this.draggedNode) {
      return;
    }

    // Don't allow dropping on itself
    if (this.draggedNode.collection.ID === targetNode.collection.ID) {
      this.dragOverNodeId = null;
      return;
    }

    // Check if trying to drop into a descendant
    if (this.isDescendant(targetNode, this.draggedNode)) {
      alert('Cannot move a collection into its own descendant');
      this.dragOverNodeId = null;
      return;
    }

    try {
      const collection = this.draggedNode.collection;
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
      this.dragOverNodeId = null;
    }
  }

  onDragOverRoot(event: DragEvent): void {
    event.preventDefault();

    if (!this.draggedNode) {
      event.dataTransfer!.dropEffect = 'none';
      return;
    }

    event.dataTransfer!.dropEffect = 'move';
    this.dragOverNodeId = 'root';
  }

  async onDropRoot(event: DragEvent): Promise<void> {
    event.preventDefault();
    event.stopPropagation();

    if (!this.draggedNode) {
      return;
    }

    try {
      const collection = this.draggedNode.collection;

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
      this.dragOverNodeId = null;
    }
  }

  private isDescendant(potentialDescendant: TreeNode, ancestor: TreeNode): boolean {
    if (potentialDescendant.collection.ParentID === ancestor.collection.ID) {
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
  canEdit(collection: CollectionEntity): boolean {
    // Backwards compatibility: treat null OwnerID as owned by current user
    if (!collection.OwnerID || collection.OwnerID === this.currentUser.ID) {
      return true;
    }

    // Check permission record
    const permission = this.userPermissions.get(collection.ID);
    return permission?.canEdit || false;
  }

  canDelete(collection: CollectionEntity): boolean {
    // Backwards compatibility: treat null OwnerID as owned by current user
    if (!collection.OwnerID || collection.OwnerID === this.currentUser.ID) {
      return true;
    }

    // Check permission record
    const permission = this.userPermissions.get(collection.ID);
    return permission?.canDelete || false;
  }

  canCreateAtRoot(): boolean {
    // Anyone can create at root level
    return true;
  }
}