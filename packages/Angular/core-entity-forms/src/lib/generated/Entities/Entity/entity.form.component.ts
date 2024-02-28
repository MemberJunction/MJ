import { Component } from '@angular/core';
import { EntityEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-explorer-core';
import { LoadEntityDetailsComponent } from "./sections/details.component"
import { LoadEntityTopComponent } from "./sections/top.component"
import { LoadEntityAuditComponent } from "./sections/audit.component"
import { LoadEntityAPIComponent } from "./sections/api.component"
import { LoadEntityDBComponent } from "./sections/db.component"
import { LoadEntityUIComponent } from "./sections/ui.component"
@RegisterClass(BaseFormComponent, 'Entities') // Tell MemberJunction about this class
@Component({
    selector: 'gen-entity-form',
    templateUrl: './entity.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class EntityFormComponent extends BaseFormComponent {
    public record!: EntityEntity;
} 

export function LoadEntityFormComponent() {
    LoadEntityDetailsComponent();
    LoadEntityTopComponent();
    LoadEntityAuditComponent();
    LoadEntityAPIComponent();
    LoadEntityDBComponent();
    LoadEntityUIComponent();
}
