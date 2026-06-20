import { Component } from '@angular/core';
import { MJRecordProcessEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Record Processes') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjrecordprocess-form',
    templateUrl: './mjrecordprocess.form.component.html'
})
export class MJRecordProcessFormComponent extends BaseFormComponent {
    public record!: MJRecordProcessEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'processDefinition', sectionName: 'Process Definition', isExpanded: true },
            { sectionKey: 'executionLogic', sectionName: 'Execution Logic', isExpanded: true },
            { sectionKey: 'scopeConfiguration', sectionName: 'Scope Configuration', isExpanded: true },
            { sectionKey: 'triggers', sectionName: 'Triggers', isExpanded: true },
            { sectionKey: 'performanceAndOptimization', sectionName: 'Performance and Optimization', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJRecordProcessWatermarks', sectionName: 'Record Process Watermarks', isExpanded: false },
            { sectionKey: 'mJProcessRuns', sectionName: 'Process Runs', isExpanded: false }
        ]);
    }
}

