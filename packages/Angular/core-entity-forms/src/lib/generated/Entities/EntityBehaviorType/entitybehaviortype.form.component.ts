import { Component } from '@angular/core';
import { EntityBehaviorTypeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadEntityBehaviorTypeDetailsComponent } from "./sections/details.component"
@RegisterClass(BaseFormComponent, 'Entity Behavior Types') // Tell MemberJunction about this class
@Component({
    selector: 'gen-entitybehaviortype-form',
    templateUrl: './entitybehaviortype.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class EntityBehaviorTypeFormComponent extends BaseFormComponent {
    public record!: EntityBehaviorTypeEntity;
} 

export function LoadEntityBehaviorTypeFormComponent() {
    LoadEntityBehaviorTypeDetailsComponent();
}
