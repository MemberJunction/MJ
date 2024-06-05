import { Component } from '@angular/core';
import { CommunicationRunEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadCommunicationRunDetailsComponent } from "./sections/details.component"
@RegisterClass(BaseFormComponent, 'Communication Runs') // Tell MemberJunction about this class
@Component({
    selector: 'gen-communicationrun-form',
    templateUrl: './communicationrun.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class CommunicationRunFormComponent extends BaseFormComponent {
    public record!: CommunicationRunEntity;
} 

export function LoadCommunicationRunFormComponent() {
    LoadCommunicationRunDetailsComponent();
}
