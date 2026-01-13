import { Component } from '@angular/core';
import { MembershipEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Memberships') // Tell MemberJunction about this class
@Component({
    selector: 'gen-membership-form',
    templateUrl: './membership.form.component.html'
})
export class MembershipFormComponent extends BaseFormComponent {
    public record!: MembershipEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

export function LoadMembershipFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
