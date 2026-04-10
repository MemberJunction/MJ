import { Component } from '@angular/core';
import { MJEntityDocumentTypeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Entity Document Types') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjentitydocumenttype-form',
    templateUrl: './mjentitydocumenttype.form.component.html'
})
export class MJEntityDocumentTypeFormComponent extends BaseFormComponent {
    public record!: MJEntityDocumentTypeEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'recordIdentifier', sectionName: 'Record Identifier', isExpanded: true },
            { sectionKey: 'documentTypeInformation', sectionName: 'Document Type Information', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJEntityDocuments', sectionName: 'Entity Documents', isExpanded: false }
        ]);
    }
}

