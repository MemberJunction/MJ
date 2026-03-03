import { Component } from '@angular/core';
import { MJVectorDatabaseEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Vector Databases') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjvectordatabase-form',
    templateUrl: './mjvectordatabase.form.component.html'
})
export class MJVectorDatabaseFormComponent extends BaseFormComponent {
    public record!: MJVectorDatabaseEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'vectorDatabaseDetails', sectionName: 'Vector Database Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJEntityDocuments', sectionName: 'Entity Documents', isExpanded: false },
            { sectionKey: 'mJVectorIndexes', sectionName: 'Vector Indexes', isExpanded: false }
        ]);
    }
}

