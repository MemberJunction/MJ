import { Component } from '@angular/core';
import { YourMembershipMemberNetworkEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Member Networks') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-yourmembershipmembernetwork-form',
    templateUrl: './yourmembershipmembernetwork.form.component.html'
})
export class YourMembershipMemberNetworkFormComponent extends BaseFormComponent {
    public record!: YourMembershipMemberNetworkEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'networkProfileDetails', sectionName: 'Network Profile Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

