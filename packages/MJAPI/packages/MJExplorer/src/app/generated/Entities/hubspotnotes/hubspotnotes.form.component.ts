import { Component } from '@angular/core';
import { hubspotnotesEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Notes') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-hubspotnotes-form',
    templateUrl: './hubspotnotes.form.component.html'
})
export class hubspotnotesFormComponent extends BaseFormComponent {
    public record!: hubspotnotesEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'noteContent', sectionName: 'Note Content', isExpanded: true },
            { sectionKey: 'timelineAndAudit', sectionName: 'Timeline and Audit', isExpanded: true },
            { sectionKey: 'ownershipAndAccess', sectionName: 'Ownership and Access', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

