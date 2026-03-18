import { Component } from '@angular/core';
import { HubSpotContactCallEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Contact Calls') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-hubspotcontactcall-form',
    templateUrl: './hubspotcontactcall.form.component.html'
})
export class HubSpotContactCallFormComponent extends BaseFormComponent {
    public record!: HubSpotContactCallEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'callAssociation', sectionName: 'Call Association', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

