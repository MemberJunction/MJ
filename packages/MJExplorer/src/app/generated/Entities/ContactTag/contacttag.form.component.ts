import { Component } from '@angular/core';
import { ContactTagEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Contact Tags') // Tell MemberJunction about this class
@Component({
    selector: 'gen-contacttag-form',
    templateUrl: './contacttag.form.component.html'
})
export class ContactTagFormComponent extends BaseFormComponent {
    public record!: ContactTagEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'tagDetails', sectionName: 'Tag Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'contactTagLinks', sectionName: 'Contact Tag Links', isExpanded: false }
        ]);
    }
}

export function LoadContactTagFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
