import { Component } from '@angular/core';
import { MJAgentChannelParticipantEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Agent Channel Participants') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjagentchannelparticipant-form',
    templateUrl: './mjagentchannelparticipant.form.component.html'
})
export class MJAgentChannelParticipantFormComponent extends BaseFormComponent {
    public record!: MJAgentChannelParticipantEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

