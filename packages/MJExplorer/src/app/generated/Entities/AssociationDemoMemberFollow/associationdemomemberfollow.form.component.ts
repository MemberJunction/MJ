import { Component } from '@angular/core';
import { AssociationDemoMemberFollowEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Member Follows') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-associationdemomemberfollow-form',
    templateUrl: './associationdemomemberfollow.form.component.html'
})
export class AssociationDemoMemberFollowFormComponent extends BaseFormComponent {
    public record!: AssociationDemoMemberFollowEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

