import { Component } from '@angular/core';
import { AssociationDemoBoardMemberEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Board Members') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-associationdemoboardmember-form',
    templateUrl: './associationdemoboardmember.form.component.html'
})
export class AssociationDemoBoardMemberFormComponent extends BaseFormComponent {
    public record!: AssociationDemoBoardMemberEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

