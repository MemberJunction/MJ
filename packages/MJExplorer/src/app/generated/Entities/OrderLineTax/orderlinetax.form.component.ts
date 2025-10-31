import { Component } from '@angular/core';
import { OrderLineTaxEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadOrderLineTaxDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Order Line Taxes') // Tell MemberJunction about this class
@Component({
    selector: 'gen-orderlinetax-form',
    templateUrl: './orderlinetax.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class OrderLineTaxFormComponent extends BaseFormComponent {
    public record!: OrderLineTaxEntity;
} 

export function LoadOrderLineTaxFormComponent() {
    LoadOrderLineTaxDetailsComponent();
}
