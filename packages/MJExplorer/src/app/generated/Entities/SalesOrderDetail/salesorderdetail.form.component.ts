import { Component } from '@angular/core';
import { SalesOrderDetailEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadSalesOrderDetailDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Sales Order Details') // Tell MemberJunction about this class
@Component({
    selector: 'gen-salesorderdetail-form',
    templateUrl: './salesorderdetail.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class SalesOrderDetailFormComponent extends BaseFormComponent {
    public record!: SalesOrderDetailEntity;
} 

export function LoadSalesOrderDetailFormComponent() {
    LoadSalesOrderDetailDetailsComponent();
}
