import { Component } from '@angular/core';
import { MJMLCompositeMembershipEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: ML Composite Memberships') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjmlcompositemembership-form',
    templateUrl: './mjmlcompositemembership.form.component.html'
})
export class MJMLCompositeMembershipFormComponent extends BaseFormComponent {
    public record!: MJMLCompositeMembershipEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

