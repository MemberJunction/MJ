import { Component } from '@angular/core';
import { SubmissionSpeakerEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Submission Speakers') // Tell MemberJunction about this class
@Component({
    selector: 'gen-submissionspeaker-form',
    templateUrl: './submissionspeaker.form.component.html'
})
export class SubmissionSpeakerFormComponent extends BaseFormComponent {
    public record!: SubmissionSpeakerEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

export function LoadSubmissionSpeakerFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
