import { Component } from '@angular/core';
import { hubspotlistsEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Lists') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-hubspotlists-form',
    templateUrl: './hubspotlists.form.component.html'
})
export class hubspotlistsFormComponent extends BaseFormComponent {
    public record!: hubspotlistsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'configurationAndLogic', sectionName: 'Configuration and Logic', isExpanded: true },
            { sectionKey: 'statusAndMetrics', sectionName: 'Status and Metrics', isExpanded: true },
            { sectionKey: 'listIdentification', sectionName: 'List Identification', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

