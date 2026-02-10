import { Component } from '@angular/core';
import { EntityDocumentRunEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Entity Document Runs') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-entitydocumentrun-form',
    templateUrl: './entitydocumentrun.form.component.html'
})
export class EntityDocumentRunFormComponent extends BaseFormComponent {
    public record!: EntityDocumentRunEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'documentAssociation', sectionName: 'Document Association', isExpanded: true },
            { sectionKey: 'runTimingStatus', sectionName: 'Run Timing & Status', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

