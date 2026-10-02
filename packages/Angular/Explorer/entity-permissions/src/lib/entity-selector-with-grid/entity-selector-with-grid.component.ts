import { Component, Output, EventEmitter, OnInit, Input } from '@angular/core';

import { EntityInfo, Metadata } from '@memberjunction/core';
import { EntityPermissionChangedEvent } from '../grid/entity-permissions-grid.component';

 
 
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
@Component({
  standalone: false,
  selector: 'mj-entity-permissions-selector-with-grid',
  templateUrl: './entity-selector-with-grid.component.html',
  styleUrls: ['./entity-selector-with-grid.component.css']
})
export class EntityPermissionsSelectorWithGridComponent extends BaseAngularComponent implements OnInit {
  @Input() EntityName!: string;
  @Input() BottomMargin: number = 0;

  @Output() PermissionChanged = new EventEmitter<EntityPermissionChangedEvent>();

  @Input() CurrentEntity: EntityInfo | undefined;

  public EntityList: EntityInfo[] = [];

  /** @deprecated Use {@link EntityList}. */
  public get entityList(): EntityInfo[] {
    return this.EntityList;
  }
  /** @deprecated Use {@link EntityList}. */
  public set entityList(value: EntityInfo[]) {
    this.EntityList = value;
  }
  public ngOnInit(): void {
    // Copy before sorting — provider.Entities is the provider's live (shared) metadata
    // array; Array.prototype.sort would reorder it in place for every consumer.
    this.EntityList = [...this.ProviderToUse.Entities].sort((a, b) => a.Name.localeCompare(b.Name));
    if (this.EntityList?.length > 0)
      this.CurrentEntity = this.EntityList[0];
  }

  public HandlePermissionChanged(event: EntityPermissionChangedEvent) {
    // bubble up the event to our container component
    this.PermissionChanged.emit(
      event
    );
  }

  /** @deprecated Use {@link HandlePermissionChanged}. */
  public handlePermissionChanged(event: EntityPermissionChangedEvent) {
    return this.HandlePermissionChanged(event);
  }
}
