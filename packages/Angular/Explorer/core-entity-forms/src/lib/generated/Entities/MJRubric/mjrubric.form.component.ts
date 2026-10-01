import { Component } from '@angular/core';
import { MJRubricEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Rubrics') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjrubric-form',
    templateUrl: './mjrubric.form.component.html'
})
export class MJRubricFormComponent extends BaseFormComponent {
    public record!: MJRubricEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'mJTests', sectionName: 'Tests', isExpanded: false },
            { sectionKey: 'mJAIAgentRubrics', sectionName: 'AI Agent Rubrics', isExpanded: false },
            { sectionKey: 'mJTestSuites', sectionName: 'Test Suites', isExpanded: false },
            { sectionKey: 'mJRubricVersions', sectionName: 'Rubric Versions', isExpanded: false }
        ]);
    }
}

