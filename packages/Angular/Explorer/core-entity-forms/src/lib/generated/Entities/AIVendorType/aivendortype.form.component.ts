import { Component } from '@angular/core';
import { AIVendorTypeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadAIVendorTypeDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'MJ: AI Vendor Types') // Tell MemberJunction about this class
@Component({
    selector: 'gen-aivendortype-form',
    templateUrl: './aivendortype.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class AIVendorTypeFormComponent extends BaseFormComponent {
    public record!: AIVendorTypeEntity;
} 

export function LoadAIVendorTypeFormComponent() {
    LoadAIVendorTypeDetailsComponent();
}
