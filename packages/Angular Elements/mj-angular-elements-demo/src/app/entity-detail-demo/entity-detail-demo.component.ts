import { Component, Input } from '@angular/core';
import { EntityInfo } from '@memberjunction/core'

@Component({
  selector: 'app-entity-detail-demo',
  templateUrl: './entity-detail-demo.component.html',
  styleUrls: ['./entity-detail-demo.component.css']
})
export class EntityDetailDemoComponent {
  @Input() entity: EntityInfo;
}