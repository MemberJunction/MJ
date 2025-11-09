import { Component } from '@angular/core';
import { TestEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'MJ: Tests') // Tell MemberJunction about this class
@Component({
    selector: 'gen-test-form',
    templateUrl: './test.form.component.html'
})
export class TestFormComponent extends BaseFormComponent {
    public record!: TestEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'mJTestRuns', sectionName: 'MJ: Test Runs', isExpanded: false },
            { sectionKey: 'mJTestSuiteTests', sectionName: 'MJ: Test Suite Tests', isExpanded: false }
        ]);
    }
}

export function LoadTestFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
