import { Component } from '@angular/core';
import { CommissionAgmtDetTierEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadCommissionAgmtDetTierDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Commission Agmt Det Tiers') // Tell MemberJunction about this class
@Component({
    selector: 'gen-commissionagmtdettier-form',
    templateUrl: './commissionagmtdettier.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class CommissionAgmtDetTierFormComponent extends BaseFormComponent {
    public record!: CommissionAgmtDetTierEntity;
} 

export function LoadCommissionAgmtDetTierFormComponent() {
    LoadCommissionAgmtDetTierDetailsComponent();
}
