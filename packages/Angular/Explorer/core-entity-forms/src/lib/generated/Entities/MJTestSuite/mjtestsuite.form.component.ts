import { Component } from '@angular/core';
import { MJTestSuiteEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Test Suites') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjtestsuite-form',
    templateUrl: './mjtestsuite.form.component.html'
})
export class MJTestSuiteFormComponent extends BaseFormComponent {
    public record!: MJTestSuiteEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'hierarchy', sectionName: 'Hierarchy', isExpanded: true },
            { sectionKey: 'suiteIdentification', sectionName: 'Suite Identification', isExpanded: true },
            { sectionKey: 'executionConfiguration', sectionName: 'Execution Configuration', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJTestSuites', sectionName: 'Test Suites', isExpanded: false },
            { sectionKey: 'mJTestSuiteRuns', sectionName: 'Test Suite Runs', isExpanded: false },
            { sectionKey: 'mJTestSuiteTests', sectionName: 'Test Suite Tests', isExpanded: false }
        ]);
    }
}

