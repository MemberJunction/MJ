import { Component } from '@angular/core';
import { GrantReportEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadGrantReportDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Grant Reports') // Tell MemberJunction about this class
@Component({
    selector: 'gen-grantreport-form',
    templateUrl: './grantreport.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class GrantReportFormComponent extends BaseFormComponent {
    public record!: GrantReportEntity;
} 

export function LoadGrantReportFormComponent() {
    LoadGrantReportDetailsComponent();
}
