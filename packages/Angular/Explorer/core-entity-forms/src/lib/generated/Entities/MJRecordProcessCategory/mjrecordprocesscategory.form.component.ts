import { Component } from '@angular/core';
import { MJRecordProcessCategoryEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Record Process Categories') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjrecordprocesscategory-form',
    templateUrl: './mjrecordprocesscategory.form.component.html'
})
export class MJRecordProcessCategoryFormComponent extends BaseFormComponent {
    public record!: MJRecordProcessCategoryEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'categoryDetails', sectionName: 'Category Details', isExpanded: true },
            { sectionKey: 'hierarchy', sectionName: 'Hierarchy', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJRecordProcessCategories', sectionName: 'Record Process Categories', isExpanded: false },
            { sectionKey: 'mJRecordProcesses', sectionName: 'Record Processes', isExpanded: false }
        ]);
    }
}

