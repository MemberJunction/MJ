import { Component } from '@angular/core';
import { AdvertisingColorCodeEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadAdvertisingColorCodeDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Advertising Color Codes') // Tell MemberJunction about this class
@Component({
    selector: 'gen-advertisingcolorcode-form',
    templateUrl: './advertisingcolorcode.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class AdvertisingColorCodeFormComponent extends BaseFormComponent {
    public record!: AdvertisingColorCodeEntity;
} 

export function LoadAdvertisingColorCodeFormComponent() {
    LoadAdvertisingColorCodeDetailsComponent();
}
