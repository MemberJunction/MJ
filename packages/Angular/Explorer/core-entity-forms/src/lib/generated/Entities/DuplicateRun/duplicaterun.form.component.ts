import { Component } from '@angular/core';
import { DuplicateRunEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Duplicate Runs') // Tell MemberJunction about this class
@Component({
    selector: 'gen-duplicaterun-form',
    templateUrl: './duplicaterun.form.component.html'
})
export class DuplicateRunFormComponent extends BaseFormComponent {
    public record!: DuplicateRunEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'runOverview', sectionName: 'Run Overview', isExpanded: true },
            { sectionKey: 'approvalInformation', sectionName: 'Approval Information', isExpanded: true },
            { sectionKey: 'processingStatus', sectionName: 'Processing Status', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'duplicateRunDetails', sectionName: 'Duplicate Run Details', isExpanded: false }
        ]);
    }
}

export function LoadDuplicateRunFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
