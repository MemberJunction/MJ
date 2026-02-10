import { Component } from '@angular/core';
import { EntityDocumentTypeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Entity Document Types') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-entitydocumenttype-form',
    templateUrl: './entitydocumenttype.form.component.html'
})
export class EntityDocumentTypeFormComponent extends BaseFormComponent {
    public record!: EntityDocumentTypeEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'recordIdentifier', sectionName: 'Record Identifier', isExpanded: true },
            { sectionKey: 'documentTypeInformation', sectionName: 'Document Type Information', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'entityDocuments', sectionName: 'Entity Documents', isExpanded: false }
        ]);
    }
}

