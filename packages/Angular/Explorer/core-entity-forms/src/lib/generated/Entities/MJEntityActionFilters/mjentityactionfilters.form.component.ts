import { Component } from '@angular/core';
import { MJEntityActionFiltersEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Entity Action Filters') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjentityactionfilters-form',
    templateUrl: './mjentityactionfilters.form.component.html'
})
export class MJEntityActionFiltersFormComponent extends BaseFormComponent {
    public record!: MJEntityActionFiltersEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'identifierKeys', sectionName: 'Identifier Keys', isExpanded: true },
            { sectionKey: 'executionSettings', sectionName: 'Execution Settings', isExpanded: true },
            { sectionKey: 'details', sectionName: 'Details', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

