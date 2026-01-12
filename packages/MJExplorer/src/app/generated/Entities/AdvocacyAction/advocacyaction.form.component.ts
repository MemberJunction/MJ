import { Component } from '@angular/core';
import { AdvocacyActionEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Advocacy Actions') // Tell MemberJunction about this class
@Component({
    selector: 'gen-advocacyaction-form',
    templateUrl: './advocacyaction.form.component.html'
})
export class AdvocacyActionFormComponent extends BaseFormComponent {
    public record!: AdvocacyActionEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'relatedParties', sectionName: 'Related Parties', isExpanded: true },
            { sectionKey: 'advocacyDetails', sectionName: 'Advocacy Details', isExpanded: true },
            { sectionKey: 'timelineFollowUp', sectionName: 'Timeline & Follow-Up', isExpanded: false },
            { sectionKey: 'details', sectionName: 'Details', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

export function LoadAdvocacyActionFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
