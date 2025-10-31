import { Component } from '@angular/core';
import { AdvertisingPositionCodeEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadAdvertisingPositionCodeDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Advertising Position Codes') // Tell MemberJunction about this class
@Component({
    selector: 'gen-advertisingpositioncode-form',
    templateUrl: './advertisingpositioncode.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class AdvertisingPositionCodeFormComponent extends BaseFormComponent {
    public record!: AdvertisingPositionCodeEntity;
} 

export function LoadAdvertisingPositionCodeFormComponent() {
    LoadAdvertisingPositionCodeDetailsComponent();
}
