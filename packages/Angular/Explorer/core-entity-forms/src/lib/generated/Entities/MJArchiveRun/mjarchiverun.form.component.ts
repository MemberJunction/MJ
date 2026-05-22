import { Component } from '@angular/core';
import { MJArchiveRunEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Archive Runs') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjarchiverun-form',
    templateUrl: './mjarchiverun.form.component.html'
})
export class MJArchiveRunFormComponent extends BaseFormComponent {
    public record!: MJArchiveRunEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'executionContext', sectionName: 'Execution Context', isExpanded: true },
            { sectionKey: 'runStatusAndTiming', sectionName: 'Run Status and Timing', isExpanded: true },
            { sectionKey: 'archiveStatistics', sectionName: 'Archive Statistics', isExpanded: true },
            { sectionKey: 'errorDiagnostics', sectionName: 'Error Diagnostics', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJArchiveRunDetails', sectionName: 'Archive Run Details', isExpanded: false }
        ]);
    }
}

