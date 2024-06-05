import { Component } from '@angular/core';
import { CommunicationTemplateEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadCommunicationTemplateDetailsComponent } from "./sections/details.component"
@RegisterClass(BaseFormComponent, 'Communication Templates') // Tell MemberJunction about this class
@Component({
    selector: 'gen-communicationtemplate-form',
    templateUrl: './communicationtemplate.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class CommunicationTemplateFormComponent extends BaseFormComponent {
    public record!: CommunicationTemplateEntity;
} 

export function LoadCommunicationTemplateFormComponent() {
    LoadCommunicationTemplateDetailsComponent();
}
