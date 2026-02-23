import { Component } from '@angular/core';
import { MJEntityRecordDocumentsEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Entity Record Documents') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjentityrecorddocuments-form',
    templateUrl: './mjentityrecorddocuments.form.component.html'
})
export class MJEntityRecordDocumentsFormComponent extends BaseFormComponent {
    public record!: MJEntityRecordDocumentsEntity;

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

