import { Component } from '@angular/core';
import { constantcontactemail_campaign_activity_non_opener_resendsEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Email Campaign Activity Non Opener Resends') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-constantcontactemail_campaign_activity_non_opener_resends-form',
    templateUrl: './constantcontactemail_campaign_activity_non_opener_resends.form.component.html'
})
export class constantcontactemail_campaign_activity_non_opener_resendsFormComponent extends BaseFormComponent {
    public record!: constantcontactemail_campaign_activity_non_opener_resendsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

