import { Component } from '@angular/core';
import { CommunicationBaseMessageTypeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadCommunicationBaseMessageTypeDetailsComponent } from "./sections/details.component"
@RegisterClass(BaseFormComponent, 'Communication Base Message Types') // Tell MemberJunction about this class
@Component({
    selector: 'gen-communicationbasemessagetype-form',
    templateUrl: './communicationbasemessagetype.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class CommunicationBaseMessageTypeFormComponent extends BaseFormComponent {
    public record!: CommunicationBaseMessageTypeEntity;
} 

export function LoadCommunicationBaseMessageTypeFormComponent() {
    LoadCommunicationBaseMessageTypeDetailsComponent();
}
