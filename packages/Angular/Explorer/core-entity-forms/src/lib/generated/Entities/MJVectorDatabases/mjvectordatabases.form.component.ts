import { Component } from '@angular/core';
import { MJVectorDatabasesEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Vector Databases') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjvectordatabases-form',
    templateUrl: './mjvectordatabases.form.component.html'
})
export class MJVectorDatabasesFormComponent extends BaseFormComponent {
    public record!: MJVectorDatabasesEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'vectorDatabaseDetails', sectionName: 'Vector Database Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'entityDocuments', sectionName: 'Entity Documents', isExpanded: false },
            { sectionKey: 'vectorIndexes', sectionName: 'Vector Indexes', isExpanded: false }
        ]);
    }
}

