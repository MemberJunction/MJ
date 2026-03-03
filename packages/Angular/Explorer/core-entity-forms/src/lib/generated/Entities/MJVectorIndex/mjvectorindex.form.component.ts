import { Component } from '@angular/core';
import { MJVectorIndexEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Vector Indexes') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjvectorindex-form',
    templateUrl: './mjvectorindex.form.component.html'
})
export class MJVectorIndexFormComponent extends BaseFormComponent {
    public record!: MJVectorIndexEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'indexProfile', sectionName: 'Index Profile', isExpanded: true },
            { sectionKey: 'associatedResources', sectionName: 'Associated Resources', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'entityRecordDocuments', sectionName: 'Entity Record Documents', isExpanded: false }
        ]);
    }
}

