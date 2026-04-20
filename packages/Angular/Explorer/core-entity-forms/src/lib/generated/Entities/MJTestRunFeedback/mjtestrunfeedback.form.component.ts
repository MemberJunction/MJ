import { Component } from '@angular/core';
import { MJTestRunFeedbackEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Test Run Feedbacks') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjtestrunfeedback-form',
    templateUrl: './mjtestrunfeedback.form.component.html'
})
export class MJTestRunFeedbackFormComponent extends BaseFormComponent {
    public record!: MJTestRunFeedbackEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'reviewContext', sectionName: 'Review Context', isExpanded: true },
            { sectionKey: 'feedbackContent', sectionName: 'Feedback Content', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

