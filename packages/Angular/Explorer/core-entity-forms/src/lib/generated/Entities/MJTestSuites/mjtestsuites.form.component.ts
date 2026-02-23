import { Component } from '@angular/core';
import { MJTestSuitesEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Test Suites') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjtestsuites-form',
    templateUrl: './mjtestsuites.form.component.html'
})
export class MJTestSuitesFormComponent extends BaseFormComponent {
    public record!: MJTestSuitesEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'hierarchy', sectionName: 'Hierarchy', isExpanded: true },
            { sectionKey: 'suiteIdentification', sectionName: 'Suite Identification', isExpanded: true },
            { sectionKey: 'executionConfiguration', sectionName: 'Execution Configuration', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJTestSuites', sectionName: 'MJ: Test Suites', isExpanded: false },
            { sectionKey: 'mJTestSuiteRuns', sectionName: 'MJ: Test Suite Runs', isExpanded: false },
            { sectionKey: 'mJTestSuiteTests', sectionName: 'MJ: Test Suite Tests', isExpanded: false }
        ]);
    }
}

