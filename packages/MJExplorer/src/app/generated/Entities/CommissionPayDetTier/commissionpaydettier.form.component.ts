import { Component } from '@angular/core';
import { CommissionPayDetTierEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadCommissionPayDetTierDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Commission Pay Det Tiers') // Tell MemberJunction about this class
@Component({
    selector: 'gen-commissionpaydettier-form',
    templateUrl: './commissionpaydettier.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class CommissionPayDetTierFormComponent extends BaseFormComponent {
    public record!: CommissionPayDetTierEntity;
} 

export function LoadCommissionPayDetTierFormComponent() {
    LoadCommissionPayDetTierDetailsComponent();
}
