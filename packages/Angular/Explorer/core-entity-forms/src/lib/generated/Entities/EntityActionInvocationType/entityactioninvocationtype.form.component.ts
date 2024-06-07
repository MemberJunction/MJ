import { Component } from '@angular/core';
import { EntityActionInvocationTypeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadEntityActionInvocationTypeDetailsComponent } from "./sections/details.component"
@RegisterClass(BaseFormComponent, 'Entity Action Invocation Types') // Tell MemberJunction about this class
@Component({
    selector: 'gen-entityactioninvocationtype-form',
    templateUrl: './entityactioninvocationtype.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class EntityActionInvocationTypeFormComponent extends BaseFormComponent {
    public record!: EntityActionInvocationTypeEntity;
} 

export function LoadEntityActionInvocationTypeFormComponent() {
    LoadEntityActionInvocationTypeDetailsComponent();
}
