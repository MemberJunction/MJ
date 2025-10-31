import { Component } from '@angular/core';
import { AdvertisingBlindBoxEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadAdvertisingBlindBoxDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Advertising Blind Boxes') // Tell MemberJunction about this class
@Component({
    selector: 'gen-advertisingblindbox-form',
    templateUrl: './advertisingblindbox.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class AdvertisingBlindBoxFormComponent extends BaseFormComponent {
    public record!: AdvertisingBlindBoxEntity;
} 

export function LoadAdvertisingBlindBoxFormComponent() {
    LoadAdvertisingBlindBoxDetailsComponent();
}
