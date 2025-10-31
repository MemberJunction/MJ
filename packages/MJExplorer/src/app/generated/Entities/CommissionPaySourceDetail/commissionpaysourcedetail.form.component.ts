import { Component } from '@angular/core';
import { CommissionPaySourceDetailEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadCommissionPaySourceDetailDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Commission Pay Source Details') // Tell MemberJunction about this class
@Component({
    selector: 'gen-commissionpaysourcedetail-form',
    templateUrl: './commissionpaysourcedetail.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class CommissionPaySourceDetailFormComponent extends BaseFormComponent {
    public record!: CommissionPaySourceDetailEntity;
} 

export function LoadCommissionPaySourceDetailFormComponent() {
    LoadCommissionPaySourceDetailDetailsComponent();
}
