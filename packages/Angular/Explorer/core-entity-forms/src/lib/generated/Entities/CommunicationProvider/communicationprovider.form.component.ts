import { Component } from '@angular/core';
import { CommunicationProviderEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadCommunicationProviderDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Communication Providers') // Tell MemberJunction about this class
@Component({
    selector: 'gen-communicationprovider-form',
    templateUrl: './communicationprovider.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class CommunicationProviderFormComponent extends BaseFormComponent {
    public record!: CommunicationProviderEntity;
} 

export function LoadCommunicationProviderFormComponent() {
    LoadCommunicationProviderDetailsComponent();
}
