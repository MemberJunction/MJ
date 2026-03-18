import { Component } from '@angular/core';
import { YourMembershipEventSessionGroupEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Event Session Groups') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-yourmembershipeventsessiongroup-form',
    templateUrl: './yourmembershipeventsessiongroup.form.component.html'
})
export class YourMembershipEventSessionGroupFormComponent extends BaseFormComponent {
    public record!: YourMembershipEventSessionGroupEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'groupDetails', sectionName: 'Group Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

