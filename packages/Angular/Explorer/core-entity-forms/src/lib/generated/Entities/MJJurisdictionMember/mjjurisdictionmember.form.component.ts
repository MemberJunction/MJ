import { Component } from '@angular/core';
import { MJJurisdictionMemberEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Jurisdiction Members') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjjurisdictionmember-form',
    templateUrl: './mjjurisdictionmember.form.component.html'
})
export class MJJurisdictionMemberFormComponent extends BaseFormComponent {
    public record!: MJJurisdictionMemberEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

