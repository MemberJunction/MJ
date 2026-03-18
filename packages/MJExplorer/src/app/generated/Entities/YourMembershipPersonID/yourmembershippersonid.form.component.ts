import { Component } from '@angular/core';
import { YourMembershipPersonIDEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Person IDs') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-yourmembershippersonid-form',
    templateUrl: './yourmembershippersonid.form.component.html'
})
export class YourMembershipPersonIDFormComponent extends BaseFormComponent {
    public record!: YourMembershipPersonIDEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'identityAndRegistration', sectionName: 'Identity and Registration', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

