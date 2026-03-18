import { Component } from '@angular/core';
import { YourMembershipCertificationJournalEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Certification Journals') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-yourmembershipcertificationjournal-form',
    templateUrl: './yourmembershipcertificationjournal.form.component.html'
})
export class YourMembershipCertificationJournalFormComponent extends BaseFormComponent {
    public record!: YourMembershipCertificationJournalEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'journalDetails', sectionName: 'Journal Details', isExpanded: true },
            { sectionKey: 'creditsAndTimeline', sectionName: 'Credits and Timeline', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

