import { Component } from '@angular/core';
import { PhoneRegionCodesEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadPhoneRegionCodesDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Phone Region Codes') // Tell MemberJunction about this class
@Component({
    selector: 'gen-phoneregioncodes-form',
    templateUrl: './phoneregioncodes.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class PhoneRegionCodesFormComponent extends BaseFormComponent {
    public record!: PhoneRegionCodesEntity;
} 

export function LoadPhoneRegionCodesFormComponent() {
    LoadPhoneRegionCodesDetailsComponent();
}
