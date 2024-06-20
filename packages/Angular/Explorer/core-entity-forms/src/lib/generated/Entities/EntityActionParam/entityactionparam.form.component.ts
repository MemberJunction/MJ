import { Component } from '@angular/core';
import { EntityActionParamEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadEntityActionParamDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Entity Action Params') // Tell MemberJunction about this class
@Component({
    selector: 'gen-entityactionparam-form',
    templateUrl: './entityactionparam.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class EntityActionParamFormComponent extends BaseFormComponent {
    public record!: EntityActionParamEntity;
} 

export function LoadEntityActionParamFormComponent() {
    LoadEntityActionParamDetailsComponent();
}
