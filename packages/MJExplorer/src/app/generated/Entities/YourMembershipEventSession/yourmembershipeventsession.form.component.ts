import { Component } from '@angular/core';
import { YourMembershipEventSessionEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Event Sessions') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-yourmembershipeventsession-form',
    templateUrl: './yourmembershipeventsession.form.component.html'
})
export class YourMembershipEventSessionFormComponent extends BaseFormComponent {
    public record!: YourMembershipEventSessionEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'sessionDetails', sectionName: 'Session Details', isExpanded: true },
            { sectionKey: 'schedule', sectionName: 'Schedule', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

