import { Component } from '@angular/core';
import { ReportCategoryEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadReportCategoryDetailsComponent } from "./sections/details.component"
@RegisterClass(BaseFormComponent, 'Report Categories') // Tell MemberJunction about this class
@Component({
    selector: 'gen-reportcategory-form',
    templateUrl: './reportcategory.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ReportCategoryFormComponent extends BaseFormComponent {
    public record!: ReportCategoryEntity;
} 

export function LoadReportCategoryFormComponent() {
    LoadReportCategoryDetailsComponent();
}
