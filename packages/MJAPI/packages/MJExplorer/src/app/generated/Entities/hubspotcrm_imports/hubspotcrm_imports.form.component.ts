import { Component } from '@angular/core';
import { hubspotcrm_importsEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Crm Imports') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-hubspotcrm_imports-form',
    templateUrl: './hubspotcrm_imports.form.component.html'
})
export class hubspotcrm_importsFormComponent extends BaseFormComponent {
    public record!: hubspotcrm_importsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'importTimeline', sectionName: 'Import Timeline', isExpanded: true },
            { sectionKey: 'importDetails', sectionName: 'Import Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

