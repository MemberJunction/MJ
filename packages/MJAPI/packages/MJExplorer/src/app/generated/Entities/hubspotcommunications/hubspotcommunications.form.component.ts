import { Component } from '@angular/core';
import { hubspotcommunicationsEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Communications') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-hubspotcommunications-form',
    templateUrl: './hubspotcommunications.form.component.html'
})
export class hubspotcommunicationsFormComponent extends BaseFormComponent {
    public record!: hubspotcommunicationsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'assignmentAndOwnership', sectionName: 'Assignment and Ownership', isExpanded: true },
            { sectionKey: 'provenanceAndSync', sectionName: 'Provenance and Sync', isExpanded: true },
            { sectionKey: 'communicationDetails', sectionName: 'Communication Details', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

