import { Component } from '@angular/core';
import { EntityBehaviorEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadEntityBehaviorDetailsComponent } from "./sections/details.component"
@RegisterClass(BaseFormComponent, 'Entity Behaviors') // Tell MemberJunction about this class
@Component({
    selector: 'gen-entitybehavior-form',
    templateUrl: './entitybehavior.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class EntityBehaviorFormComponent extends BaseFormComponent {
    public record!: EntityBehaviorEntity;
} 

export function LoadEntityBehaviorFormComponent() {
    LoadEntityBehaviorDetailsComponent();
}
