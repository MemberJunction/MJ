import { Component } from '@angular/core';
import { OrganizationEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Organizations') // Tell MemberJunction about this class
@Component({
    selector: 'gen-organization-form',
    templateUrl: './organization.form.component.html'
})
export class OrganizationFormComponent extends BaseFormComponent {
    public record!: OrganizationEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'members', sectionName: 'Members', isExpanded: false }
        ]);
    }
}

export function LoadOrganizationFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
