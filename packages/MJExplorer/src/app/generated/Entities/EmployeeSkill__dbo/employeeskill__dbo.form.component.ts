import { Component } from '@angular/core';
import { EmployeeSkill__dboEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadEmployeeSkill__dboDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Employee Skills__dbo') // Tell MemberJunction about this class
@Component({
    selector: 'gen-employeeskill__dbo-form',
    templateUrl: './employeeskill__dbo.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class EmployeeSkill__dboFormComponent extends BaseFormComponent {
    public record!: EmployeeSkill__dboEntity;
} 

export function LoadEmployeeSkill__dboFormComponent() {
    LoadEmployeeSkill__dboDetailsComponent();
}
