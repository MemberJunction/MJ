import { Component } from '@angular/core';
import { MJDuplicateRunEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Duplicate Runs') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjduplicaterun-form',
    templateUrl: './mjduplicaterun.form.component.html'
})
export class MJDuplicateRunFormComponent extends BaseFormComponent {
    public record!: MJDuplicateRunEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'runOverview', sectionName: 'Run Overview', isExpanded: true },
            { sectionKey: 'approvalInformation', sectionName: 'Approval Information', isExpanded: true },
            { sectionKey: 'processingStatus', sectionName: 'Processing Status', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJDuplicateRunDetails', sectionName: 'Duplicate Run Details', isExpanded: false }
        ]);
    }
}

