import { Component } from '@angular/core';
import { MJRowLevelSecurityFilterEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Row Level Security Filters') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjrowlevelsecurityfilter-form',
    templateUrl: './mjrowlevelsecurityfilter.form.component.html'
})
export class MJRowLevelSecurityFilterFormComponent extends BaseFormComponent {
    public record!: MJRowLevelSecurityFilterEntity;

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

