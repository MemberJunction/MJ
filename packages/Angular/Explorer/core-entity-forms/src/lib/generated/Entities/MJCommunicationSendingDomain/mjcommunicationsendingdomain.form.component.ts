import { Component } from '@angular/core';
import { MJCommunicationSendingDomainEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Communication Sending Domains') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjcommunicationsendingdomain-form',
    templateUrl: './mjcommunicationsendingdomain.form.component.html'
})
export class MJCommunicationSendingDomainFormComponent extends BaseFormComponent {
    public record!: MJCommunicationSendingDomainEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

