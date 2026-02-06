import { Component } from '@angular/core';
import { RowLevelSecurityFilterEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Row Level Security Filters') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-rowlevelsecurityfilter-form',
    templateUrl: './rowlevelsecurityfilter.form.component.html'
})
export class RowLevelSecurityFilterFormComponent extends BaseFormComponent {
    public record!: RowLevelSecurityFilterEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'identifier', sectionName: 'Identifier', isExpanded: true },
            { sectionKey: 'filterDefinition', sectionName: 'Filter Definition', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'entityPermissions', sectionName: 'Entity Permissions', isExpanded: false }
        ]);
    }
}

export function LoadRowLevelSecurityFilterFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
