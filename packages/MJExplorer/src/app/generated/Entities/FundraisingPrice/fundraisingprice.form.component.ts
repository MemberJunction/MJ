import { Component } from '@angular/core';
import { FundraisingPriceEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadFundraisingPriceDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Fundraising Prices') // Tell MemberJunction about this class
@Component({
    selector: 'gen-fundraisingprice-form',
    templateUrl: './fundraisingprice.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class FundraisingPriceFormComponent extends BaseFormComponent {
    public record!: FundraisingPriceEntity;
} 

export function LoadFundraisingPriceFormComponent() {
    LoadFundraisingPriceDetailsComponent();
}
