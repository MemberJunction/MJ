import { Component } from '@angular/core';
import { MarketPlaceListingTypeEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadMarketPlaceListingTypeDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Market Place Listing Types') // Tell MemberJunction about this class
@Component({
    selector: 'gen-marketplacelistingtype-form',
    templateUrl: './marketplacelistingtype.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class MarketPlaceListingTypeFormComponent extends BaseFormComponent {
    public record!: MarketPlaceListingTypeEntity;
} 

export function LoadMarketPlaceListingTypeFormComponent() {
    LoadMarketPlaceListingTypeDetailsComponent();
}
