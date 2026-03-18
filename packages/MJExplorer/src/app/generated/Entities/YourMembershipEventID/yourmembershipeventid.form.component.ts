import { Component } from '@angular/core';
import { YourMembershipEventIDEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Event IDs') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-yourmembershipeventid-form',
    templateUrl: './yourmembershipeventid.form.component.html'
})
export class YourMembershipEventIDFormComponent extends BaseFormComponent {
    public record!: YourMembershipEventIDEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'eventDetails', sectionName: 'Event Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

