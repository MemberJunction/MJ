import { Component } from '@angular/core';
import { EntityCommunicationMessageTypeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadEntityCommunicationMessageTypeDetailsComponent } from "./sections/details.component"
@RegisterClass(BaseFormComponent, 'Entity Communication Message Types') // Tell MemberJunction about this class
@Component({
    selector: 'gen-entitycommunicationmessagetype-form',
    templateUrl: './entitycommunicationmessagetype.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class EntityCommunicationMessageTypeFormComponent extends BaseFormComponent {
    public record!: EntityCommunicationMessageTypeEntity;
} 

export function LoadEntityCommunicationMessageTypeFormComponent() {
    LoadEntityCommunicationMessageTypeDetailsComponent();
}
