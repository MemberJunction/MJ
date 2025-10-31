import { Component } from '@angular/core';
import { StandingOrPurchasesEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadStandingOrPurchasesDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Standing Or Purchases') // Tell MemberJunction about this class
@Component({
    selector: 'gen-standingorpurchases-form',
    templateUrl: './standingorpurchases.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class StandingOrPurchasesFormComponent extends BaseFormComponent {
    public record!: StandingOrPurchasesEntity;
} 

export function LoadStandingOrPurchasesFormComponent() {
    LoadStandingOrPurchasesDetailsComponent();
}
