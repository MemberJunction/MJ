import { Component } from '@angular/core';
import { hubspotformsEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Forms') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-hubspotforms-form',
    templateUrl: './hubspotforms.form.component.html'
})
export class hubspotformsFormComponent extends BaseFormComponent {
    public record!: hubspotformsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'formBehavior', sectionName: 'Form Behavior', isExpanded: true },
            { sectionKey: 'generalInformation', sectionName: 'General Information', isExpanded: true },
            { sectionKey: 'technicalInformation', sectionName: 'Technical Information', isExpanded: false },
            { sectionKey: 'designAndConfiguration', sectionName: 'Design and Configuration', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

