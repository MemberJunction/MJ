import { Component } from '@angular/core';
import { EntityActionInvocationEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadEntityActionInvocationDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Entity Action Invocations') // Tell MemberJunction about this class
@Component({
    selector: 'gen-entityactioninvocation-form',
    templateUrl: './entityactioninvocation.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class EntityActionInvocationFormComponent extends BaseFormComponent {
    public record!: EntityActionInvocationEntity;
} 

export function LoadEntityActionInvocationFormComponent() {
    LoadEntityActionInvocationDetailsComponent();
}
