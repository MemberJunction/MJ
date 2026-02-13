import { Component } from '@angular/core';
import { MJEntityDocumentEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Entity Documents') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjentitydocument-form',
    templateUrl: './mjentitydocument.form.component.html'
})
export class MJEntityDocumentFormComponent extends BaseFormComponent {
    public record!: MJEntityDocumentEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'documentDetails', sectionName: 'Document Details', isExpanded: true },
            { sectionKey: 'relationships', sectionName: 'Relationships', isExpanded: true },
            { sectionKey: 'matchingConfiguration', sectionName: 'Matching Configuration', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'entityDocumentRuns', sectionName: 'Entity Document Runs', isExpanded: false },
            { sectionKey: 'entityDocumentSettings', sectionName: 'Entity Document Settings', isExpanded: false },
            { sectionKey: 'entityRecordDocuments', sectionName: 'Entity Record Documents', isExpanded: false }
        ]);
    }
}

