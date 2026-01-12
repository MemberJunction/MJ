import { Component } from '@angular/core';
import { GovernmentContactEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Government Contacts') // Tell MemberJunction about this class
@Component({
    selector: 'gen-governmentcontact-form',
    templateUrl: './governmentcontact.form.component.html'
})
export class GovernmentContactFormComponent extends BaseFormComponent {
    public record!: GovernmentContactEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'legislativeRole', sectionName: 'Legislative Role', isExpanded: true },
            { sectionKey: 'identity', sectionName: 'Identity', isExpanded: true },
            { sectionKey: 'contactChannels', sectionName: 'Contact Channels', isExpanded: false },
            { sectionKey: 'termStatus', sectionName: 'Term & Status', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'advocacyActions', sectionName: 'Advocacy Actions', isExpanded: false }
        ]);
    }
}

export function LoadGovernmentContactFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
