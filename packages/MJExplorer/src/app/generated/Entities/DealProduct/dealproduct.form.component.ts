import { Component } from '@angular/core';
import { DealProductEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadDealProductDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Deal Products') // Tell MemberJunction about this class
@Component({
    selector: 'gen-dealproduct-form',
    templateUrl: './dealproduct.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class DealProductFormComponent extends BaseFormComponent {
    public record!: DealProductEntity;
} 

export function LoadDealProductFormComponent() {
    LoadDealProductDetailsComponent();
}
