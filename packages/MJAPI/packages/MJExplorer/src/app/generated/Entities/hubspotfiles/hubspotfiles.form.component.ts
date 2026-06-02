import { Component } from '@angular/core';
import { hubspotfilesEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Files') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-hubspotfiles-form',
    templateUrl: './hubspotfiles.form.component.html'
})
export class hubspotfilesFormComponent extends BaseFormComponent {
    public record!: hubspotfilesEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'mediaProperties', sectionName: 'Media Properties', isExpanded: true },
            { sectionKey: 'fileInformation', sectionName: 'File Information', isExpanded: true },
            { sectionKey: 'lifecycleAndSync', sectionName: 'Lifecycle and Sync', isExpanded: false },
            { sectionKey: 'accessAndHosting', sectionName: 'Access and Hosting', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

