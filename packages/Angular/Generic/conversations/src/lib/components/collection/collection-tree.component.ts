import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { CollectionEntity } from '@memberjunction/core-entities';
import { UserInfo, RunView, Metadata } from '@memberjunction/core';

interface TreeNode {
  collection: CollectionEntity;
  children: TreeNode[];
  expanded: boolean;
  level: number;
}

@Component({
  selector: 'mj-collection-tree',
  template: `
    <div class="collection-tree">
      <div class="tree-header">
        <h3>Collections</h3>
        <button class="btn-new" (click)="onCreateCollection(null)" title="New Collection">
          <i class="fas fa-plus"></i>
        </button>
      </div>

      <div class="tree-content">
        <div *ngFor="let node of treeNodes" class="tree-node-wrapper">
          <div
            class="tree-node"
            [class.selected]="node.collection.ID === selectedCollectionId"
            [style.padding-left.px]="node.level * 20"
            (click)="onSelectCollection(node.collection)">
            <i
              class="fas toggle-icon"
              [ngClass]="node.expanded ? 'fa-chevron-down' : 'fa-chevron-right'"
              *ngIf="node.children.length > 0"
              (click)="toggleNode(node, $event)">
            </i>
            <i class="fas fa-folder collection-icon" [style.color]="node.collection.Color || '#0076B6'"></i>
            <span class="collection-name">{{ node.collection.Name }}</span>
            <div class="node-actions" (click)="$event.stopPropagation()">
              <button class="node-action-btn" (click)="onCreateCollection(node.collection.ID)" title="Add sub-collection">
                <i class="fas fa-plus"></i>
              </button>
              <button class="node-action-btn" (click)="onDeleteCollection(node.collection)" title="Delete">
                <i class="fas fa-trash"></i>
              </button>
            </div>
          </div>

          <ng-container *ngIf="node.expanded">
            <ng-container *ngFor="let child of node.children">
              <ng-container *ngTemplateOutlet="recursiveTree; context: { node: child }"></ng-container>
            </ng-container>
          </ng-container>
        </div>
      </div>
    </div>

    <ng-template #recursiveTree let-node="node">
      <div class="tree-node-wrapper">
        <div
          class="tree-node"
          [class.selected]="node.collection.ID === selectedCollectionId"
          [style.padding-left.px]="node.level * 20"
          (click)="onSelectCollection(node.collection)">
          <i
            class="fas toggle-icon"
            [ngClass]="node.expanded ? 'fa-chevron-down' : 'fa-chevron-right'"
            *ngIf="node.children.length > 0"
            (click)="toggleNode(node, $event)">
          </i>
          <i class="fas fa-folder collection-icon" [style.color]="node.collection.Color || '#0076B6'"></i>
          <span class="collection-name">{{ node.collection.Name }}</span>
          <div class="node-actions" (click)="$event.stopPropagation()">
            <button class="node-action-btn" (click)="onCreateCollection(node.collection.ID)" title="Add sub-collection">
              <i class="fas fa-plus"></i>
            </button>
            <button class="node-action-btn" (click)="onDeleteCollection(node.collection)" title="Delete">
              <i class="fas fa-trash"></i>
            </button>
          </div>
        </div>

        <ng-container *ngIf="node.expanded">
          <ng-container *ngFor="let child of node.children">
            <ng-container *ngTemplateOutlet="recursiveTree; context: { node: child }"></ng-container>
          </ng-container>
        </ng-container>
      </div>
    </ng-template>
  `,
  styles: [`
    .collection-tree { display: flex; flex-direction: column; height: 100%; }
    .tree-header { padding: 16px; border-bottom: 1px solid #D9D9D9; display: flex; justify-content: space-between; align-items: center; }
    .tree-header h3 { margin: 0; font-size: 16px; }
    .btn-new { padding: 6px 10px; background: #0076B6; color: white; border: none; border-radius: 4px; cursor: pointer; }
    .btn-new:hover { background: #005A8C; }
    .tree-content { flex: 1; overflow-y: auto; }
    .tree-node { padding: 8px 12px; cursor: pointer; display: flex; align-items: center; gap: 8px; position: relative; }
    .tree-node:hover { background: #F4F4F4; }
    .tree-node.selected { background: #AAE7FD; }
    .toggle-icon { font-size: 10px; color: #AAA; cursor: pointer; width: 12px; }
    .collection-icon { font-size: 14px; }
    .collection-name { flex: 1; font-size: 14px; }
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

  @Output() collectionSelected = new EventEmitter<CollectionEntity>();
  @Output() collectionCreated = new EventEmitter<CollectionEntity>();
  @Output() collectionDeleted = new EventEmitter<CollectionEntity>();

  public collections: CollectionEntity[] = [];
  public treeNodes: TreeNode[] = [];

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
    const name = prompt('Enter collection name:');
    if (!name) return;

    try {
      const md = new Metadata();
      const collection = await md.GetEntityObject<CollectionEntity>('MJ: Collections', this.currentUser);

      collection.Name = name;
      collection.EnvironmentID = this.environmentId;
      if (parentId) collection.ParentID = parentId;

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
}