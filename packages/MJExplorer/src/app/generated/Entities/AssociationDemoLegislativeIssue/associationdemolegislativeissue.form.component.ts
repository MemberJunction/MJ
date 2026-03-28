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
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'regulatoryComments', sectionName: 'Regulatory Comments', isExpanded: false },
            { sectionKey: 'policyPositions', sectionName: 'Policy Positions', isExpanded: false },
            { sectionKey: 'advocacyActions', sectionName: 'Advocacy Actions', isExpanded: false }
        ]);
    }
}

