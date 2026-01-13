import { Component } from '@angular/core';
import { Contact__DemoEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Contacts__Demo') // Tell MemberJunction about this class
@Component({
    selector: 'gen-contact__demo-form',
    templateUrl: './contact__demo.form.component.html'
})
export class Contact__DemoFormComponent extends BaseFormComponent {
    public record!: Contact__DemoEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'personalInformation', sectionName: 'Personal Information', isExpanded: true },
            { sectionKey: 'professionalInformation', sectionName: 'Professional Information', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'contactInsights', sectionName: 'Contact Insights', isExpanded: false },
            { sectionKey: 'contactTagLinks', sectionName: 'Contact Tag Links', isExpanded: false },
            { sectionKey: 'activitiesDemo', sectionName: 'Activities__Demo', isExpanded: false }
        ]);
    }
}

export function LoadContact__DemoFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
