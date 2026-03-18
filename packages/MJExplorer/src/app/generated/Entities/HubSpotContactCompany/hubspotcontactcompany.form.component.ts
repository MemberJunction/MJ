import { Component } from '@angular/core';
import { HubSpotContactCompanyEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Contact Companies') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-hubspotcontactcompany-form',
    templateUrl: './hubspotcontactcompany.form.component.html'
})
export class HubSpotContactCompanyFormComponent extends BaseFormComponent {
    public record!: HubSpotContactCompanyEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'relationshipDetails', sectionName: 'Relationship Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

