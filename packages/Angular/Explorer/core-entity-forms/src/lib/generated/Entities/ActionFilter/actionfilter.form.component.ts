import { Component } from '@angular/core';
import { ActionFilterEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Action Filters') // Tell MemberJunction about this class
@Component({
    selector: 'gen-actionfilter-form',
    templateUrl: './actionfilter.form.component.html'
})
export class ActionFilterFormComponent extends BaseFormComponent {
    public record!: ActionFilterEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'filterDetails', sectionName: 'Filter Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'entityActionFilters', sectionName: 'Entity Action Filters', isExpanded: false }
        ]);
    }
}

export function LoadActionFilterFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
