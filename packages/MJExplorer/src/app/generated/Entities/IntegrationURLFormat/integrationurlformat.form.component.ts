import { Component } from '@angular/core';
import { IntegrationURLFormatEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-explorer-core';
import { LoadIntegrationURLFormatDetailsComponent } from "./sections/details.component"
@RegisterClass(BaseFormComponent, 'Integration URL Formats') // Tell MemberJunction about this class
@Component({
    selector: 'gen-integrationurlformat-form',
    templateUrl: './integrationurlformat.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class IntegrationURLFormatFormComponent extends BaseFormComponent {
    public record: IntegrationURLFormatEntity | null = null;
} 

export function LoadIntegrationURLFormatFormComponent() {
    LoadIntegrationURLFormatDetailsComponent();
}
