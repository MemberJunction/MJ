import { Component } from '@angular/core';
import { ApplicationEntityEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-explorer-core';
import { LoadApplicationEntityDetailsComponent } from "./sections/details.component"
@RegisterClass(BaseFormComponent, 'Application Entities') // Tell MemberJunction about this class
@Component({
    selector: 'gen-applicationentity-form',
    templateUrl: './applicationentity.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ApplicationEntityFormComponent extends BaseFormComponent {
    public record: ApplicationEntityEntity | null = null;
} 

export function LoadApplicationEntityFormComponent() {
    LoadApplicationEntityDetailsComponent();
}
