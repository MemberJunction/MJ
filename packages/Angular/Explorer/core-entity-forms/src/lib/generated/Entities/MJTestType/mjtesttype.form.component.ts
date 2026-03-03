import { Component } from '@angular/core';
import { MJTestTypeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Test Types') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjtesttype-form',
    templateUrl: './mjtesttype.form.component.html'
})
export class MJTestTypeFormComponent extends BaseFormComponent {
    public record!: MJTestTypeEntity;

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

