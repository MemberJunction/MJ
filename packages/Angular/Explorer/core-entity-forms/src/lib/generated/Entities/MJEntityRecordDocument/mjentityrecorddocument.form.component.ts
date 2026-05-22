import { Component } from '@angular/core';
import { MJEntityRecordDocumentEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Entity Record Documents') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjentityrecorddocument-form',
    templateUrl: './mjentityrecorddocument.form.component.html'
})
export class MJEntityRecordDocumentFormComponent extends BaseFormComponent {
    public record!: MJEntityRecordDocumentEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'identifiers', sectionName: 'Identifiers', isExpanded: true },
            { sectionKey: 'documentDefinitionOutput', sectionName: 'Document Definition & Output', isExpanded: true },
            { sectionKey: 'vectorEmbedding', sectionName: 'Vector Embedding', isExpanded: true },
            { sectionKey: 'timestampsAudit', sectionName: 'Timestamps & Audit', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJContentItems', sectionName: 'Content Items', isExpanded: false }
        ]);
    }
}

