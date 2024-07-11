import { Component } from '@angular/core';
import { EntityActionEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadEntityActionDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Entity Actions') // Tell MemberJunction about this class
@Component({
    selector: 'gen-entityaction-form',
    templateUrl: './entityaction.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class EntityActionFormComponent extends BaseFormComponent {
    public record!: EntityActionEntity;
} 

export function LoadEntityActionFormComponent() {
    LoadEntityActionDetailsComponent();
}
