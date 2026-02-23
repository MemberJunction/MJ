import { Component } from '@angular/core';
import { MJActionFiltersEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Action Filters') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjactionfilters-form',
    templateUrl: './mjactionfilters.form.component.html'
})
export class MJActionFiltersFormComponent extends BaseFormComponent {
    public record!: MJActionFiltersEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'filterDetails', sectionName: 'Filter Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'entityActionFilters', sectionName: 'Entity Action Filters', isExpanded: false }
        ]);
    }
}

