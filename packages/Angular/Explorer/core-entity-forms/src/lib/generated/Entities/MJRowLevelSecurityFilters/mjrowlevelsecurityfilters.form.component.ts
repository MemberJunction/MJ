import { Component } from '@angular/core';
import { MJRowLevelSecurityFiltersEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Row Level Security Filters') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjrowlevelsecurityfilters-form',
    templateUrl: './mjrowlevelsecurityfilters.form.component.html'
})
export class MJRowLevelSecurityFiltersFormComponent extends BaseFormComponent {
    public record!: MJRowLevelSecurityFiltersEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'identifier', sectionName: 'Identifier', isExpanded: true },
            { sectionKey: 'filterDefinition', sectionName: 'Filter Definition', isExpanded: true },
            { sectionKey: 'details', sectionName: 'Details', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'entityPermissions', sectionName: 'Entity Permissions', isExpanded: false }
        ]);
    }
}

