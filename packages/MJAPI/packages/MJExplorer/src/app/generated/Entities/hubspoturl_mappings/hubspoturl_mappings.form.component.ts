import { Component } from '@angular/core';
import { hubspoturl_mappingsEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Url Mappings') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-hubspoturl_mappings-form',
    templateUrl: './hubspoturl_mappings.form.component.html'
})
export class hubspoturl_mappingsFormComponent extends BaseFormComponent {
    public record!: hubspoturl_mappingsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'matchingLogic', sectionName: 'Matching Logic', isExpanded: true },
            { sectionKey: 'uRLMappingRules', sectionName: 'URL Mapping Rules', isExpanded: true },
            { sectionKey: 'administrativeInformation', sectionName: 'Administrative Information', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

