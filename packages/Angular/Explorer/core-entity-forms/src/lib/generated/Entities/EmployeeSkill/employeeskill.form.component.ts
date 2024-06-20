import { Component } from '@angular/core';
import { EmployeeSkillEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadEmployeeSkillDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Employee Skills') // Tell MemberJunction about this class
@Component({
    selector: 'gen-employeeskill-form',
    templateUrl: './employeeskill.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class EmployeeSkillFormComponent extends BaseFormComponent {
    public record!: EmployeeSkillEntity;
} 

export function LoadEmployeeSkillFormComponent() {
    LoadEmployeeSkillDetailsComponent();
}
