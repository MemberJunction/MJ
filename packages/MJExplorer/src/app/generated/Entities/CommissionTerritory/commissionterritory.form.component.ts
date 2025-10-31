import { Component } from '@angular/core';
import { CommissionTerritoryEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadCommissionTerritoryDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Commission Territories') // Tell MemberJunction about this class
@Component({
    selector: 'gen-commissionterritory-form',
    templateUrl: './commissionterritory.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class CommissionTerritoryFormComponent extends BaseFormComponent {
    public record!: CommissionTerritoryEntity;
} 

export function LoadCommissionTerritoryFormComponent() {
    LoadCommissionTerritoryDetailsComponent();
}
