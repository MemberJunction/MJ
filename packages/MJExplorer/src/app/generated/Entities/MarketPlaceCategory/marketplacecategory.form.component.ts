import { Component } from '@angular/core';
import { MarketPlaceCategoryEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadMarketPlaceCategoryDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Market Place Categories') // Tell MemberJunction about this class
@Component({
    selector: 'gen-marketplacecategory-form',
    templateUrl: './marketplacecategory.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class MarketPlaceCategoryFormComponent extends BaseFormComponent {
    public record!: MarketPlaceCategoryEntity;
} 

export function LoadMarketPlaceCategoryFormComponent() {
    LoadMarketPlaceCategoryDetailsComponent();
}
