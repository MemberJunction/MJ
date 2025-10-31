import { Component } from '@angular/core';
import { MarketPlaceListingEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadMarketPlaceListingDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Market Place Listings') // Tell MemberJunction about this class
@Component({
    selector: 'gen-marketplacelisting-form',
    templateUrl: './marketplacelisting.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class MarketPlaceListingFormComponent extends BaseFormComponent {
    public record!: MarketPlaceListingEntity;
} 

export function LoadMarketPlaceListingFormComponent() {
    LoadMarketPlaceListingDetailsComponent();
}
