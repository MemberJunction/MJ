import { Component } from '@angular/core';
import { CommunicationLogEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadCommunicationLogDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Communication Logs') // Tell MemberJunction about this class
@Component({
    selector: 'gen-communicationlog-form',
    templateUrl: './communicationlog.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class CommunicationLogFormComponent extends BaseFormComponent {
    public record!: CommunicationLogEntity;
} 

export function LoadCommunicationLogFormComponent() {
    LoadCommunicationLogDetailsComponent();
}
