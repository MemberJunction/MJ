import { Component } from '@angular/core';
import { MJEntityDocumentRunEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Entity Document Runs') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjentitydocumentrun-form',
    templateUrl: './mjentitydocumentrun.form.component.html'
})
export class MJEntityDocumentRunFormComponent extends BaseFormComponent {
    public record!: MJEntityDocumentRunEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'documentAssociation', sectionName: 'Document Association', isExpanded: true },
            { sectionKey: 'runTimingStatus', sectionName: 'Run Timing & Status', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

