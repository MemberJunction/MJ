import { Component } from '@angular/core';
import { Salary_Ranking_TableEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadSalary_Ranking_TableTopComponent } from "./sections/top.component"
import { LoadSalary_Ranking_TableDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Salary Ranking Tables') // Tell MemberJunction about this class
@Component({
    selector: 'gen-salary_ranking_table-form',
    templateUrl: './salary_ranking_table.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class Salary_Ranking_TableFormComponent extends BaseFormComponent {
    public record!: Salary_Ranking_TableEntity;
} 

export function LoadSalary_Ranking_TableFormComponent() {
    LoadSalary_Ranking_TableTopComponent();
    LoadSalary_Ranking_TableDetailsComponent();
}
