import { Component } from '@angular/core';
import { MJSignatureRequestDocumentEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Signature Request Documents') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjsignaturerequestdocument-form',
    templateUrl: './mjsignaturerequestdocument.form.component.html'
})
export class MJSignatureRequestDocumentFormComponent extends BaseFormComponent {
    public record!: MJSignatureRequestDocumentEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'signatureRequest', sectionName: 'Signature Request', isExpanded: true },
            { sectionKey: 'artifactReference', sectionName: 'Artifact Reference', isExpanded: true },
            { sectionKey: 'documentDetails', sectionName: 'Document Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

