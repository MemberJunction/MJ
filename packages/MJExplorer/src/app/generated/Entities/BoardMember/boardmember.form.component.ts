import { Component } from '@angular/core';
import { BoardMemberEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Board Members') // Tell MemberJunction about this class
@Component({
    selector: 'gen-boardmember-form',
    templateUrl: './boardmember.form.component.html'
})
export class BoardMemberFormComponent extends BaseFormComponent {
    public record!: BoardMemberEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'boardAssignment', sectionName: 'Board Assignment', isExpanded: true },
            { sectionKey: 'serviceDates', sectionName: 'Service Dates', isExpanded: true },
            { sectionKey: 'details', sectionName: 'Details', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

export function LoadBoardMemberFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
