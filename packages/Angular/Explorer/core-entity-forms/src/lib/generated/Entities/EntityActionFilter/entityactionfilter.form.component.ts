import { Component } from '@angular/core';
import { EntityActionFilterEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Entity Action Filters') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-entityactionfilter-form',
    templateUrl: './entityactionfilter.form.component.html'
})
export class EntityActionFilterFormComponent extends BaseFormComponent {
    public record!: EntityActionFilterEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'identifierKeys', sectionName: 'Identifier Keys', isExpanded: true },
            { sectionKey: 'executionSettings', sectionName: 'Execution Settings', isExpanded: true },
            { sectionKey: 'actionDefinition', sectionName: 'Action Definition', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

