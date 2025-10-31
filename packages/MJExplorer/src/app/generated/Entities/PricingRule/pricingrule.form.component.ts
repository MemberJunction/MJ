import { Component } from '@angular/core';
import { PricingRuleEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadPricingRuleDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Pricing Rules') // Tell MemberJunction about this class
@Component({
    selector: 'gen-pricingrule-form',
    templateUrl: './pricingrule.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class PricingRuleFormComponent extends BaseFormComponent {
    public record!: PricingRuleEntity;
} 

export function LoadPricingRuleFormComponent() {
    LoadPricingRuleDetailsComponent();
}
