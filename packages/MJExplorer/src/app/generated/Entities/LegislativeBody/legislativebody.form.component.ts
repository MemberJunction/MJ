import { Component } from '@angular/core';
import { LegislativeBodyEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Legislative Bodies') // Tell MemberJunction about this class
@Component({
    selector: 'gen-legislativebody-form',
    templateUrl: './legislativebody.form.component.html'
})
export class LegislativeBodyFormComponent extends BaseFormComponent {
    public record!: LegislativeBodyEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'identification', sectionName: 'Identification', isExpanded: true },
            { sectionKey: 'geography', sectionName: 'Geography', isExpanded: true },
            { sectionKey: 'details', sectionName: 'Details', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'governmentContacts', sectionName: 'Government Contacts', isExpanded: false },
            { sectionKey: 'legislativeIssues', sectionName: 'Legislative Issues', isExpanded: false }
        ]);
    }
}

export function LoadLegislativeBodyFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
