import { Component } from '@angular/core';
import { AssociationDemoMembershipEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Memberships') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-associationdemomembership-form',
    templateUrl: './associationdemomembership.form.component.html'
})
export class AssociationDemoMembershipFormComponent extends BaseFormComponent {
    public record!: AssociationDemoMembershipEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

