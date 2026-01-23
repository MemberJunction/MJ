import { Component } from '@angular/core';
import { TestTypeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Test Types') // Tell MemberJunction about this class
@Component({
    selector: 'gen-testtype-form',
    templateUrl: './testtype.form.component.html'
})
export class TestTypeFormComponent extends BaseFormComponent {
    public record!: TestTypeEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'testTypeDefinition', sectionName: 'Test Type Definition', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJTestRubrics', sectionName: 'MJ: Test Rubrics', isExpanded: false },
            { sectionKey: 'mJTests', sectionName: 'MJ: Tests', isExpanded: false }
        ]);
    }
}

export function LoadTestTypeFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
