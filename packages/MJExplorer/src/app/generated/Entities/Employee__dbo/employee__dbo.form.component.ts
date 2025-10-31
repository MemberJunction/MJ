import { Component } from '@angular/core';
import { Employee__dboEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadEmployee__dboDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Employees__dbo') // Tell MemberJunction about this class
@Component({
    selector: 'gen-employee__dbo-form',
    templateUrl: './employee__dbo.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class Employee__dboFormComponent extends BaseFormComponent {
    public record!: Employee__dboEntity;
} 

export function LoadEmployee__dboFormComponent() {
    LoadEmployee__dboDetailsComponent();
}
