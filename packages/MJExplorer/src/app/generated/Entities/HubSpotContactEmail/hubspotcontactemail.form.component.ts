import { Component } from '@angular/core';
import { HubSpotContactEmailEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Contact Emails') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-hubspotcontactemail-form',
    templateUrl: './hubspotcontactemail.form.component.html'
})
export class HubSpotContactEmailFormComponent extends BaseFormComponent {
    public record!: HubSpotContactEmailEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'associationDetails', sectionName: 'Association Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

