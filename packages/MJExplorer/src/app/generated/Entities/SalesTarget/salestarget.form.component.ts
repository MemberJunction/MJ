import { Component } from '@angular/core';
import { SalesTargetEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadSalesTargetDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Sales Targets') // Tell MemberJunction about this class
@Component({
    selector: 'gen-salestarget-form',
    templateUrl: './salestarget.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class SalesTargetFormComponent extends BaseFormComponent {
    public record!: SalesTargetEntity;
} 

export function LoadSalesTargetFormComponent() {
    LoadSalesTargetDetailsComponent();
}
