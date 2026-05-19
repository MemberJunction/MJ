import { Component } from '@angular/core';
import { MJContentProcessRunEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Content Process Runs') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjcontentprocessrun-form',
    templateUrl: './mjcontentprocessrun.form.component.html'
})
export class MJContentProcessRunFormComponent extends BaseFormComponent {
    public record!: MJContentProcessRunEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'runMetadata', sectionName: 'Run Metadata', isExpanded: false },
            { sectionKey: 'executionDetails', sectionName: 'Execution Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJContentProcessRunDetails', sectionName: 'Content Process Run Details', isExpanded: false }
        ]);
    }
}

