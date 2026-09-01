import { Component } from '@angular/core';
import { MJMLComponentTypeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: ML Component Types') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjmlcomponenttype-form',
    templateUrl: './mjmlcomponenttype.form.component.html'
})
export class MJMLComponentTypeFormComponent extends BaseFormComponent {
    public record!: MJMLComponentTypeEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'mJMLComponentTypeProperties', sectionName: 'ML Component Type Properties', isExpanded: false },
            { sectionKey: 'mJMLComponentTypeSlotsComponentTypeID', sectionName: 'ML Component Type Slots (Component Type ID)', isExpanded: false },
            { sectionKey: 'mJMLComponentTypeSlotsAcceptsComponentTypeID', sectionName: 'ML Component Type Slots (Accepts Component Type ID)', isExpanded: false },
            { sectionKey: 'mJMLComponentTypeSlotsDefaultComponentTypeID', sectionName: 'ML Component Type Slots (Default Component Type ID)', isExpanded: false },
            { sectionKey: 'mJMLComponentTypes', sectionName: 'ML Component Types', isExpanded: false },
            { sectionKey: 'mJMLComponents', sectionName: 'ML Components', isExpanded: false },
            { sectionKey: 'mJMLAlgorithms', sectionName: 'ML Algorithms', isExpanded: false }
        ]);
    }
}

