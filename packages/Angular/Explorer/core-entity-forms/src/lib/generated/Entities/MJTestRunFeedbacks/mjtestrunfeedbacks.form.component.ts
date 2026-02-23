import { Component } from '@angular/core';
import { MJTestRunFeedbacksEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Test Run Feedbacks') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjtestrunfeedbacks-form',
    templateUrl: './mjtestrunfeedbacks.form.component.html'
})
export class MJTestRunFeedbacksFormComponent extends BaseFormComponent {
    public record!: MJTestRunFeedbacksEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'reviewContext', sectionName: 'Review Context', isExpanded: true },
            { sectionKey: 'feedbackContent', sectionName: 'Feedback Content', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

