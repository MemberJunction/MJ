import { Component, Output, EventEmitter, OnInit, Input } from '@angular/core';

import { EntityInfo, Metadata } from '@memberjunction/core';
import { EntityPermissionChangedEvent } from '../grid/entity-permissions-grid.component';

 
 
@Component({
  selector: 'mj-entity-permissions-selector-with-grid',
  templateUrl: './entity-selector-with-grid.component.html',
  styleUrls: ['./entity-selector-with-grid.component.css']
})
export class EntityPermissionsSelectorWithGridComponent implements OnInit {
  @Input() EntityName!: string;
  @Input() BottomMargin: number = 0;

  @Output() PermissionChanged = new EventEmitter<EntityPermissionChangedEvent>();

  @Input() CurrentEntity: EntityInfo | undefined;

  private _md: Metadata | undefined;
  public entityList: EntityInfo[] = [];
  ngOnInit(): void {
    this._md = new Metadata();
    this.entityList = this._md.Entities.sort((a, b) => a.Name.localeCompare(b.Name));
    if (this.entityList?.length > 0)
      this.CurrentEntity = this.entityList[0];
  }
}
