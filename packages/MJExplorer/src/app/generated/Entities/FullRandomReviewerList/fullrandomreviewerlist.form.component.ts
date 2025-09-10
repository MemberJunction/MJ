import { Component } from '@angular/core';
import { FullRandomReviewerListEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadFullRandomReviewerListDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Full Random Reviewer Lists') // Tell MemberJunction about this class
@Component({
    selector: 'gen-fullrandomreviewerlist-form',
    templateUrl: './fullrandomreviewerlist.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class FullRandomReviewerListFormComponent extends BaseFormComponent {
    public record!: FullRandomReviewerListEntity;
} 

export function LoadFullRandomReviewerListFormComponent() {
    LoadFullRandomReviewerListDetailsComponent();
}
