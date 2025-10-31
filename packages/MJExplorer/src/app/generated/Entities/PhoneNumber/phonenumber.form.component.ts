import { Component } from '@angular/core';
import { PhoneNumberEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadPhoneNumberDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Phone Numbers') // Tell MemberJunction about this class
@Component({
    selector: 'gen-phonenumber-form',
    templateUrl: './phonenumber.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class PhoneNumberFormComponent extends BaseFormComponent {
    public record!: PhoneNumberEntity;
} 

export function LoadPhoneNumberFormComponent() {
    LoadPhoneNumberDetailsComponent();
}
