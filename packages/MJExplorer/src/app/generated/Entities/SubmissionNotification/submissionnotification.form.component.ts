import { Component } from '@angular/core';
import { SubmissionNotificationEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Submission Notifications') // Tell MemberJunction about this class
@Component({
    selector: 'gen-submissionnotification-form',
    templateUrl: './submissionnotification.form.component.html'
})
export class SubmissionNotificationFormComponent extends BaseFormComponent {
    public record!: SubmissionNotificationEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

export function LoadSubmissionNotificationFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
