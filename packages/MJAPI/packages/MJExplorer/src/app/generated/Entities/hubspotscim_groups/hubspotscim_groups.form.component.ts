import { Component } from '@angular/core';
import { hubspotscim_groupsEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Scim Groups') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-hubspotscim_groups-form',
    templateUrl: './hubspotscim_groups.form.component.html'
})
export class hubspotscim_groupsFormComponent extends BaseFormComponent {
    public record!: hubspotscim_groupsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'groupInformation', sectionName: 'Group Information', isExpanded: true },
            { sectionKey: 'sCIMMetadata', sectionName: 'SCIM Metadata', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

