import { Component } from '@angular/core';
import { DealEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadDealDetailsComponent } from "./sections/details.component"
@RegisterClass(BaseFormComponent, 'Deals') // Tell MemberJunction about this class
@Component({
    selector: 'gen-deal-form',
    templateUrl: './deal.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class DealFormComponent extends BaseFormComponent {
    public record!: DealEntity;
} 

export function LoadDealFormComponent() {
    LoadDealDetailsComponent();
}
