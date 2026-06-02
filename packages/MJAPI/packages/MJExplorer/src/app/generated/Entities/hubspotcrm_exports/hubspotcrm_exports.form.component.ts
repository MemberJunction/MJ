import { Component } from '@angular/core';
import { hubspotcrm_exportsEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Crm Exports') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-hubspotcrm_exports-form',
    templateUrl: './hubspotcrm_exports.form.component.html'
})
export class hubspotcrm_exportsFormComponent extends BaseFormComponent {
    public record!: hubspotcrm_exportsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'exportTaskDetails', sectionName: 'Export Task Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

