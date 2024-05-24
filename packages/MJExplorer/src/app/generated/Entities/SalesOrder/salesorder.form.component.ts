import { Component } from '@angular/core';
import { SalesOrderEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadSalesOrderDetailsComponent } from "./sections/details.component"
@RegisterClass(BaseFormComponent, 'Sales Orders') // Tell MemberJunction about this class
@Component({
    selector: 'gen-salesorder-form',
    templateUrl: './salesorder.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class SalesOrderFormComponent extends BaseFormComponent {
    public record!: SalesOrderEntity;
} 

export function LoadSalesOrderFormComponent() {
    LoadSalesOrderDetailsComponent();
}
