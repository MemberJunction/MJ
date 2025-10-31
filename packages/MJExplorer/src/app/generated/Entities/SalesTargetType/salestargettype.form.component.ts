import { Component } from '@angular/core';
import { SalesTargetTypeEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadSalesTargetTypeDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Sales Target Types') // Tell MemberJunction about this class
@Component({
    selector: 'gen-salestargettype-form',
    templateUrl: './salestargettype.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class SalesTargetTypeFormComponent extends BaseFormComponent {
    public record!: SalesTargetTypeEntity;
} 

export function LoadSalesTargetTypeFormComponent() {
    LoadSalesTargetTypeDetailsComponent();
}
