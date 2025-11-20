import { Component } from '@angular/core';
import { SpeakerEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Speakers') // Tell MemberJunction about this class
@Component({
    selector: 'gen-speaker-form',
    templateUrl: './speaker.form.component.html'
})
export class SpeakerFormComponent extends BaseFormComponent {
    public record!: SpeakerEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'submissionSpeakers', sectionName: 'Submission Speakers', isExpanded: false }
        ]);
    }
}

export function LoadSpeakerFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
