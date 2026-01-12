import { Component } from '@angular/core';
import { BoardPositionEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Board Positions') // Tell MemberJunction about this class
@Component({
    selector: 'gen-boardposition-form',
    templateUrl: './boardposition.form.component.html'
})
export class BoardPositionFormComponent extends BaseFormComponent {
    public record!: BoardPositionEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'positionDefinition', sectionName: 'Position Definition', isExpanded: true },
            { sectionKey: 'positionSettings', sectionName: 'Position Settings', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'boardMembers', sectionName: 'Board Members', isExpanded: false }
        ]);
    }
}

export function LoadBoardPositionFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
