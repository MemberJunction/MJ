import { Component } from '@angular/core';
import { MarketPlaceInfoRequestEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadMarketPlaceInfoRequestDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Market Place Info Requests') // Tell MemberJunction about this class
@Component({
    selector: 'gen-marketplaceinforequest-form',
    templateUrl: './marketplaceinforequest.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class MarketPlaceInfoRequestFormComponent extends BaseFormComponent {
    public record!: MarketPlaceInfoRequestEntity;
} 

export function LoadMarketPlaceInfoRequestFormComponent() {
    LoadMarketPlaceInfoRequestDetailsComponent();
}
