import { Component } from '@angular/core';
import { MJProcessRunEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Process Runs') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjprocessrun-form',
    templateUrl: './mjprocessrun.form.component.html'
})
export class MJProcessRunFormComponent extends BaseFormComponent {
    public record!: MJProcessRunEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'contextAndRelationships', sectionName: 'Context and Relationships', isExpanded: true },
            { sectionKey: 'executionDetails', sectionName: 'Execution Details', isExpanded: true },
            { sectionKey: 'progressAndResults', sectionName: 'Progress and Results', isExpanded: true },
            { sectionKey: 'resumeAndConfiguration', sectionName: 'Resume and Configuration', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJProcessRunDetails', sectionName: 'Process Run Details', isExpanded: false }
        ]);
    }
}

