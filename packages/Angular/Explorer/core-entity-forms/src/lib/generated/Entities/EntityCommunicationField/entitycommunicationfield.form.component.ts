import { Component } from '@angular/core';
import { EntityCommunicationFieldEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadEntityCommunicationFieldDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Entity Communication Fields') // Tell MemberJunction about this class
@Component({
    selector: 'gen-entitycommunicationfield-form',
    templateUrl: './entitycommunicationfield.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class EntityCommunicationFieldFormComponent extends BaseFormComponent {
    public record!: EntityCommunicationFieldEntity;
} 

export function LoadEntityCommunicationFieldFormComponent() {
    LoadEntityCommunicationFieldDetailsComponent();
}
