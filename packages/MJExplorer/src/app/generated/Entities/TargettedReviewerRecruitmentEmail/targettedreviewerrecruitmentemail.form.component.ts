import { Component } from '@angular/core';
import { TargettedReviewerRecruitmentEmailEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadTargettedReviewerRecruitmentEmailDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Targetted Reviewer Recruitment Emails') // Tell MemberJunction about this class
@Component({
    selector: 'gen-targettedreviewerrecruitmentemail-form',
    templateUrl: './targettedreviewerrecruitmentemail.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class TargettedReviewerRecruitmentEmailFormComponent extends BaseFormComponent {
    public record!: TargettedReviewerRecruitmentEmailEntity;
} 

export function LoadTargettedReviewerRecruitmentEmailFormComponent() {
    LoadTargettedReviewerRecruitmentEmailDetailsComponent();
}
