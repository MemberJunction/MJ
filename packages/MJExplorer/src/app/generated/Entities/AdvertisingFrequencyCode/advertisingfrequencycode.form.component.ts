import { Component } from '@angular/core';
import { AdvertisingFrequencyCodeEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadAdvertisingFrequencyCodeDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Advertising Frequency Codes') // Tell MemberJunction about this class
@Component({
    selector: 'gen-advertisingfrequencycode-form',
    templateUrl: './advertisingfrequencycode.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class AdvertisingFrequencyCodeFormComponent extends BaseFormComponent {
    public record!: AdvertisingFrequencyCodeEntity;
} 

export function LoadAdvertisingFrequencyCodeFormComponent() {
    LoadAdvertisingFrequencyCodeDetailsComponent();
}
