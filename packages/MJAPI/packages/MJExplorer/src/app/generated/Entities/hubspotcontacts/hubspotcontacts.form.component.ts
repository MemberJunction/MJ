import { Component } from '@angular/core';
import { hubspotcontactsEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Contacts') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-hubspotcontacts-form',
    templateUrl: './hubspotcontacts.form.component.html'
})
export class hubspotcontactsFormComponent extends BaseFormComponent {
    public record!: hubspotcontactsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'lifecycleAndEngagement', sectionName: 'Lifecycle and Engagement', isExpanded: true },
            { sectionKey: 'professionalProfile', sectionName: 'Professional Profile', isExpanded: true },
            { sectionKey: 'personalInformation', sectionName: 'Personal Information', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

