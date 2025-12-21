import { Component } from '@angular/core';
import { TestSuiteRunEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'MJ: Test Suite Runs') // Tell MemberJunction about this class
@Component({
  standalone: false,
    selector: 'gen-testsuiterun-form',
    templateUrl: './testsuiterun.form.component.html'
})
export class TestSuiteRunFormComponent extends BaseFormComponent {
    public record!: TestSuiteRunEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'mJTestRuns', sectionName: 'MJ: Test Runs', isExpanded: false }
        ]);
    }
}

export function LoadTestSuiteRunFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
