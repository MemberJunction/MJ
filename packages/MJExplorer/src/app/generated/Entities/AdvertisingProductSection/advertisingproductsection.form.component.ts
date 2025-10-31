import { Component } from '@angular/core';
import { AdvertisingProductSectionEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadAdvertisingProductSectionDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Advertising Product Sections') // Tell MemberJunction about this class
@Component({
    selector: 'gen-advertisingproductsection-form',
    templateUrl: './advertisingproductsection.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class AdvertisingProductSectionFormComponent extends BaseFormComponent {
    public record!: AdvertisingProductSectionEntity;
} 

export function LoadAdvertisingProductSectionFormComponent() {
    LoadAdvertisingProductSectionDetailsComponent();
}
