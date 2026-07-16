import { Component } from '@angular/core';
import { constantcontactemail_campaign_activity_send_historyEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Email Campaign Activity Send Histories') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-constantcontactemail_campaign_activity_send_history-form',
    templateUrl: './constantcontactemail_campaign_activity_send_history.form.component.html'
})
export class constantcontactemail_campaign_activity_send_historyFormComponent extends BaseFormComponent {
    public record!: constantcontactemail_campaign_activity_send_historyEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

