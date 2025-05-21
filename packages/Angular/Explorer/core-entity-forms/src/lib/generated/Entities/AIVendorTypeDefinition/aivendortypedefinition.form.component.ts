import { Component } from '@angular/core';
import { AIVendorTypeDefinitionEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadAIVendorTypeDefinitionDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'MJ: AI Vendor Type Definitions') // Tell MemberJunction about this class
@Component({
    selector: 'gen-aivendortypedefinition-form',
    templateUrl: './aivendortypedefinition.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class AIVendorTypeDefinitionFormComponent extends BaseFormComponent {
    public record!: AIVendorTypeDefinitionEntity;
} 

export function LoadAIVendorTypeDefinitionFormComponent() {
    LoadAIVendorTypeDefinitionDetailsComponent();
}
