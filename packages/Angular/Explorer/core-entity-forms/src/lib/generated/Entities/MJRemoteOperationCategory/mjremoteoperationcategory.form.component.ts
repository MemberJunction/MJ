import { Component } from '@angular/core';
import { MJRemoteOperationCategoryEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Remote Operation Categories') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjremoteoperationcategory-form',
    templateUrl: './mjremoteoperationcategory.form.component.html'
})
export class MJRemoteOperationCategoryFormComponent extends BaseFormComponent {
    public record!: MJRemoteOperationCategoryEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'categoryDetails', sectionName: 'Category Details', isExpanded: true },
            { sectionKey: 'hierarchy', sectionName: 'Hierarchy', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJRemoteOperations', sectionName: 'Remote Operations', isExpanded: false },
            { sectionKey: 'mJRemoteOperationCategories', sectionName: 'Remote Operation Categories', isExpanded: false }
        ]);
    }
}

