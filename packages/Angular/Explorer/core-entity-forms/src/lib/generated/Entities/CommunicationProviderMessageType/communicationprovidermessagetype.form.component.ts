import { Component } from '@angular/core';
import { CommunicationProviderMessageTypeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadCommunicationProviderMessageTypeDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Communication Provider Message Types') // Tell MemberJunction about this class
@Component({
    selector: 'gen-communicationprovidermessagetype-form',
    templateUrl: './communicationprovidermessagetype.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class CommunicationProviderMessageTypeFormComponent extends BaseFormComponent {
    public record!: CommunicationProviderMessageTypeEntity;
} 

export function LoadCommunicationProviderMessageTypeFormComponent() {
    LoadCommunicationProviderMessageTypeDetailsComponent();
}
