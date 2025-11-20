import { Component } from '@angular/core';
import { SubmissionReviewEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Submission Reviews') // Tell MemberJunction about this class
@Component({
    selector: 'gen-submissionreview-form',
    templateUrl: './submissionreview.form.component.html'
})
export class SubmissionReviewFormComponent extends BaseFormComponent {
    public record!: SubmissionReviewEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

export function LoadSubmissionReviewFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
