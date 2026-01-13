import { Component } from '@angular/core';
import { LegislativeIssueEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Legislative Issues') // Tell MemberJunction about this class
@Component({
    selector: 'gen-legislativeissue-form',
    templateUrl: './legislativeissue.form.component.html'
})
export class LegislativeIssueFormComponent extends BaseFormComponent {
    public record!: LegislativeIssueEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'policyPositions', sectionName: 'Policy Positions', isExpanded: false },
            { sectionKey: 'regulatoryComments', sectionName: 'Regulatory Comments', isExpanded: false },
            { sectionKey: 'advocacyActions', sectionName: 'Advocacy Actions', isExpanded: false }
        ]);
    }
}

export function LoadLegislativeIssueFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
