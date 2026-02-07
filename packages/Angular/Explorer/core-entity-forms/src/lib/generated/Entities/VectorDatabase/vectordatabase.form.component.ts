import { Component } from '@angular/core';
import { VectorDatabaseEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Vector Databases') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-vectordatabase-form',
    templateUrl: './vectordatabase.form.component.html'
})
export class VectorDatabaseFormComponent extends BaseFormComponent {
    public record!: VectorDatabaseEntity;

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

export function LoadVectorDatabaseFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
