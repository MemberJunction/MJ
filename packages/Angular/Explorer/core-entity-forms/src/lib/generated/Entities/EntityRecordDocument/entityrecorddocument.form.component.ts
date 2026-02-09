import { Component } from '@angular/core';
import { EntityRecordDocumentEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Entity Record Documents') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-entityrecorddocument-form',
    templateUrl: './entityrecorddocument.form.component.html'
})
export class EntityRecordDocumentFormComponent extends BaseFormComponent {
    public record!: EntityRecordDocumentEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'identifiers', sectionName: 'Identifiers', isExpanded: true },
            { sectionKey: 'documentDefinitionOutput', sectionName: 'Document Definition & Output', isExpanded: true },
            { sectionKey: 'vectorEmbedding', sectionName: 'Vector Embedding', isExpanded: false },
            { sectionKey: 'timestampsAudit', sectionName: 'Timestamps & Audit', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

