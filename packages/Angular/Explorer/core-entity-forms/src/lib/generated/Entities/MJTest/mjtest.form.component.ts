import { Component } from '@angular/core';
import { MJTestEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Tests') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjtest-form',
    templateUrl: './mjtest.form.component.html'
})
export class MJTestFormComponent extends BaseFormComponent {
    public record!: MJTestEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'testDefinition', sectionName: 'Test Definition', isExpanded: true },
            { sectionKey: 'testLogic', sectionName: 'Test Logic', isExpanded: true },
            { sectionKey: 'executionSettings', sectionName: 'Execution Settings', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJTestRuns', sectionName: 'MJ: Test Runs', isExpanded: false },
            { sectionKey: 'mJTestSuiteTests', sectionName: 'MJ: Test Suite Tests', isExpanded: false }
        ]);
    }
}

