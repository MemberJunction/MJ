import { Component } from '@angular/core';
import { AdvertisingSizeCodeEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadAdvertisingSizeCodeDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Advertising Size Codes') // Tell MemberJunction about this class
@Component({
    selector: 'gen-advertisingsizecode-form',
    templateUrl: './advertisingsizecode.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class AdvertisingSizeCodeFormComponent extends BaseFormComponent {
    public record!: AdvertisingSizeCodeEntity;
} 

export function LoadAdvertisingSizeCodeFormComponent() {
    LoadAdvertisingSizeCodeDetailsComponent();
}
