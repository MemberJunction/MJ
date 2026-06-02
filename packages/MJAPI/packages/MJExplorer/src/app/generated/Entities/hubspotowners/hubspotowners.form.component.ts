import { Component } from '@angular/core';
import { hubspotownersEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Owners') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-hubspotowners-form',
    templateUrl: './hubspotowners.form.component.html'
})
export class hubspotownersFormComponent extends BaseFormComponent {
    public record!: hubspotownersEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'ownerInformation', sectionName: 'Owner Information', isExpanded: true },
            { sectionKey: 'organizationalDetails', sectionName: 'Organizational Details', isExpanded: true },
            { sectionKey: 'statusAndSync', sectionName: 'Status and Sync', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

