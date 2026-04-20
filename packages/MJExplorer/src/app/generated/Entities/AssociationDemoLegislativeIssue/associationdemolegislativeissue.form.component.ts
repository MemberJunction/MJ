import { Component } from '@angular/core';
import { AssociationDemoLegislativeIssueEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Legislative Issues') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-associationdemolegislativeissue-form',
    templateUrl: './associationdemolegislativeissue.form.component.html'
})
export class AssociationDemoLegislativeIssueFormComponent extends BaseFormComponent {
    public record!: AssociationDemoLegislativeIssueEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'legislativeContext', sectionName: 'Legislative Context', isExpanded: true },
            { sectionKey: 'issueDetails', sectionName: 'Issue Details', isExpanded: true },
            { sectionKey: 'legislativeTracking', sectionName: 'Legislative Tracking', isExpanded: false },
            { sectionKey: 'timelineAndImpact', sectionName: 'Timeline and Impact', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'advocacyActions', sectionName: 'Advocacy Actions', isExpanded: false },
            { sectionKey: 'policyPositions', sectionName: 'Policy Positions', isExpanded: false },
            { sectionKey: 'regulatoryComments', sectionName: 'Regulatory Comments', isExpanded: false }
        ]);
    }
}

