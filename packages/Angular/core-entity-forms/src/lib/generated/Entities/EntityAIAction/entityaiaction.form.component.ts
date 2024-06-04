import { Component } from '@angular/core';
import { EntityAIActionEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadEntityAIActionDetailsComponent } from "./sections/details.component"
@RegisterClass(BaseFormComponent, 'Entity AI Actions') // Tell MemberJunction about this class
@Component({
    selector: 'gen-entityaiaction-form',
    templateUrl: './entityaiaction.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class EntityAIActionFormComponent extends BaseFormComponent {
    public record!: EntityAIActionEntity;
} 

export function LoadEntityAIActionFormComponent() {
    LoadEntityAIActionDetailsComponent();
}
