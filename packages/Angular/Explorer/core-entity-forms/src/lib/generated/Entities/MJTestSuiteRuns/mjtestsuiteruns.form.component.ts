import { Component } from '@angular/core';
import { MJTestSuiteRunsEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Test Suite Runs') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjtestsuiteruns-form',
    templateUrl: './mjtestsuiteruns.form.component.html'
})
export class MJTestSuiteRunsFormComponent extends BaseFormComponent {
    public record!: MJTestSuiteRunsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'runIdentification', sectionName: 'Run Identification', isExpanded: true },
            { sectionKey: 'executionTimelineStatus', sectionName: 'Execution Timeline & Status', isExpanded: true },
            { sectionKey: 'testMetrics', sectionName: 'Test Metrics', isExpanded: false },
            { sectionKey: 'technicalOutput', sectionName: 'Technical Output', isExpanded: false },
            { sectionKey: 'executionHost', sectionName: 'Execution Host', isExpanded: false },
            { sectionKey: 'userDetails', sectionName: 'User Details', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJTestRuns', sectionName: 'MJ: Test Runs', isExpanded: false }
        ]);
    }
}

