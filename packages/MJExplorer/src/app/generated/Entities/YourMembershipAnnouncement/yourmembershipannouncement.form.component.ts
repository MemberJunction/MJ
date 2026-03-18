import { Component } from '@angular/core';
import { YourMembershipAnnouncementEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Announcements') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-yourmembershipannouncement-form',
    templateUrl: './yourmembershipannouncement.form.component.html'
})
export class YourMembershipAnnouncementFormComponent extends BaseFormComponent {
    public record!: YourMembershipAnnouncementEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'announcementDetails', sectionName: 'Announcement Details', isExpanded: true },
            { sectionKey: 'publicationSchedule', sectionName: 'Publication Schedule', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

