import { Component } from '@angular/core';
import { IzzyActionEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Izzy Actions') // Tell MemberJunction about this class
@Component({
    selector: 'gen-izzyaction-form',
    templateUrl: './izzyaction.form.component.html'
})
export class IzzyActionFormComponent extends BaseFormComponent {
    public record!: IzzyActionEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'actionDetails', sectionName: 'Action Details', isExpanded: true },
            { sectionKey: 'categorizationOrdering', sectionName: 'Categorization & Ordering', isExpanded: true },
            { sectionKey: 'accessLicensing', sectionName: 'Access & Licensing', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'izzyActionOrganizations', sectionName: 'Izzy Action Organizations', isExpanded: false }
        ]);
    }
}

export function LoadIzzyActionFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
