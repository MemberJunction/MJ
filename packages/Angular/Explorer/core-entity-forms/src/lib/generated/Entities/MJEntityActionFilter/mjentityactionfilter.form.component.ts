import { Component } from '@angular/core';
import { MJEntityActionFilterEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Entity Action Filters') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjentityactionfilter-form',
    templateUrl: './mjentityactionfilter.form.component.html'
})
export class MJEntityActionFilterFormComponent extends BaseFormComponent {
    public record!: MJEntityActionFilterEntity;

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

