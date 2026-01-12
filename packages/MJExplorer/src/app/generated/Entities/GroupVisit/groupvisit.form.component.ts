import { Component } from '@angular/core';
import { GroupVisitEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Group Visits') // Tell MemberJunction about this class
@Component({
    selector: 'gen-groupvisit-form',
    templateUrl: './groupvisit.form.component.html'
})
export class GroupVisitFormComponent extends BaseFormComponent {
    public record!: GroupVisitEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'visitDetails', sectionName: 'Visit Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'groupVisitMembers', sectionName: 'Group Visit Members', isExpanded: false }
        ]);
    }
}

export function LoadGroupVisitFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
