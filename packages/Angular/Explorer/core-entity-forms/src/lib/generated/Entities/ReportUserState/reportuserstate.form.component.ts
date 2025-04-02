import { Component } from '@angular/core';
import { ReportUserStateEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadReportUserStateDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'MJ: Report User States') // Tell MemberJunction about this class
@Component({
    selector: 'gen-reportuserstate-form',
    templateUrl: './reportuserstate.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ReportUserStateFormComponent extends BaseFormComponent {
    public record!: ReportUserStateEntity;
} 

export function LoadReportUserStateFormComponent() {
    LoadReportUserStateDetailsComponent();
}
