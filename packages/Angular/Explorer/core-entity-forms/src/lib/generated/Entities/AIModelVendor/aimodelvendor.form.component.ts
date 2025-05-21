import { Component } from '@angular/core';
import { AIModelVendorEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadAIModelVendorDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'MJ: AI Model Vendors') // Tell MemberJunction about this class
@Component({
    selector: 'gen-aimodelvendor-form',
    templateUrl: './aimodelvendor.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class AIModelVendorFormComponent extends BaseFormComponent {
    public record!: AIModelVendorEntity;
} 

export function LoadAIModelVendorFormComponent() {
    LoadAIModelVendorDetailsComponent();
}
