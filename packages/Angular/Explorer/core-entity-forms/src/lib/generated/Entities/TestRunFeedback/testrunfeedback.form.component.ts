import { Component } from '@angular/core';
import { TestRunFeedbackEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Test Run Feedbacks') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-testrunfeedback-form',
    templateUrl: './testrunfeedback.form.component.html'
})
export class TestRunFeedbackFormComponent extends BaseFormComponent {
    public record!: TestRunFeedbackEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'reviewContext', sectionName: 'Review Context', isExpanded: true },
            { sectionKey: 'feedbackContent', sectionName: 'Feedback Content', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

export function LoadTestRunFeedbackFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
