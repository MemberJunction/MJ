import { Component } from '@angular/core';
import { IntegrationEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-explorer-core';
import { LoadIntegrationDetailsComponent } from "./sections/details.component"
@RegisterClass(BaseFormComponent, 'Integrations') // Tell MemberJunction about this class
@Component({
    selector: 'gen-integration-form',
    templateUrl: './integration.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class IntegrationFormComponent extends BaseFormComponent {
    public record: IntegrationEntity | null = null;
} 

export function LoadIntegrationFormComponent() {
    LoadIntegrationDetailsComponent();
}
