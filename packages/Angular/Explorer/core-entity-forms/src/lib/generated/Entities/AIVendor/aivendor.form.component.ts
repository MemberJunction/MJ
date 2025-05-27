import { Component } from '@angular/core';
import { AIVendorEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadAIVendorDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'MJ: AI Vendors') // Tell MemberJunction about this class
@Component({
    selector: 'gen-aivendor-form',
    templateUrl: './aivendor.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class AIVendorFormComponent extends BaseFormComponent {
    public record!: AIVendorEntity;
} 

export function LoadAIVendorFormComponent() {
    LoadAIVendorDetailsComponent();
}
