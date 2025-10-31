import { Component } from '@angular/core';
import { TaxJurisdictionEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadTaxJurisdictionDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Tax Jurisdictions') // Tell MemberJunction about this class
@Component({
    selector: 'gen-taxjurisdiction-form',
    templateUrl: './taxjurisdiction.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class TaxJurisdictionFormComponent extends BaseFormComponent {
    public record!: TaxJurisdictionEntity;
} 

export function LoadTaxJurisdictionFormComponent() {
    LoadTaxJurisdictionDetailsComponent();
}
